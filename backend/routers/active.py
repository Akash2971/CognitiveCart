import json
from collections.abc import Callable

from fastapi import APIRouter
from openai import APIConnectionError, APIStatusError

from agent_state import (
    LOAD_NAMES,
    add_to_history,
    get_pending_actions,
    get_state,
    get_store_map_data,
    set_pending_actions,
    update_summary_and_load,
)
from config import MODEL, client
from models import ActionCall, ActiveFrameRequest, ActiveFrameResponse

router = APIRouter()

# ── Prompts ───────────────────────────────────────────────────────────────── #

ACTIVE_SYSTEM = """\
You are CognitiveCart, an in-store AI shopping assistant. The user is wearing Meta Ray-Ban glasses \
and speaking to you hands-free. Keep responses short and spoken — 1–3 sentences, natural tone, \
no bullet points.

Current context
---------------
Visual summary (last ~2 min):
{summary}

Last assessed load: {load_name} (type {load_type}), confidence {confidence:.2f}

Available tools: {tools_list}

Pending user confirmation: {pending_actions}

Your responsibilities
--------
1. Read the situation: use the frame, visual summary, and detected load to understand what the \
user is struggling with.
2. Reduce their load: answer their question or trigger the right tool. If a tool can help, use it \
— don't just describe what the tool could do.
3. Update the visual summary with what you now see. Plain narrative only, no scores.
4. Re-assess load type and confidence from the frame and what the user said.

Tool rules
----------
- When confidence is below 0.7, ask clarifying questions instead of using a tool.
- Use "execute_actions" for tools that fire immediately (no confirmation needed).
- Use "suggested_actions" for tools marked "(ask user first)" — ask the user a yes/no question \
in your response (e.g. "Want me to scan this?"), put the action in suggested_actions.
- If "Pending user confirmation" is non-empty and the user agrees, move those actions to \
execute_actions immediately. If the user declines, leave both lists empty.
- Each action: {{"name": "<tool>", "args": {{...}}}}. Include relevant args (e.g. {{"product": "wine"}}).
- Never answer from your own knowledge what a tool is meant to provide.
- If a product analysis or comparison result already appears in the conversation history, \
answer follow-up questions from that result — do not suggest scanning again.

Load types
----------
0 = none            — walking, glancing, normal movement. Confidence MUST be 0.0.
1 = search          — navigating, wide aisle view, looking for a section or product
2 = comparison      — holding or closely examining 2–3 specific products side by side
3 = choice_overload — a shelf of MANY similar SKUs; scanning many options without picking
4 = comprehension   — ONE product's label or nutrition table fills MOST of the frame

Output — valid JSON only:
{{
  "response": "<spoken reply, 1–3 sentences>",
  "execute_actions": [],
  "suggested_actions": [],
  "updated_summary": "<visual narrative, max 200 words>",
  "updated_load_type": <0|1|2|3|4>, // load type of the detected load
  "updated_confidence": <0.0–1.0>  // confidence score of the detected load
}}

Only populate execute_actions or suggested_actions when updated_confidence > 0.7. Otherwise both are empty lists.
"""

NAVIGATE_SYSTEM = """\
You are CognitiveCart's navigation assistant. Your only job is to tell the user exactly where \
to go using the store map data provided.

Visual context (what the user has been doing):
{summary}

Guidelines:
- Use ONLY aisle IDs that appear in the store map below. Never invent or guess aisle identifiers.
- Name the exact aisle ID and section from the map data.
- Add one orientation cue if helpful (e.g. "on your left", "past checkout").
- 1 sentence only, natural spoken tone.
- End with the destination — never say "I'll guide you there" or "follow me".
- If the product isn't in the map data, say so and suggest asking a store employee.
"""


# ── Tool specs ────────────────────────────────────────────────────────────── #
# kind:         "response" → handler returns spoken text
#               "action"   → handler returns a frontend action string, no LLM call
# confirmation: True → model must get user agreement before firing

TOOL_SPECS: dict[str, dict] = {
    "navigate": {
        "description": "look up the product's aisle from the store map",
        "args": ["product"],
        "kind": "response",
        "confirmation": False,
    },
    "scan_barcode": {
        "description": "scan one or more product barcodes to get nutrition info or compare them",
        "args": [],
        "kind": "action",
        "confirmation": True,
    },
}


# ── Tool handlers ─────────────────────────────────────────────────────────── #
# Signature: (req, summary, tool_args) -> str

