#!/usr/bin/env python3
"""Scan barcode images → extract price via vision → save barcode:price mapping to price_map.json."""
import os, json, base64, time
from routers.barcode import _read_barcode
from config import groq_client, GROQ_VISION_MODEL

RATE_LIMIT_DELAY = 5  # seconds between vision calls

BASE = "barcode images"
OUTPUT = "price_map.json"

FOLDERS = ["jam", "cereals", "granola", "pasta_sauce"]

PRICE_PROMPT = """\
Look at this product image. Find the price tag or price label visible anywhere in the image.
Return ONLY valid JSON: {"price": <number>} — e.g. {"price": 3.99}
If no price is visible, return {"price": null}.
Do not include currency symbols, just the number."""


def read_image_b64(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def extract_price(b64: str) -> float | None:
    try:
        resp = groq_client.chat.completions.create(
            model=GROQ_VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                    {"type": "text", "text": PRICE_PROMPT},
                ],
            }],
            temperature=0,
            max_tokens=64,
            response_format={"type": "json_object"},
        )
        result = json.loads(resp.choices[0].message.content.strip())
        return result.get("price")
    except Exception as e:
        print(f"    vision error: {e}")
        return None


# ── Load existing mapping if re-running ──────────────────────────────────── #
if os.path.exists(OUTPUT):
    with open(OUTPUT) as f:
        price_map = json.load(f)
    print(f"Resuming — {len(price_map)} entries already mapped\n")
else:
    price_map = {}

# ── Process each folder ───────────────────────────────────────────────────── #
for folder in FOLDERS:
    folder_path = os.path.join(BASE, folder)
    if not os.path.isdir(folder_path):
        print(f"[{folder}] not found — skipping")
        continue

    images = sorted(f for f in os.listdir(folder_path) if f.lower().endswith((".jpg", ".jpeg", ".png")))
    print(f"[{folder}] {len(images)} images")

    for name in images:
        path = os.path.join(folder_path, name)
        b64 = read_image_b64(path)

        barcode = _read_barcode(b64)
        if not barcode:
            print(f"  ✗ {name} → no barcode detected")
            continue

        if barcode in price_map:
            print(f"  ~ {name} → {barcode} already mapped (${price_map[barcode]})")
            continue

        price = extract_price(b64)
        price_map[barcode] = price

        with open(OUTPUT, "w") as f:
            json.dump(price_map, f, indent=2)

        print(f"  ✓ {name} → {barcode} → ${price}")
        time.sleep(RATE_LIMIT_DELAY)

    print()

print(f"Done. {len(price_map)} barcodes mapped → {OUTPUT}")
print(f"No price found: {sum(1 for v in price_map.values() if v is None)} entries")
