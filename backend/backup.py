import json

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from openai import APIConnectionError, APIStatusError

from config import client, MODEL
from models import ChatRequest, ChatResponse

router = APIRouter()

PLANNING_SYSTEM = """You are CognitiveCart, a warm and helpful AI grocery shopping assistant in the planning phase.

Your goal is to understand what the user needs and help them build a shopping list through natural conversation.

Items already confirmed on their list: {confirmed}
Items suggested but not yet acted on (user moved on without adding or skipping): {pending}

Response types — pick exactly ONE per response:
1. SUGGESTIONS: User request is vague (e.g. "something healthy", "a quick dinner") → put 4-6 dish names in "suggestions", short intro in "response".
2. NORMAL: User names a specific dish OR asks to see/modify/show the ingredient list again → put a 2-sentence description in "response", put 5-8 cooking steps in "steps" array, put 2-3 tips in "tips" array, put ALL ingredients in "proposals". NEVER list ingredients as plain text — always use "proposals".
3. AUTO_ADD: User EXPLICITLY states items they need ("I need X", "add X") → put those items in "auto_add", acknowledge briefly in "response".
4. CONFIRM: User confirms pending items (ok/yes/sure/add/go ahead) and pending is not "none" → put pending items in "auto_add", acknowledge briefly in "response".
5. SHOW_INGREDIENTS: User asks to see, modify, or show the ingredient list again → put the ingredients in "proposals", acknowledge briefly in "response". Do NOT list ingredients in "response".

Other rules:
- NEVER put ingredient names in "response" as text — ingredients ALWAYS go in "proposals" array
- For NORMAL responses, proposals must be comprehensive — assume user starts from scratch
- When confirmed list has 2+ items and conversation winds down, suggest the Capture tab
- Never say "I've added X to your list" — the app handles that
- If pending items exist on a NORMAL response, re-include them in "proposals"
- Answer any food/grocery question helpfully

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
- suggestions must be [] for non-suggestion responses
- proposals must be [] for non-normal responses
- steps and tips must be [] for non-normal responses
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