def _handle_navigate(req: ActiveFrameRequest, summary: str, tool_args: dict) -> str:
    map_data = get_store_map_data()
    if not map_data:
        return "I don't have the store map yet. Please upload it from the List tab."

    product = tool_args.get("product", "the product you need")

    section_map: dict[str, list[str]] = {}
    for aisle in map_data.get("aisles", []):
        section_map.setdefault(aisle["section"], []).append(aisle["id"])
    map_text = "\n".join(
        f"{section}: {', '.join(sorted(ids, key=lambda x: (x[0], int(x[1:]) if x[1:].isdigit() else 0)))}"
        for section, ids in section_map.items()
    )
    if map_data.get("landmarks"):
        map_text += "\nLandmarks: " + ", ".join(map_data["landmarks"])
    if map_data.get("layout_notes"):
        map_text += f"\nLayout: {map_data['layout_notes']}"

    user_content: list = [{"type": "text", "text": f"Store map:\n{map_text}"}]
    if req.frame:
        user_content.append(
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{req.frame}"}}
        )
    user_content.append({"type": "text", "text": f"Give me directions to: {product}"})

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": NAVIGATE_SYSTEM.format(summary=summary)},
                {"role": "user", "content": user_content},
            ],
            temperature=0.3,
            max_tokens=128,
        )
        return resp.choices[0].message.content.strip()
    except Exception:
        return "I couldn't look up the map right now. Please ask a store employee."


def _handle_scan_barcode(_req: ActiveFrameRequest, _summary: str, _tool_args: dict) -> str:
    return "Sure, go ahead and scan the products."


TOOL_HANDLERS: dict[str, Callable[[ActiveFrameRequest, str, dict], str]] = {
    "navigate": _handle_navigate,
    "scan_barcode": _handle_scan_barcode,
}



# ── Endpoint ──────────────────────────────────────────────────────────────── #

@router.post("/active_frame", response_model=ActiveFrameResponse)
def active_frame(req: ActiveFrameRequest):
    state = get_state()
    load_type = state["load_type"]
    confidence = state["confidence"]
    summary = state["summary"] or "(session just started)"
    history = state["history"]

    available_specs = TOOL_SPECS
    tools_list = (
        ", ".join(
            f'"{n}" — {s["description"]}' + (" (ask user first)" if s["confirmation"] else "")
            for n, s in available_specs.items()
        )
        if available_specs else "none"
    )
    pending = get_pending_actions()
    pending_str = ", ".join(a["name"] for a in pending if "name" in a) if pending else "none"

    system = ACTIVE_SYSTEM.format(
        summary=summary,
        load_name=LOAD_NAMES.get(load_type, "none"),
        load_type=load_type,
        confidence=confidence,
        tools_list=tools_list,
        pending_actions=pending_str,
    )

    user_content: list = []
    if req.frame:
        user_content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{req.frame}"},
        })
    user_content.append({"type": "text", "text": req.user_message})

    messages: list = (
        [{"role": "system", "content": system}]
        + history
        + [{"role": "user", "content": user_content}]
    )

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.5,
            max_tokens=512,
            response_format={"type": "json_object"},
        )
    except APIConnectionError:
        return ActiveFrameResponse(
            response="Can't reach the model server right now.",
            updated_summary=summary,
            updated_load_type=load_type,
            updated_confidence=confidence,
        )
    except APIStatusError as e:
        return ActiveFrameResponse(
            response=f"Model server error {e.status_code}. Try again.",
            updated_summary=summary,
            updated_load_type=load_type,
            updated_confidence=confidence,
        )

    try:
        parsed = json.loads(resp.choices[0].message.content.strip())
    except Exception:
        return ActiveFrameResponse(
            response="Sorry, I couldn't process that. Try again.",
            updated_summary=summary,
            updated_load_type=load_type,
            updated_confidence=confidence,
        )

    new_summary = parsed.get("updated_summary", summary)
    new_load = int(parsed.get("updated_load_type", 0))
    new_conf = float(parsed.get("updated_confidence", 0.0)) if new_load != 0 else 0.0
    response_text = parsed.get("response", "")
    execute_actions: list = parsed.get("execute_actions") or []
    suggested_actions: list = parsed.get("suggested_actions") or []

    print(f"[TOOL] execute={execute_actions} suggested={suggested_actions} conf={new_conf:.2f} msg={req.user_message!r}")

    # ── Execute immediate actions ──────────────────────────────────────────── #
    for action in execute_actions:
        name = action.get("name")
        args = action.get("args") or {}
        spec = available_specs.get(name, {})
        handler = TOOL_HANDLERS.get(name)
        if handler:
            print(f"[TOOL] executing {name} kind={spec.get('kind')} args={args}")
            spoken = handler(req, new_summary, args)
            print(f"[TOOL] result={spoken!r}")
            set_pending_actions([])
            update_summary_and_load(new_summary, new_load, new_conf)
            add_to_history("user", req.user_message)
            add_to_history("assistant", spoken)
            return ActiveFrameResponse(
                response=spoken,
                execute_action=name if spec.get("kind") == "action" else None,
                updated_summary=new_summary,
                updated_load_type=new_load,
                updated_confidence=new_conf,
            )

    # ── Normal response (pass suggested_actions to frontend) ───────────────── #
    set_pending_actions(suggested_actions)
    update_summary_and_load(new_summary, new_load, new_conf)
    add_to_history("user", req.user_message)
    add_to_history("assistant", response_text)

    return ActiveFrameResponse(
        response=response_text,
        suggested_actions=[ActionCall(name=a["name"], args=a.get("args") or {}) for a in suggested_actions if "name" in a],
        updated_summary=new_summary,
        updated_load_type=new_load,
        updated_confidence=new_conf,
    )
