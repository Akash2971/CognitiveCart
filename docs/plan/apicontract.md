# Open Food Facts API Contract

## Endpoint

GET https://world.openfoodfacts.org/api/v2/product/{barcode}

## Headers (required)

User-Agent: CognitiveCart/0.1 (akash29701@gmail.com)

## Query params

fields=product_name,brands,quantity,serving_size,nutriments,nutriscore_grade,nova_group,ingredients_text,allergens_tags,labels_tags,categories_tags

## Path params

barcode: string  (UPC/EAN, e.g. "3017624010701")

## Raw response shape (success)

{
  "code": "3017624010701",
  "status": 1,
  "status_verbose": "product found",
  "product": {
    "product_name": "Nutella",
    "brands": "Ferrero",
    "quantity": "400.0 g",
    "serving_size": "15 g",
    "nutriments": { ... },
    "nutriscore_grade": "e",
    "nova_group": 4,                  // may be missing
    "ingredients_text": "...",
    "allergens_tags": ["en:nuts"],
    "labels_tags": ["en:no-gluten"],
    "categories_tags": ["en:breakfasts", "en:spreads", "fr:...", "de:..."]
  }
}

## Raw response shape (not found)

{
  "code": "...",
  "status": 0,
  "status_verbose": "product not found"
}

## Always check status == 1 before reading the product field.

## Normalize before using internally

The OFF response has a lot of noise. Strip it down to this internal shape:

{
  "name": str,
  "brand": str,
  "size": str,                        // e.g. "400.0 g"
  "serving": str,                     // e.g. "15 g"
  "nutrition_per_100g": {
    "calories": float | None,         // from energy-kcal_100g
    "fat": float | None,              // from fat_100g
    "saturated_fat": float | None,    // from saturated-fat_100g
    "carbs": float | None,            // from carbohydrates_100g
    "sugars": float | None,           // from sugars_100g
    "fiber": float | None,            // from fiber_100g
    "protein": float | None,          // from proteins_100g
    "salt": float | None,             // from salt_100g
    "sodium": float | None            // from sodium_100g
  },
  "nutriscore": "a"|"b"|"c"|"d"|"e"|None,
  "nova": 1|2|3|4|None,
  "ingredients": str,
  "allergens": [str],                 // strip "en:" prefix
  "labels": [str],                    // strip "en:" prefix
  "categories": [str]                 // en: only, first 4, strip prefix
}

## What to keep

- product_name → name
- brands → brand
- quantity → size
- serving_size → serving
- nutriments._100g fields only (calories, fat, sat_fat, carbs, sugars, fiber, protein, salt, sodium)
- nutriscore_grade → nutriscore
- nova_group → nova (often missing, default to None)
- ingredients_text → ingredients
- allergens_tags → allergens (strip "en:")
- labels_tags → labels (strip "en:")
- categories_tags → categories (filter to "en:" prefix only, take first 4, strip prefix)

## What to drop

From top-level product:
- image_front_url, image_url
- nutrition_data, nutrition_data_per, nutrition_data_prepared_per
- product_quantity, product_quantity_unit (redundant with quantity)

From nutriments object — drop everything except the *_100g fields listed above. Specifically drop:
- *_unit, *_value, *_modifier suffixed fields (duplicates)
- energy_100g and energy-kj_100g (keep only energy-kcal_100g)
- added-sugars and added-sugars_* (unreliable, often estimated as 0)
- fruits-vegetables-legumes-estimate-from-ingredients_100g
- fruits-vegetables-nuts-estimate-from-ingredients_100g

From categories_tags:
- Drop any tag not starting with "en:" (e.g. "fr:...", "de:...")
- Take only first 4 after filtering

## Error handling

- HTTP 404 → product missing or bad endpoint
- HTTP 429 → rate limited, back off
- HTTP 5xx → transient, retry with backoff
- status: 0 in body → product not in DB; do NOT try to read product field

## Caching

Cache normalized response by barcode for the duration of the user's session. No need to re-query within a trip.

## Rate limit

Stay under 100 requests/minute. One barcode scan = one request.

