import json
from fastapi import APIRouter
from config import GROQ_TEXT_MODEL as MODEL, groq_client as client
from database import get_user_profile
from models import BarcodeAnalyzeRequest, BarcodeAnalyzeResponse

router = APIRouter()

SINGLE_SYSTEM = """\
You are CognitiveCart's product analyst. Analyze the product below and tell the user \
whether it fits their profile. Spoken tone, max 2 sentences.

USER PROFILE:
Goals: {goals}
Restrictions: {restrictions}
Priorities: {priorities}

RULES:
- Use ONLY the nutrition data provided. Do not use your training knowledge for specific facts.
- Be specific — cite an actual number from the data.
- End with a clear verdict: TAKE IT, SKIP IT, or CONSIDER IT.

Return valid JSON:
{{"verdict": "take|skip|consider", "winner": null, "reason": "<one sentence with a number>", \
"spoken": "<2 sentence spoken response ending with the verdict>"}}
"""

COMPARE_SYSTEM = """\
You are CognitiveCart's product analyst. Compare the products below and pick the best one \
for the user's profile. Spoken tone, max 2 sentences.

USER PROFILE:
Goals: {goals}
Restrictions: {restrictions}
Priorities: {priorities}

RULES:
- Use ONLY the nutrition data provided. Do not use your training knowledge for specific facts.
- Compare using specific numbers from the data.
- Pick one winner clearly.
- End with a clear verdict: TAKE IT, SKIP IT, or CONSIDER IT for the winner.

Return valid JSON:
{{"verdict": "take|skip|consider", "winner": "<product name>", \
"reason": "<one sentence comparing with specific numbers>", \
"spoken": "<2 sentence spoken response naming the winner and why>"}}
"""


def _format_product(p) -> str:
    n = p if isinstance(p, dict) else p.model_dump()
    parts = [f"{n.get('name', 'Unknown')} by {n.get('brand', 'Unknown')}"]
    fields = [
        ("calories", "kcal"), ("protein", "g protein"), ("fat", "g fat"),
        ("saturated_fat", "g sat fat"), ("sugars", "g sugar"),
        ("salt", "g salt"), ("nova", "NOVA"), ("nutriscore", "Nutriscore"),
    ]
    details = [f"{n.get(k)}{unit}" for k, unit in fields if n.get(k) is not None]
    if details:
        parts.append(": " + ", ".join(str(d) for d in details))
    return "".join(parts)


@router.post("/barcode_analyze", response_model=BarcodeAnalyzeResponse)
def barcode_analyze(req: BarcodeAnalyzeRequest):
    if not req.products:
        return BarcodeAnalyzeResponse(
            verdict="consider", reason="No products provided.", spoken="No products to analyze."
        )

    profile = get_user_profile()
    profile_vars = dict(
        goals=", ".join(profile["goals"]) or "none set",
        restrictions=", ".join(profile["restrictions"]) or "none",
        priorities=", ".join(profile["priorities"]) or "none set",
    )

    is_single = len(req.products) == 1
    system = (SINGLE_SYSTEM if is_single else COMPARE_SYSTEM).format(**profile_vars)

    product_lines = "\n".join(f"{i+1}. {_format_product(p)}" for i, p in enumerate(req.products))
    user_content = f"PRODUCTS:\n{product_lines}\n\nAnalyze and return JSON."

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
            temperature=0.3,
            max_tokens=2048,
            extra_body={"reasoning_effort": "low"},
            response_format={"type": "json_object"},
        )
        parsed = json.loads(resp.choices[0].message.content.strip())
        return BarcodeAnalyzeResponse(
            verdict=parsed.get("verdict", "consider"),
            winner=parsed.get("winner"),
            reason=parsed.get("reason", ""),
            spoken=parsed.get("spoken", ""),
        )
    except Exception as e:
        import traceback
        print("[barcode_agent] error:", e, flush=True)
        traceback.print_exc()
        return BarcodeAnalyzeResponse(
            verdict="consider",
            reason="Could not analyze.",
            spoken="I couldn't analyze the products right now. Please try again.",
        )
