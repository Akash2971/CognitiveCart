import json

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from openai import APIConnectionError, APIStatusError

from config import GROQ_TEXT_MODEL as MODEL, groq_client as client
from models import ChatRequest, ChatResponse

router = APIRouter()

PLANNING_SYSTEM = """You are CognitiveCart, a warm and helpful AI grocery shopping assistant in the planning phase.

Your goal is to understand what the user needs and help them build a shopping list through natural conversation.

BEFORE giving any recipe or ingredient list, you MUST know: (1) the specific dish variation (e.g. chicken vs mutton vs veg), (2) any dietary restrictions. If the user hasn't told you these, ask. One question at a time. Do not assume.

Items already confirmed on their list: {confirmed}
Items suggested but not yet acted on (user moved on without adding or skipping): {pending}

Response types — pick exactly ONE per response:
1. CLARIFY: Use this whenever the user's intent is ambiguous or underspecified — do NOT assume. Ask one short, natural question to narrow it down. Only proceed to other types once you have enough detail.
2. SUGGESTIONS: User wants ideas but hasn't named a dish (e.g. "something healthy", "a quick dinner") → put 4-6 dish name options in "suggestions", short intro in "response".
3. NORMAL: User has named a specific, fully-specified dish → put a 2-sentence dish description in "response", cooking steps in "steps", tips in "tips", and ALL ingredients in "proposals". NEVER write ingredient names inside "response" or "steps" — they belong ONLY in "proposals".
4. AUTO_ADD: User EXPLICITLY states items they need ("I need X", "add X") → put those items in "auto_add", acknowledge briefly in "response".
5. CONFIRM: User confirms pending items (ok/yes/sure/add/go ahead) and pending is not "none" → put pending items in "auto_add", acknowledge briefly in "response".

Other rules:
- NEVER list ingredients as text in "response" — always use "proposals" array
- proposals must be [] only when not doing a NORMAL response
- For NORMAL responses, proposals must include every ingredient from scratch
- When confirmed list has 2+ items and conversation winds down, suggest the Capture tab
- Never say "I've added X to your list" — the app handles that
- If pending items exist on a NORMAL response, re-include them in "proposals"

CRITICAL: Respond ONLY with valid JSON, no other text:
{{
  "response": "<2-sentence dish description, or short conversational reply>",
  "steps": ["Step 1 text", "Step 2 text"],
  "tips": ["Tip 1 text"],
  "suggestions": ["Dish Name 1", "Dish Name 2"],
  "proposals": ["ingredient1", "ingredient2"],
  "auto_add": ["item1"]
}}

Rules:
- suggestions are dish names (title case), not ingredients
- proposals and auto_add are simple lowercase item name strings
- suggestions must be [] unless doing a SUGGESTIONS response
- proposals must be [] unless doing a NORMAL response
- steps and tips must be [] unless doing a NORMAL response
- For simple replies keep response brief (1-2 sentences)
"""


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    confirmed = ", ".join(req.confirmed_list) if req.confirmed_list else "none yet"
    pending   = ", ".join(req.pending_proposals) if req.pending_proposals else "none"
    system = PLANNING_SYSTEM.format(confirmed=confirmed, pending=pending)

    messages = [{"role": "system", "content": system}] + [
        {"role": m.role, "content": m.content} for m in req.messages
    ]

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.7,
            max_tokens=4096,
            response_format={"type": "json_object"},
        )
    except APIConnectionError:
        return ChatResponse(
            response="⚠️ Can't reach the AI model server. Make sure the Cloudflare tunnel and vLLM are running on Delta.",
            proposals=[], auto_add=[],
        )
    except APIStatusError as e:
        return ChatResponse(
            response=f"⚠️ Model server error ({e.status_code}): {e.message}",
            proposals=[], auto_add=[],
        )

    raw = response.choices[0].message.content.strip()
    print("RAW RESPONSE:", raw[:1000])

    try:
        parsed = json.loads(raw)

        proposals   = [x if isinstance(x, str) else x.get("name", "") for x in parsed.get("proposals", [])]
        auto_add    = [x if isinstance(x, str) else x.get("name", "") for x in parsed.get("auto_add", [])]
        suggestions = [x for x in parsed.get("suggestions", []) if isinstance(x, str) and x]

        intro = parsed.get("response", "")
        steps = parsed.get("steps", [])
        tips  = parsed.get("tips", [])

        parts = [intro] if intro else []
        if steps:
            parts.append("Steps:\n" + "\n".join(f"{i+1}. {s}" for i, s in enumerate(steps)))
        if tips:
            parts.append("Tips:\n" + "\n".join(f"• {t}" for t in tips))
        full_response = "\n\n".join(parts)

        return ChatResponse(
            response=full_response,
            proposals=[p for p in proposals if p],
            auto_add=[a for a in auto_add if a],
            suggestions=suggestions,
        )
    except Exception:
        return ChatResponse(response=raw, proposals=[], auto_add=[])
