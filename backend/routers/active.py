import json

from fastapi import APIRouter
from openai import APIConnectionError, APIStatusError

from agent_state import (
    LOAD_NAMES,
    add_to_history,
    get_state,
    update_summary_and_load,
)
from config import MODEL, client
from models import ActiveFrameRequest, ActiveFrameResponse

router = APIRouter()

ACTIVE_SYSTEM = """\
You are CognitiveCart, an in-store AI shopping assistant. The user is wearing Meta Ray-Ban glasses \
and speaking to you hands-free. Keep responses short and spoken — 1–3 sentences, natural tone, \
no bullet points.

Current context
---------------
Visual summary (last ~2 min):
{summary}

Last assessed load: {load_name} (type {load_type}), confidence {confidence:.2f}

Your job
--------
1. Respond to the user's message. Be concise and helpful.
2. Update the rolling visual summary — plain visual narrative only, max 200 words, no load scores in text.
   Drop oldest sentences when over the limit.
3. Re-assess the cognitive load type and its strength based on the frame AND the user's words.

Load types
----------
0 = none            — walking, glancing, normal movement. Confidence MUST be 0.0.
1 = search          — navigating, wide aisle view, looking for a section or product
2 = comparison      — holding or closely examining 2–3 specific products side by side
3 = choice_overload — a shelf of MANY similar SKUs; scanning many options without picking
4 = comprehension   — ONE product's label or nutrition table fills MOST of the frame

Critical distinctions:
- Many products on a shelf → choice_overload (3), NEVER comprehension (4)
- Single item's label up close → comprehension (4)
- Two items compared in hand → comparison (2)

updated_confidence = strength of the detected load, not classification certainty.
Must be 0.0 when load_type is 0.

Output — valid JSON only:
{{
  "response": "<spoken reply, 1–3 sentences>",
  "updated_summary": "<visual narrative, max 200 words>",
  "updated_load_type": <0|1|2|3|4>,
  "updated_confidence": <0.0–1.0>
}}
"""


def _action_for_load(load_type: int, confidence: float) -> str | None:
    if load_type == 0 or confidence <= 0.7:
        return None
    return "navigate" if load_type == 1 else "scan"


@router.post("/active_frame", response_model=ActiveFrameResponse)
def active_frame(req: ActiveFrameRequest):
    state = get_state()
    load_type = state["load_type"]
    confidence = state["confidence"]
    summary = state["summary"] or "(session just started)"
    history = state["history"]

    system = ACTIVE_SYSTEM.format(
        summary=summary,
        load_name=LOAD_NAMES.get(load_type, "none"),
        load_type=load_type,
        confidence=confidence,
    )

    user_content: list = []
    if req.store_map:
        user_content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{req.store_map}"},
        })
    if req.frame:
        user_content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{req.frame}"},
        })
    user_content.append({"type": "text", "text": req.user_message})

    messages = (
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
        new_summary = parsed.get("updated_summary", summary)
        new_load = int(parsed.get("updated_load_type", 0))
        new_conf = float(parsed.get("updated_confidence", 0.0)) if new_load != 0 else 0.0
        response_text = parsed.get("response", "")

        action = _action_for_load(new_load, new_conf)

        update_summary_and_load(new_summary, new_load, new_conf)
        add_to_history("user", req.user_message)
        add_to_history("assistant", response_text)

        return ActiveFrameResponse(
            response=response_text,
            suggested_action=action,
            updated_summary=new_summary,
            updated_load_type=new_load,
            updated_confidence=new_conf,
        )
    except Exception:
        return ActiveFrameResponse(
            response="Sorry, I couldn't process that. Try again.",
            updated_summary=summary,
            updated_load_type=load_type,
            updated_confidence=confidence,
        )
