import json
import uuid
from typing import Optional

from fastapi import APIRouter

from config import client, MODEL
from database import fuzzy_match_product, log_detection
from models import DetectRequest, DetectedItem, DetectResponse

router = APIRouter()

DETECT_SYSTEM = """You are a product detection assistant in a grocery store.
You will be given an image and a list of product categories to look for.
For each category visible in the image, identify the brand name.
Respond ONLY with valid JSON in this exact format:
{
  "detections": [
    {"item": "<category name from the list>", "brand": "<brand name or null>"}
  ]
}
Only include items that are actually visible in the image.
If nothing from the list is visible, return {"detections": []}.
"""


def call_vlm(image_b64: str, items: list[str]) -> list[dict]:
    items_str = ", ".join(items)
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": DETECT_SYSTEM},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                    },
                    {
                        "type": "text",
                        "text": f"Look for these items: {items_str}",
                    },
                ],
            },
        ],
        temperature=0.1,
        max_tokens=512,
    )
    raw = response.choices[0].message.content.strip()
    parsed = json.loads(raw)
    return parsed.get("detections", [])


@router.post("/detect", response_model=DetectResponse)
def detect(req: DetectRequest):
    session_id = req.session_id or str(uuid.uuid4())
    vlm_detections = call_vlm(req.image, req.items)

    results: list[DetectedItem] = []
    for det in vlm_detections:
        item = det.get("item", "").lower()
        brand = det.get("brand")

        product, confidence = fuzzy_match_product(brand or "", item)
        product_id = product["id"] if product else None
        matched = product is not None

        log_detection(session_id, item, brand, json.dumps(det),
                      product_id, matched, confidence)

        results.append(DetectedItem(
            item=item,
            brand=brand,
            product_id=product_id,
            matched=matched,
            confidence=confidence,
            product=product,
        ))

    return DetectResponse(session_id=session_id, detections=results)
