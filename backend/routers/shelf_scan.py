import json
from fastapi import APIRouter
from config import MODEL, client
from database import fuzzy_match_catalog, get_catalog_by_category, get_user_profile
from models import DetectedProduct, ShelfScanRequest, ShelfScanResponse, TopProduct

router = APIRouter()

KNOWN_CATEGORIES = {"yogurt", "milk", "cheese", "jam", "cereal", "granola", "pasta_sauce"}

DETECT_SYSTEM = """\
You are analyzing grocery shelf images.

1. Determine if a grocery shelf or products are visible in the image.
   - If there is NO shelf, NO products, and NO grocery items visible (e.g. wall, floor, person, empty room), \
output category as empty string "".
   - If a shelf or products ARE visible, identify the category. Use one of these exact values ONLY if the shelf \
clearly and predominantly shows that product type:
     - yogurt      → plain or flavoured yogurt, greek yogurt, skyr, kefir. NOT dairy in general.
     - milk        → dairy milk or plant-based milk (oat, almond, soy, coconut). NOT yogurt or cheese.
     - cheese      → any cheese (shredded, sliced, block, string). NOT yogurt or dairy spreads.
     - jam         → jams, jellies, preserves, fruit spreads. NOT sauces or condiments.
     - cereal      → packaged breakfast cereals (flakes, puffs, loops, clusters). NOT granola or oatmeal packets.
     - granola     → loose granola, granola bars. NOT boxed breakfast cereals.
     - pasta_sauce → pasta sauces, marinara, alfredo, pesto, tomato sauce. NOT condiments or dressings.
     If the shelf does NOT clearly match one of the seven, describe it in a few words (e.g. "spices", "snacks"). \
Do NOT force-fit into the categories if unsure.

2. List every product whose brand AND name you can read from the labels.

Return valid JSON only:
{
  "category": "<one of the seven | short description | empty string if no shelf>",
  "products": [{"brand": "<brand>", "name": "<product name>"}]
}
"""

RECOMMEND_SYSTEM = """\
You are CognitiveCart's shelf assistant. Rank the top 3 best products for this user \
from the catalog list below.

USER PROFILE:
Goals: {goals}
Restrictions: {restrictions}
Priorities: {priorities}

RULES:
- Choose ONLY from the products listed below.
- Base your decision solely on the provided nutrition data, allergens, and labels — never your own knowledge.
- Respect restrictions strictly: exclude any product whose allergens conflict with the user's restrictions.
- For each pick, give a score from 1-10 reflecting how well it fits the user's goals and priorities.
- Cite one specific number or label to justify each pick.
- spoken: 2 sentences spoken recommendation for the #1 pick only.

Return valid JSON:
{{"top3": [{{"name": "<exact name>", "reason": "<one sentence>", "score": <1-10>}}, ...], \
"spoken": "<2 sentence spoken recommendation for #1 pick>"}}
"""


def _call_detect(frames: list[str]) -> dict:
    content: list = []
    for f in frames[:3]:
        content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{f}"}})
    content.append({"type": "text", "text": "Identify the shelf category and list all readable products."})

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": DETECT_SYSTEM},
                {"role": "user", "content": content},
            ],
            temperature=0.1,
            max_tokens=512,
            response_format={"type": "json_object"},
        )
        result = json.loads(resp.choices[0].message.content.strip())
        print("[shelf_scan] VLM raw output:", json.dumps(result, indent=2), flush=True)
        return result
    except Exception as e:
        print("[shelf_scan] VLM call failed:", e, flush=True)
        return {"category": "", "products": []}


def _format_catalog_row(row: dict) -> str:
    fields = [
        ("calories", "kcal"), ("protein", "g protein"), ("fat", "g fat"),
        ("saturated_fat", "g sat-fat"), ("sugars", "g sugar"),
        ("fiber", "g fiber"), ("sodium", "mg sodium"),
    ]
    details = [f"{row[k]}{u}" for k, u in fields if row.get(k) is not None]
    if row.get("nutriscore"):
        details.append(f"nutriscore-{row['nutriscore'].upper()}")
    if row.get("nova"):
        details.append(f"nova-{row['nova']}")
    try:
        allergens = json.loads(row.get("allergens") or "[]")
        if allergens:
            details.append(f"allergens: {', '.join(allergens)}")
    except Exception:
        pass
    try:
        labels = json.loads(row.get("labels") or "[]")
        if labels:
            details.append(f"labels: {', '.join(labels)}")
    except Exception:
        pass
    return f"{row['brand']} {row['name']}: " + ", ".join(details)


