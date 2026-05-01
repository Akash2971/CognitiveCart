import json
import sqlite3
from typing import Optional

from rapidfuzz import fuzz, process

from config import DB_PATH


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def upsert_scanned_product(barcode: str, p: dict) -> None:
    n = p.get("nutrition_per_100g", {})
    conn = get_db()
    conn.execute(
        """
        INSERT INTO scanned_products
          (barcode, name, brand, size, serving, nutriscore, nova, ingredients,
           allergens, labels, categories,
           calories, fat, saturated_fat, carbs, sugars, fiber, protein, salt, sodium)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(barcode) DO UPDATE SET
          name=excluded.name, brand=excluded.brand, size=excluded.size,
          serving=excluded.serving, nutriscore=excluded.nutriscore, nova=excluded.nova,
          ingredients=excluded.ingredients, allergens=excluded.allergens,
          labels=excluded.labels, categories=excluded.categories,
          calories=excluded.calories, fat=excluded.fat,
          saturated_fat=excluded.saturated_fat, carbs=excluded.carbs,
          sugars=excluded.sugars, fiber=excluded.fiber, protein=excluded.protein,
          salt=excluded.salt, sodium=excluded.sodium
        """,
        (
            barcode,
            p.get("name"), p.get("brand"), p.get("size"), p.get("serving"),
            p.get("nutriscore"), p.get("nova"), p.get("ingredients"),
            json.dumps(p.get("allergens", [])),
            json.dumps(p.get("labels", [])),
            json.dumps(p.get("categories", [])),
            n.get("calories"), n.get("fat"), n.get("saturated_fat"),
            n.get("carbs"), n.get("sugars"), n.get("fiber"),
            n.get("protein"), n.get("salt"), n.get("sodium"),
        ),
    )
    conn.commit()
    conn.close()


def update_scanned_price(barcode: str, price: float) -> None:
    conn = get_db()
    conn.execute("UPDATE scanned_products SET price=? WHERE barcode=?", (price, barcode))
    conn.commit()
    conn.close()


def get_scanned_product(barcode: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM scanned_products WHERE barcode=?", (barcode,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def clear_scanned_products() -> None:
    conn = get_db()
    conn.execute("DELETE FROM scanned_products")
    conn.commit()
    conn.close()


def get_all_scanned_products() -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM scanned_products ORDER BY scanned_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def fuzzy_match_product(brand: str, item_name: str) -> tuple:
    """Fuzzy match brand+item against products table. Returns (row, score)."""
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
    result = process.extractOne(brand, candidates, scorer=fuzz.token_set_ratio)

    if result is None:
        return None, 0.0

    _best_text, score, best_id = result
    if score < 50:
        return None, score / 100

    matched_row = next(r for r in rows if r["id"] == best_id)
    return dict(matched_row), score / 100


def log_detection(
    session_id: str,
    item: str,
    brand: Optional[str],
    raw_text: str,
    product_id: Optional[int],
    matched: bool,
    confidence: float,
):
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
