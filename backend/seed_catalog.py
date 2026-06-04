#!/usr/bin/env python3
"""Seed catalog from barcode images folder. Scans images → fetches full OFF data → inserts into DB.
Re-run safely: progress is checkpointed to seed_progress.json so only failed items are retried."""
import os, json, requests, time, sqlite3
from routers.barcode import _read_barcode

BASE = "barcode images"
DB_PATH = "products.db"
PROGRESS_FILE = "seed_progress.json"
OFF_URL = "https://world.openfoodfacts.org/api/v2/product/{}"
OFF_FIELDS = "product_name,brands,serving_size,quantity,nutriments,nutriscore_grade,nova_group,allergens_tags,labels_tags"
OFF_HEADERS = {"User-Agent": "CognitiveCart/0.1 (akash29701@gmail.com)"}

FOLDER_TO_CATEGORY = {
    "yogurt":      "yogurt",
    "milk":        "milk",
    "cheese":      "cheese",
    "jam":         "jam",
    "cereals":     "cereal",
    "granola":     "granola",
    "pasta_sauce": "pasta_sauce",
}


def scan_image(path):
    """Decode barcode directly via zxingcpp — no network call."""
    with open(path, "rb") as f:
        data = f.read()
    import base64
    b64 = base64.b64encode(data).decode()
    barcode = _read_barcode(b64)
    return {"barcode": barcode}


def fetch_off(barcode):
    resp = requests.get(OFF_URL.format(barcode), params={"fields": OFF_FIELDS},
                        headers=OFF_HEADERS, timeout=10)
    if not resp.content:
        return None
    return resp.json()


def strip_prefix(tags, prefix="en:"):
    return [t[len(prefix):] for t in tags if t.startswith(prefix)]


def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {"barcodes": {}, "products": [], "failed_off": []}


def save_progress(progress):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


# ── Load existing progress ────────────────────────────────────────────────── #
progress = load_progress()
seen_barcodes = progress["barcodes"]   # barcode -> category
products = progress["products"]         # fully fetched products
failed_off = set(progress["failed_off"])  # barcodes that failed OFF fetch

if seen_barcodes:
    print(f"Resuming: {len(seen_barcodes)} barcodes already scanned, "
          f"{len(products)} products fetched, {len(failed_off)} OFF failures\n")

# ── Step 1: Scan images, collect unique barcodes ──────────────────────────── #
print("=== Step 1: Scanning images ===\n")

for folder, category in FOLDER_TO_CATEGORY.items():
    folder_path = os.path.join(BASE, folder)
    if not os.path.isdir(folder_path):
        continue
    images = sorted(f for f in os.listdir(folder_path) if f.lower().endswith((".jpg", ".jpeg", ".png")))
    new_scans = [n for n in images
                 if not any(b for b, c in seen_barcodes.items() if c == category and
                            next((True for p in products if p["barcode"] == b), False))]
    print(f"[{category}] {len(images)} images")
    for name in images:
        r = scan_image(os.path.join(folder_path, name))
        barcode = r.get("barcode")
        if not barcode:
            print(f"  ✗ {name} → no barcode")
        elif barcode in seen_barcodes:
            print(f"  ~ {name} → duplicate {barcode}")
        else:
            seen_barcodes[barcode] = category
            progress["barcodes"] = seen_barcodes
            save_progress(progress)
            print(f"  ✓ {name} → {barcode}")
        # no sleep — decode_only doesn't hit OFF
    print()

print(f"=== {len(seen_barcodes)} unique barcodes ===\n")

# ── Step 2: Fetch full OFF data (skip already fetched + known failures) ───── #
fetched_barcodes = {p["barcode"] for p in products}
to_fetch = {b: c for b, c in seen_barcodes.items()
            if b not in fetched_barcodes and b not in failed_off}

if to_fetch:
    print(f"=== Step 2: Fetching OFF data for {len(to_fetch)} products ===\n")
    for barcode, category in to_fetch.items():
        data = fetch_off(barcode)
        if not data or data.get("status") != 1:
            print(f"  ✗ {barcode} ({category}) — rate limited or not found, will retry next run")
            failed_off.add(barcode)
            progress["failed_off"] = list(failed_off)
            save_progress(progress)
            time.sleep(5)
            continue
        p = data["product"]
        n = p.get("nutriments", {})
        product = {
            "barcode":       barcode,
            "category":      category,
            "name":          p.get("product_name") or "",
            "brand":         (p.get("brands") or "").split(",")[0].strip(),
            "serving_size":  p.get("serving_size"),
            "quantity":      p.get("quantity"),
            "nutriscore":    p.get("nutriscore_grade"),
            "nova":          p.get("nova_group"),
            "allergens":     json.dumps(strip_prefix(p.get("allergens_tags", []))),
            "labels":        json.dumps(strip_prefix(p.get("labels_tags", []))),
            "calories":      n.get("energy-kcal_100g"),
            "protein":       n.get("proteins_100g"),
            "fat":           n.get("fat_100g"),
            "saturated_fat": n.get("saturated-fat_100g"),
            "sugars":        n.get("sugars_100g"),
            "fiber":         n.get("fiber_100g"),
            "sodium":        n.get("sodium_100g"),
            "carbs":         n.get("carbohydrates_100g"),
        }
        products.append(product)
        progress["products"] = products
        save_progress(progress)
        print(f"  ✓ [{category}] {product['brand']} {product['name']}")
        time.sleep(5)
else:
    print("=== Step 2: All OFF data already fetched ===\n")

print(f"\n=== {len(products)} products ready ({len(failed_off)} still failing) ===\n")

# ── Step 3: Recreate catalog table and seed ───────────────────────────────── #
print("=== Step 3: Seeding database ===\n")
conn = sqlite3.connect(DB_PATH)
conn.executescript("""
    DROP TABLE IF EXISTS catalog;
    CREATE TABLE catalog (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL,
        brand         TEXT NOT NULL,
        category      TEXT NOT NULL,
        calories      REAL, protein REAL, fat REAL,
        saturated_fat REAL, sugars REAL, fiber REAL,
        sodium        REAL, carbs REAL,
        nutriscore    TEXT,
        nova          INTEGER,
        allergens     TEXT DEFAULT '[]',
        labels        TEXT DEFAULT '[]',
        barcode       TEXT,
        serving_size  TEXT,
        quantity      TEXT,
        price         REAL
    );
""")

for p in products:
    conn.execute("""
        INSERT INTO catalog
          (barcode, name, brand, category, serving_size, quantity, nutriscore, nova,
           allergens, labels, calories, protein, fat, saturated_fat,
           sugars, fiber, sodium, carbs)
        VALUES
          (:barcode, :name, :brand, :category, :serving_size, :quantity, :nutriscore, :nova,
           :allergens, :labels, :calories, :protein, :fat, :saturated_fat,
           :sugars, :fiber, :sodium, :carbs)
    """, p)

conn.commit()

print("Catalog by category:")
for cat in FOLDER_TO_CATEGORY.values():
    count = conn.execute("SELECT COUNT(*) FROM catalog WHERE category=?", (cat,)).fetchone()[0]
    print(f"  {cat}: {count}")
total = conn.execute("SELECT COUNT(*) FROM catalog").fetchone()[0]
print(f"\nTotal: {total} products seeded")
conn.close()

if failed_off:
    print(f"\n{len(failed_off)} barcodes still failed OFF fetch — re-run the script to retry them")
else:
    print("\nAll done! Delete seed_progress.json if you want a clean re-seed next time.")