@router.post("/shelf_scan", response_model=ShelfScanResponse)
def shelf_scan(req: ShelfScanRequest):
    if not req.frames:
        return ShelfScanResponse(
            category="other", detected_products=[],
            recommendation="No frames provided.", fallback_level=3,
            spoken="I didn't receive any images to analyse.",
        )

    profile = get_user_profile()
    profile_vars = dict(
        goals=", ".join(profile["goals"]) or "none set",
        restrictions=", ".join(profile["restrictions"]) or "none",
        priorities=", ".join(profile["priorities"]) or "none set",
    )

    # ── Call 1: Vision — category + visible products ───────────────────────── #
    raw = _call_detect(req.frames)
    raw_category = raw.get("category", "").strip().lower()
    category = raw_category if raw_category in KNOWN_CATEGORIES else ""

    raw_products = raw.get("products", [])
    detected: list[DetectedProduct] = []

    for p in raw_products:
        name = p.get("name", "").strip()
        brand = p.get("brand", "").strip()
        if not name:
            continue

        matched_row, score = fuzzy_match_catalog(name, brand)
        in_db = "found" if score >= 0.80 else "uncertain"
        print(f"[shelf_scan] fuzzy '{brand} {name}' → '{matched_row.get('name') if matched_row else 'none'}' (score={score:.2f}, in_db={in_db})", flush=True)

        detected.append(DetectedProduct(name=name, brand=brand, in_db=in_db))

    # ── Nothing detected at all ────────────────────────────────────────────── #
    if not category and not raw_category and not detected:
        return ShelfScanResponse(
            category="",
            detected_products=[],
            recommendation="No products detected.",
            fallback_level=3,
            spoken="I couldn't see any products. Try pointing the glasses directly at a shelf and hold steady.",
        )

    # ── Category not in catalog — give general advice via LLM ─────────────── #
    if not category:
        label = raw_category or "these products"
        product_names = ", ".join(f"{d.brand} {d.name}" for d in detected) or label
        try:
            resp = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": (
                        f"You are CognitiveCart. The user is looking at {label} on a grocery shelf. "
                        f"Our catalog covers yogurt, milk, cheese, jam, cereal, granola, and pasta sauce — {label} is not a supported category.\n\n"
                        f"USER PROFILE:\nGoals: {profile_vars['goals']}\n"
                        f"Restrictions: {profile_vars['restrictions']}\n"
                        f"Priorities: {profile_vars['priorities']}\n\n"
                        f"Using the user profile above, generate a very short spoken recommendation that: "
                        f"(1) states that {label} is not a supported category, and "
                        f"(2) gives a general recommendation on whether {label} is good or bad for this user based on their goals and restrictions.\n\n"
                        f"Return valid JSON: {{\"reason\": \"<one sentence>\"}}"
                    )},
                    {"role": "user", "content": f"I can see: {product_names}."},
                ],
                temperature=0.4,
                max_tokens=150,
                response_format={"type": "json_object"},
            )
            parsed = json.loads(resp.choices[0].message.content.strip())
            reason = parsed.get("reason", "")
            return ShelfScanResponse(
                category=raw_category,
                detected_products=detected,
                recommendation=reason,
                fallback_level=2,
                spoken=reason,
            )
        except Exception:
            pass
        return ShelfScanResponse(
            category=raw_category,
            detected_products=detected,
            recommendation=f"We don't have {label} in our catalog.",
            fallback_level=3,
            spoken=f"We don't carry {label} in our catalog yet, but check the label for sugar and saturated fat based on your goals.",
        )

    # ── Call 2: Text — recommend best from full category in DB ────────────── #
    catalog_rows = get_catalog_by_category(category)

    if not catalog_rows:
        return ShelfScanResponse(
            category=category,
            detected_products=detected,
            recommendation=f"No products in our catalog for {category} yet.",
            fallback_level=2,
            spoken=f"We don't have any {category.replace('_', ' ')} products in our catalog yet.",
        )

    product_lines = "\n".join(
        f"{i+1}. {_format_catalog_row(r)}" for i, r in enumerate(catalog_rows)
    )
    user_content = (
        f"CATEGORY: {category.replace('_', ' ')}\n\n"
        f"CATALOG PRODUCTS:\n{product_lines}\n\n"
        f"Pick the best one for this user."
    )

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": RECOMMEND_SYSTEM.format(**profile_vars)},
                {"role": "user", "content": user_content},
            ],
            temperature=0.3,
            max_tokens=600,
            response_format={"type": "json_object"},
        )
        parsed = json.loads(resp.choices[0].message.content.strip())
        raw_top3 = parsed.get("top3", [])

        # Look up brand for each pick from catalog rows
        name_to_row = {r["name"]: r for r in catalog_rows}
        top3 = []
        for item in raw_top3[:3]:
            row = name_to_row.get(item.get("name", ""), {})
            try:
                score = int(str(item.get("score", 0)).split("/")[0])
            except (ValueError, TypeError):
                score = 0
            top3.append(TopProduct(
                name=item.get("name", ""),
                brand=row.get("brand"),
                reason=item.get("reason", ""),
                score=score,
            ))

        return ShelfScanResponse(
            category=category,
            detected_products=detected,
            recommendation=top3[0].reason if top3 else "",
            winner=top3[0].name if top3 else None,
            top3=top3,
            fallback_level=1,
            spoken=parsed.get("spoken", ""),
        )
    except Exception as e:
        import traceback
        print("[shelf_scan] recommendation failed:", e, flush=True)
        traceback.print_exc()
        return ShelfScanResponse(
            category=category,
            detected_products=detected,
            recommendation="Could not generate a recommendation.",
            fallback_level=2,
            spoken="I recognised the shelf but couldn't generate a recommendation. Please try again.",
        )
