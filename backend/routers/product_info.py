import json

from fastapi import APIRouter
from openai import APIConnectionError, APIStatusError

from config import GROQ_TEXT_MODEL as MODEL, groq_client as client
from models import ProductInfoRequest, ProductInfoResponse, ProductSummary

router = APIRouter()

PRODUCT_INFO_SYSTEM = """\
You are a nutrition assistant helping a shopper in a grocery store.
You will receive one or more products with their nutritional data.

Your job
--------
- For each product: write one short, spoken sentence summarising its nutritional profile. \
Focus on the most meaningful signals: nutriscore (A=best, E=worst), nova score \
(1=unprocessed, 4=ultra-processed), and standout nutrients (high protein, high sugar, etc.).
- If there are 2 or more products: write a "comparison" field that ranks them and gives a \
clear recommendation. Name the winner and why. 2 sentences max.
- "spoken_response": the single string the assistant will speak aloud. \
  - 1 product → spoken version of its summary.
  - 2+ products → spoken version of the comparison, referencing product names.
- Natural spoken tone. No bullet points. No technical jargon.

{context_block}

Output — valid JSON only:
{{
  "products": [
    {{"name": "<product name>", "summary": "<1 spoken sentence>"}},
    ...
  ],
  "comparison": "<ranking + recommendation, 2 sentences>" or null,
  "spoken_response": "<TTS-ready string>"
}}
"""


def _format_product(p) -> str:
    parts = [f"Name: {p.name}"]
    if p.brand:
        parts.append(f"Brand: {p.brand}")
    if p.nutriscore:
        parts.append(f"Nutriscore: {p.nutriscore.upper()}")
    if p.nova is not None:
        parts.append(f"Nova: {p.nova}")
    nutrients = []
    if p.calories is not None:
        nutrients.append(f"calories {p.calories}kcal")
    if p.fat is not None:
        nutrients.append(f"fat {p.fat}g")
    if p.saturated_fat is not None:
        nutrients.append(f"sat.fat {p.saturated_fat}g")
    if p.sugars is not None:
        nutrients.append(f"sugars {p.sugars}g")
    if p.protein is not None:
        nutrients.append(f"protein {p.protein}g")
    if p.salt is not None:
        nutrients.append(f"salt {p.salt}g")
    if nutrients:
        parts.append("Per 100g: " + ", ".join(nutrients))
    return " | ".join(parts)


@router.post("/product_info", response_model=ProductInfoResponse)
def product_info(req: ProductInfoRequest):
    context_block = f"Context: {req.context}" if req.context else ""
    system = PRODUCT_INFO_SYSTEM.format(context_block=context_block)

    products_text = "\n\n".join(
        f"Product {i + 1}:\n{_format_product(p)}"
        for i, p in enumerate(req.products)
    )

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": products_text},
            ],
            temperature=0.3,
            max_tokens=2048,
            extra_body={"reasoning_effort": "low"},
            response_format={"type": "json_object"},
        )
    except (APIConnectionError, APIStatusError) as e:
        fallback = "I couldn't analyse those products right now. Please try again."
        return ProductInfoResponse(
            products=[ProductSummary(name=p.name, summary="") for p in req.products],
            spoken_response=fallback,
        )

    try:
        parsed = json.loads(resp.choices[0].message.content.strip())
        product_summaries = [
            ProductSummary(name=p.get("name", ""), summary=p.get("summary", ""))
            for p in parsed.get("products", [])
        ]
        comparison = parsed.get("comparison") or None
        spoken = parsed.get("spoken_response", "")

        return ProductInfoResponse(
            products=product_summaries,
            comparison=comparison,
            spoken_response=spoken,
        )
    except Exception:
        fallback = "I couldn't analyse those products right now. Please try again."
        return ProductInfoResponse(
            products=[ProductSummary(name=p.name, summary="") for p in req.products],
            spoken_response=fallback,
        )
