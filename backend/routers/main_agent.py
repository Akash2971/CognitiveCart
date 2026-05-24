import json
from fastapi import APIRouter
from config import MODEL, client
from database import get_user_profile
from models import PTTRequest, PTTResponse

router = APIRouter()

SYSTEM = """\
You are CognitiveCart, a grocery shopping assistant. The user is wearing smart glasses \
and talking to you hands-free. Keep every response under 2 sentences. Spoken tone only — \
no lists, no bullet points.

USER PROFILE:
Goals: {goals}
Restrictions: {restrictions}
Priorities: {priorities}

TOOLS AVAILABLE TO THE USER (buttons on their phone):
- Location button: shows which aisle a product category is in
- Start Assistance button: scans the shelf they are looking at
- Barcode button: scans a product barcode for details or comparison

RULES:
- Only answer grocery shopping questions.
- Never make up product names, nutrition facts, or store layouts.
- Tap Location → when user wants to find, locate, or navigate to a product or aisle \
(e.g. "where is X", "I need to find X", "how do I get to X").
- Tap Start Assistance → when user is looking at a shelf and wants a recommendation \
(e.g. "what should I pick", "which one is better", "help me choose").
- Tap Barcode → when user wants details or comparison on a specific product \
(e.g. "is this healthy", "scan this", "what's in this").
- Always end your response with the button suggestion when one applies.
- For anything out of scope say: "I can only help with grocery shopping — \
use Location, Start Assistance, or Barcode for product help."
"""


@router.post("/ptt", response_model=PTTResponse)
def ptt(req: PTTRequest):
    profile = get_user_profile()
    system = SYSTEM.format(
        goals=", ".join(profile["goals"]) or "none set",
        restrictions=", ".join(profile["restrictions"]) or "none",
        priorities=", ".join(profile["priorities"]) or "none set",
    )

    messages = [{"role": "system", "content": system}]
    for m in req.history[-10:]:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": req.user_message})

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.4,
            max_tokens=128,
        )
        return PTTResponse(response=resp.choices[0].message.content.strip())
    except Exception as e:
        return PTTResponse(response="Sorry, I couldn't process that. Please try again.")
