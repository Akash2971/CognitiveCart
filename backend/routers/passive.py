import json

from fastapi import APIRouter
from openai import APIConnectionError, APIStatusError

from agent_state import (
    LOAD_NAMES,
    add_to_history,
    can_intervene,
    get_state,
    record_intervention,
    update_summary_and_load,
)
from config import MODEL, client
from models import PassiveFrameRequest, PassiveFrameResponse

router = APIRouter()

PASSIVE_SYSTEM = """\
You are CognitiveCart's passive observer. You watch a shopper through their Meta Ray-Ban glasses \
camera in a grocery or retail store.

Current context
---------------
Visual summary (last ~2 min):
{summary}

Last assessed load: {load_name} (type {load_type}), confidence {confidence:.2f}

Your job
--------
1. Watch the frame — what is the shopper focused on right now? Update the visual summary with \
what you see. Plain narrative only, max 200 words, drop oldest sentences when over the limit.
2. Detect cognitive load from the frame. Re-evaluate every frame — don't just carry forward the \
last load type.
3. If the shopper looks stuck, write a short check-in question to offer help.

Load types
----------
0 = none            — walking, glancing around. Confidence MUST be 0.0, response MUST be null.
1 = search          — scanning aisle signs or store sections; no shelf or product in close focus
2 = comparison      — 2 or more products visible and being actively compared; shopper holds or \
alternates between them. NEVER use this for a single product.
3 = choice_overload — a shelf of MANY similar SKUs fills the frame; shopper scanning without picking. \
NEVER use this when the shopper is holding a product.
4 = comprehension   — exactly ONE product's label or nutrition panel fills most of the frame; \
shopper is reading it. NEVER use this when 2+ products are visible or being held.

Critical: the number of products is the deciding factor.
- 2+ products in hand or being compared → always comparison (2), never comprehension (4)
- 1 product label filling the frame → always comprehension (4), never comparison (2)
- Many products on a shelf, none held → always choice_overload (3)

Intervention message
--------------------
- Match the load:
    search          → "Looking for something specific?"
    comparison      → "Want help comparing these?"
    choice_overload → "Too many options? Want me to help narrow it down?"
    comprehension   → "Want me to break down what's on that label?"
- null when load_type is 0

Output — valid JSON only:
{{
  "updated_summary": "<visual narrative, max 200 words>",
  "updated_load_type": <0|1|2|3|4>, // load type of the detected load
  "updated_confidence": <0.0–1.0>,  // confidence score of the detected load (cap at 0.65)
  "response": <null or "check-in question, max 12 words">
}}
"""


@router.post("/passive_frame", response_model=PassiveFrameResponse)
def passive_frame(req: PassiveFrameRequest):
    state = get_state()
    load_type = state["load_type"]
    confidence = state["confidence"]
    summary = state["summary"] or "(session just started)"

    system = PASSIVE_SYSTEM.format(
        summary=summary,
        load_name=LOAD_NAMES.get(load_type, "none"),
        load_type=load_type,
        confidence=confidence,
    )

    content = [
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{req.frame}"}},
        {"type": "text", "text": "Analyze this frame and update the context."},
    ]

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": content},
            ],
            temperature=0.2,
            max_tokens=512,
            response_format={"type": "json_object"},
        )
    except (APIConnectionError, APIStatusError):
        return PassiveFrameResponse(
            updated_summary=summary,
            updated_load_type=load_type,
            updated_confidence=confidence,
            intervene=False,
        )

    try:
        parsed = json.loads(resp.choices[0].message.content.strip())
        new_summary = parsed.get("updated_summary", summary)
        new_load = int(parsed.get("updated_load_type", 0))
        raw_conf = float(parsed.get("updated_confidence", 0.0)) if new_load != 0 else 0.0
        new_conf = min(raw_conf, 0.65)  # passive cannot confirm intent — cap below action threshold
        candidate = parsed.get("response") or None

        update_summary_and_load(new_summary, new_load, new_conf)

        # Backend owns all gating — VLM just provides the candidate message
        intervene = (
            candidate is not None
            and new_load != 0
            and new_conf > 0.5
            and can_intervene(new_load)
        )

        if intervene:
            record_intervention(new_load)
            add_to_history("assistant", candidate)

        return PassiveFrameResponse(
            updated_summary=new_summary,
            updated_load_type=new_load,
            updated_confidence=new_conf,
            intervene=intervene,
            response=candidate if intervene else None,
        )
    except Exception:
        return PassiveFrameResponse(
            updated_summary=summary,
            updated_load_type=load_type,
            updated_confidence=confidence,
            intervene=False,
        )
