import base64
import json
import os
import sqlite3
import uuid
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel
from rapidfuzz import fuzz, process

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(
    base_url=os.getenv("VLLM_BASE_URL"),
    api_key=os.getenv("VLLM_API_KEY"),
)
MODEL = os.getenv("VLLM_MODEL")
DB_PATH = os.getenv("DB_PATH", "products.db")


# --------------------------------------------------------------------------- #
# Request / Response models
# --------------------------------------------------------------------------- #

class DetectRequest(BaseModel):
    image: str          # base64 JPEG
    items: list[str]    # e.g. ["olive oil", "yogurt"]
    session_id: Optional[str] = None


class DetectedItem(BaseModel):
    item: str
    brand: Optional[str]
    product_id: Optional[int]
    matched: bool
    confidence: float
    product: Optional[dict]   # full DB row if matched


class DetectResponse(BaseModel):
    session_id: str
    detections: list[DetectedItem]


# --------------------------------------------------------------------------- #
# DB helpers
# --------------------------------------------------------------------------- #

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def fuzzy_match_product(brand: str, item_name: str) -> tuple:
    """Fuzzy match brand+item against products table, return (row, score)."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT p.*, c.name as category_name
        FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE c.name = ?
        """,
        (item_name.lower(),),
    )
    rows = cur.fetchall()
    conn.close()

    if not rows:
        return None, 0.0

    candidates = {r["id"]: f"{r['brand']} {r['name']}" for r in rows}
    query = f"{brand}"
    result = process.extractOne(query, candidates, scorer=fuzz.token_set_ratio)

    if result is None:
        return None, 0.0

    best_text, score, best_id = result
    if score < 50:
        return None, score / 100

    matched_row = next(r for r in rows if r["id"] == best_id)
    return dict(matched_row), score / 100


def log_detection(session_id: str, item: str, brand: Optional[str],
                  raw_text: str, product_id: Optional[int],
                  matched: bool, confidence: float):
    conn = get_db()
    conn.execute(
        """
        INSERT INTO raw_detections
        (session_id, item_name, raw_brand, raw_text, product_id, matched, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (session_id, item, brand, raw_text, product_id, int(matched), confidence),
    )
    conn.commit()
    conn.close()


# --------------------------------------------------------------------------- #
# VLM call
# --------------------------------------------------------------------------- #

SYSTEM_PROMPT = """You are a product detection assistant in a grocery store.
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
            {"role": "system", "content": SYSTEM_PROMPT},
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


# --------------------------------------------------------------------------- #
# Endpoint
# --------------------------------------------------------------------------- #

@app.post("/detect", response_model=DetectResponse)
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


class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    session_id: str
    messages: list[ChatMessage]

class ChatResponse(BaseModel):
    response: str


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    conn = get_db()
    cur = conn.cursor()
    # Best match per product: highest confidence detection, one row per product
    cur.execute(
        """
        SELECT p.*, c.name as category_name, MAX(rd.confidence) as best_confidence
        FROM raw_detections rd
        JOIN products p ON rd.product_id = p.id
        JOIN categories c ON p.category_id = c.id
        WHERE rd.session_id = ? AND rd.matched = 1
        GROUP BY rd.product_id
        ORDER BY best_confidence DESC
        LIMIT 10
        """,
        (req.session_id,),
    )
    products = [dict(r) for r in cur.fetchall()]
    conn.close()

    if products:
        product_lines = "\n".join([
            f"- {p['name']} ({p['brand']}): {p['size']}, ${p['price']}, "
            f"{p['calories']} cal, {p['protein']}g protein, {p['fat']}g fat, "
            f"{p['sugar']}g sugar, {p['sodium']}mg sodium. "
            f"Ingredients: {p['ingredients']}. "
            f"Certifications: {p['certifications'] or 'none'}."
            for p in products
        ])
        context = f"Products found on the shelf:\n{product_lines}"
    else:
        context = "No products have been identified yet."

    system = f"""You are a concise shopping assistant helping a user in a grocery store.
{context}
Answer questions about these products. Compare them when asked. Be brief and practical."""

    messages = [{"role": "system", "content": system}] + [
        {"role": m.role, "content": m.content} for m in req.messages
    ]

    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.7,
        max_tokens=512,
    )
    return ChatResponse(response=response.choices[0].message.content.strip())


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL}
