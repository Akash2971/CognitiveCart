"""
Run once to populate catalog and store_locations tables.
Usage: python seed_catalog.py
"""
import json
import sqlite3
import os

DB_PATH = os.getenv("DB_PATH", "products.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


CATALOG = [
    # ── Yogurt ────────────────────────────────────────────────────────────── #
    {"name": "Plain Greek Yogurt 0%", "brand": "Chobani", "category": "yogurt",
     "calories": 59, "protein": 10, "fat": 0, "saturated_fat": 0,
     "sugars": 4, "fiber": 0, "sodium": 41, "carbs": 4,
     "tags": ["high-protein", "low-fat", "low-sugar"],
     "search_keywords": ["chobani", "plain", "greek", "nonfat"]},

    {"name": "Total 0% Plain Greek Yogurt", "brand": "Fage", "category": "yogurt",
     "calories": 59, "protein": 10, "fat": 0, "saturated_fat": 0,
     "sugars": 4, "fiber": 0, "sodium": 45, "carbs": 4,
     "tags": ["high-protein", "low-fat", "minimal-ingredients"],
     "search_keywords": ["fage", "total", "plain", "greek", "nonfat"]},

    {"name": "Triple Zero Vanilla Greek Yogurt", "brand": "Oikos", "category": "yogurt",
     "calories": 60, "protein": 10, "fat": 0, "saturated_fat": 0,
     "sugars": 0, "fiber": 0, "sodium": 50, "carbs": 7,
     "tags": ["high-protein", "zero-sugar", "low-fat"],
     "search_keywords": ["oikos", "triple", "zero", "vanilla", "greek"]},

    {"name": "Plain Nonfat Skyr", "brand": "Siggi's", "category": "yogurt",
     "calories": 67, "protein": 11, "fat": 0, "saturated_fat": 0,
     "sugars": 3, "fiber": 0, "sodium": 50, "carbs": 5,
     "tags": ["high-protein", "low-sugar", "minimal-ingredients", "icelandic"],
     "search_keywords": ["siggi", "plain", "nonfat", "skyr", "icelandic"]},

    {"name": "Strawberry Lowfat Yogurt", "brand": "Yoplait", "category": "yogurt",
     "calories": 100, "protein": 3, "fat": 1.5, "saturated_fat": 1,
     "sugars": 15, "fiber": 0, "sodium": 80, "carbs": 18,
     "tags": ["low-protein", "high-sugar"],
     "search_keywords": ["yoplait", "strawberry", "lowfat", "original"]},

    # ── Cereal ────────────────────────────────────────────────────────────── #
    {"name": "Original Cheerios", "brand": "General Mills", "category": "cereal",
     "calories": 375, "protein": 13, "fat": 6, "saturated_fat": 1,
     "sugars": 5, "fiber": 10, "sodium": 250, "carbs": 73,
     "tags": ["low-sugar", "whole-grain", "heart-healthy"],
     "search_keywords": ["cheerios", "original", "general mills", "oat"]},

    {"name": "Original Special K", "brand": "Kellogg's", "category": "cereal",
     "calories": 375, "protein": 17, "fat": 1, "saturated_fat": 0,
     "sugars": 15, "fiber": 4, "sodium": 500, "carbs": 78,
     "tags": ["high-protein", "low-fat"],
     "search_keywords": ["special k", "kellogg", "original", "rice"]},

    {"name": "Go Lean Crunch Cereal", "brand": "Kashi", "category": "cereal",
     "calories": 357, "protein": 26, "fat": 4, "saturated_fat": 0,
     "sugars": 10, "fiber": 19, "sodium": 214, "carbs": 57,
     "tags": ["high-protein", "high-fiber", "low-fat", "whole-grain"],
     "search_keywords": ["kashi", "go lean", "crunch", "protein", "fiber"]},

    {"name": "Frosted Mini-Wheats", "brand": "Kellogg's", "category": "cereal",
     "calories": 367, "protein": 10, "fat": 1, "saturated_fat": 0,
     "sugars": 20, "fiber": 9, "sodium": 5, "carbs": 80,
     "tags": ["high-fiber", "whole-grain", "high-sugar"],
     "search_keywords": ["frosted", "mini wheats", "kellogg", "wheat"]},

    {"name": "Original Bran Flakes", "brand": "Post", "category": "cereal",
     "calories": 355, "protein": 10, "fat": 2, "saturated_fat": 0,
     "sugars": 14, "fiber": 17, "sodium": 430, "carbs": 73,
     "tags": ["high-fiber", "low-fat", "whole-grain"],
     "search_keywords": ["bran flakes", "post", "original", "bran"]},

    # ── Cooking Oil ───────────────────────────────────────────────────────── #
    {"name": "Extra Virgin Olive Oil", "brand": "Pompeian", "category": "cooking_oil",
     "calories": 884, "protein": 0, "fat": 100, "saturated_fat": 14,
     "sugars": 0, "fiber": 0, "sodium": 0, "carbs": 0,
     "tags": ["heart-healthy", "antioxidants", "mediterranean"],
     "search_keywords": ["pompeian", "extra virgin", "olive oil", "evoo"]},

    {"name": "100% Pure Avocado Oil", "brand": "Chosen Foods", "category": "cooking_oil",
     "calories": 884, "protein": 0, "fat": 100, "saturated_fat": 11,
     "sugars": 0, "fiber": 0, "sodium": 0, "carbs": 0,
     "tags": ["heart-healthy", "high-smoke-point", "refined"],
     "search_keywords": ["chosen foods", "avocado oil", "pure", "refined"]},

    {"name": "Pure Vegetable Oil", "brand": "Crisco", "category": "cooking_oil",
     "calories": 884, "protein": 0, "fat": 100, "saturated_fat": 7,
     "sugars": 0, "fiber": 0, "sodium": 0, "carbs": 0,
     "tags": ["budget-friendly", "neutral-flavor", "high-smoke-point"],
     "search_keywords": ["crisco", "vegetable oil", "pure", "soybean"]},

    {"name": "Organic Virgin Coconut Oil", "brand": "Nutiva", "category": "cooking_oil",
     "calories": 862, "protein": 0, "fat": 100, "saturated_fat": 90,
     "sugars": 0, "fiber": 0, "sodium": 0, "carbs": 0,
     "tags": ["high-saturated-fat", "organic", "medium-chain-triglycerides"],
     "search_keywords": ["nutiva", "coconut oil", "organic", "virgin"]},

    {"name": "100% Pure Olive Oil", "brand": "Kirkland", "category": "cooking_oil",
     "calories": 884, "protein": 0, "fat": 100, "saturated_fat": 14,
     "sugars": 0, "fiber": 0, "sodium": 0, "carbs": 0,
     "tags": ["heart-healthy", "budget-friendly"],
     "search_keywords": ["kirkland", "pure olive oil", "costco", "signature"]},

    # ── Protein Shake ─────────────────────────────────────────────────────── #
    {"name": "Core Power Elite 42g Protein", "brand": "Fairlife", "category": "protein_shake",
     "calories": 71, "protein": 13, "fat": 2, "saturated_fat": 1,
     "sugars": 2.5, "fiber": 0, "sodium": 60, "carbs": 5,
     "tags": ["ultra-high-protein", "low-sugar", "real-milk", "lactose-free"],
     "search_keywords": ["fairlife", "core power", "elite", "42g", "protein"]},

    {"name": "Chocolate Shake 30g Protein", "brand": "Premier Protein", "category": "protein_shake",
     "calories": 49, "protein": 9.2, "fat": 0.9, "saturated_fat": 0.3,
     "sugars": 1.5, "fiber": 0.3, "sodium": 130, "carbs": 3.1,
     "tags": ["high-protein", "low-sugar", "low-calorie"],
     "search_keywords": ["premier protein", "chocolate", "shake", "30g"]},

    {"name": "Genuine Chocolate Protein Shake", "brand": "Muscle Milk", "category": "protein_shake",
     "calories": 46, "protein": 7.7, "fat": 1.4, "saturated_fat": 0.5,
     "sugars": 0.6, "fiber": 0, "sodium": 86, "carbs": 2.8,
     "tags": ["high-protein", "low-sugar", "low-carb"],
     "search_keywords": ["muscle milk", "genuine", "chocolate", "protein"]},

    {"name": "Dark Chocolate Plant Protein Shake", "brand": "OWYN", "category": "protein_shake",
     "calories": 55, "protein": 6.2, "fat": 2.2, "saturated_fat": 0.3,
     "sugars": 1.5, "fiber": 1.8, "sodium": 105, "carbs": 5,
     "tags": ["vegan", "plant-based", "high-protein", "allergen-free"],
     "search_keywords": ["owyn", "dark chocolate", "plant protein", "vegan"]},

    {"name": "Organic Protein Chocolate Shake", "brand": "Orgain", "category": "protein_shake",
     "calories": 46, "protein": 8, "fat": 1.5, "saturated_fat": 0.5,
     "sugars": 0, "fiber": 0, "sodium": 92, "carbs": 3.1,
     "tags": ["organic", "plant-based", "zero-sugar", "high-protein"],
     "search_keywords": ["orgain", "organic", "chocolate", "plant protein", "zero sugar"]},
]

STORE_LOCATIONS = [
    {"category": "yogurt",        "aisle": "Aisle 12",        "landmarks": "Near the back-left wall, next to milk"},
    {"category": "cereal",        "aisle": "Aisle 5",         "landmarks": "Center of the store, left side"},
    {"category": "cooking_oil",   "aisle": "Aisle 8",         "landmarks": "Next to pasta sauces and condiments"},
    {"category": "protein_shake", "aisle": "Aisle 3",         "landmarks": "Natural foods section near the entrance"},
]


def seed():
    conn = get_db()

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS catalog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            brand TEXT NOT NULL,
            category TEXT NOT NULL,
            calories REAL, protein REAL, fat REAL,
            saturated_fat REAL, sugars REAL, fiber REAL,
            sodium REAL, carbs REAL,
            tags TEXT DEFAULT '[]',
            search_keywords TEXT DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS store_locations (
            category TEXT PRIMARY KEY,
            aisle TEXT NOT NULL,
            landmarks TEXT
        );
        CREATE TABLE IF NOT EXISTS user_profile (
            id INTEGER PRIMARY KEY DEFAULT 1,
            goals TEXT DEFAULT '[]',
            restrictions TEXT DEFAULT '[]',
            priorities TEXT DEFAULT '[]'
        );
        INSERT OR IGNORE INTO user_profile (id) VALUES (1);
    """)

    for p in CATALOG:
        existing = conn.execute(
            "SELECT id FROM catalog WHERE LOWER(name)=LOWER(?) AND LOWER(brand)=LOWER(?)",
            (p["name"], p["brand"])
        ).fetchone()
        if not existing:
            conn.execute(
                """INSERT INTO catalog
                   (name, brand, category, calories, protein, fat, saturated_fat,
                    sugars, fiber, sodium, carbs, tags, search_keywords)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    p["name"], p["brand"], p["category"],
                    p["calories"], p["protein"], p["fat"], p["saturated_fat"],
                    p["sugars"], p["fiber"], p["sodium"], p["carbs"],
                    json.dumps(p["tags"]), json.dumps(p["search_keywords"]),
                ),
            )
            print(f"  + {p['brand']} {p['name']}")
        else:
            print(f"  ~ {p['brand']} {p['name']} (already exists)")

    for loc in STORE_LOCATIONS:
        conn.execute(
            """INSERT OR REPLACE INTO store_locations (category, aisle, landmarks)
               VALUES (?,?,?)""",
            (loc["category"], loc["aisle"], loc.get("landmarks")),
        )
        print(f"  + location: {loc['category']} → {loc['aisle']}")

    conn.commit()
    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    print(f"Seeding {DB_PATH}...")
    seed()
