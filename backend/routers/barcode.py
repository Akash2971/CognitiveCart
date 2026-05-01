import base64
import io
import json

import requests
import zxingcpp
from fastapi import APIRouter, HTTPException
from PIL import Image, ImageEnhance, ImageFilter

from database import clear_scanned_products, get_all_scanned_products, get_scanned_product, update_scanned_price, upsert_scanned_product
from models import (
    BarcodeScanRequest,
    BarcodeScanResponse,
    NutritionPer100g,
    ScannedProduct,
    UpdatePriceRequest,
)

router = APIRouter()

OFF_URL = "https://world.openfoodfacts.org/api/v2/product/{barcode}"
OFF_FIELDS = (
    "product_name,brands,quantity,serving_size,nutriments,"
    "nutriscore_grade,nova_group,ingredients_text,"
    "allergens_tags,labels_tags,categories_tags"
)
OFF_HEADERS = {"User-Agent": "CognitiveCart/0.1 (akash29701@gmail.com)"}


def _strip_prefix(tags: list, prefix: str = "en:") -> list:
    return [t[len(prefix):] for t in tags if t.startswith(prefix)]


def _normalize(barcode: str, product: dict) -> ScannedProduct:
    n = product.get("nutriments", {})

    def _f(key):
        v = n.get(key)
        return float(v) if v is not None else None

    cats = _strip_prefix(product.get("categories_tags", []))[:4]

    return ScannedProduct(
        barcode=barcode,
        name=product.get("product_name") or "",
        brand=product.get("brands"),
        size=product.get("quantity"),
        serving=product.get("serving_size"),
        nutriscore=product.get("nutriscore_grade"),
        nova=product.get("nova_group"),
        ingredients=product.get("ingredients_text"),
        allergens=_strip_prefix(product.get("allergens_tags", [])),
        labels=_strip_prefix(product.get("labels_tags", [])),
        categories=cats,
        nutrition_per_100g=NutritionPer100g(
            calories=_f("energy-kcal_100g"),
            fat=_f("fat_100g"),
            saturated_fat=_f("saturated-fat_100g"),
            carbs=_f("carbohydrates_100g"),
            sugars=_f("sugars_100g"),
            fiber=_f("fiber_100g"),
            protein=_f("proteins_100g"),
            salt=_f("salt_100g"),
            sodium=_f("sodium_100g"),
        ),
    )


def _zxing(img: Image.Image, binarizer=zxingcpp.Binarizer.LocalAverage) -> str | None:
    results = zxingcpp.read_barcodes(img, binarizer=binarizer)
    return results[0].text if results else None


def _candidates(img: Image.Image) -> list[Image.Image]:
    w, h = img.size
    gray = img.convert("L")
    boosted = ImageEnhance.Contrast(gray).enhance(2.5)
    sharp = boosted.filter(ImageFilter.SHARPEN)

    # Upscale 2x — critical for low-res glasses stream frames
    up2 = sharp.resize((w * 2, h * 2), Image.LANCZOS)

    # Center 60% crop then upscale — barcode occupies small portion of wide-angle frame
    cx, cy = int(w * 0.2), int(h * 0.2)
    crop = sharp.crop((cx, cy, w - cx, h - cy))
    cw, ch = crop.size
    crop_up = crop.resize((cw * 2, ch * 2), Image.LANCZOS)

    return [gray, boosted, sharp, up2, crop, crop_up]


def _read_barcode(b64: str) -> str | None:
    img_bytes = base64.b64decode(b64)
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")

    for candidate in _candidates(img):
        for binarizer in (zxingcpp.Binarizer.LocalAverage, zxingcpp.Binarizer.GlobalHistogram):
            result = _zxing(candidate, binarizer)
            if result:
                return result
    return None


@router.post("/scan_barcode", response_model=BarcodeScanResponse)
def scan_barcode(req: BarcodeScanRequest):
    try:
        barcode = _read_barcode(req.frame)
    except Exception:
        return BarcodeScanResponse(success=False, message="Failed to process image.")

    if not barcode:
        return BarcodeScanResponse(
            success=False,
            message="Couldn't read the barcode. Hold still and get closer."
        )

    # Return cached if already scanned this session
    cached = get_scanned_product(barcode)
    if cached:
        product = ScannedProduct(
            barcode=barcode,
            name=cached["name"],
            brand=cached.get("brand"),
            size=cached.get("size"),
            serving=cached.get("serving"),
            nutriscore=cached.get("nutriscore"),
            nova=cached.get("nova"),
            ingredients=cached.get("ingredients"),
            allergens=json.loads(cached.get("allergens") or "[]"),
            labels=json.loads(cached.get("labels") or "[]"),
            categories=json.loads(cached.get("categories") or "[]"),
            nutrition_per_100g=NutritionPer100g(
                calories=cached.get("calories"),
                fat=cached.get("fat"),
                saturated_fat=cached.get("saturated_fat"),
                carbs=cached.get("carbs"),
                sugars=cached.get("sugars"),
                fiber=cached.get("fiber"),
                protein=cached.get("protein"),
                salt=cached.get("salt"),
                sodium=cached.get("sodium"),
            ),
        )
        return BarcodeScanResponse(success=True, product=product)

    # Fetch from Open Food Facts
    try:
        resp = requests.get(
            OFF_URL.format(barcode=barcode),
            params={"fields": OFF_FIELDS},
            headers=OFF_HEADERS,
            timeout=8,
        )
    except requests.RequestException:
        return BarcodeScanResponse(
            success=False,
            message="Couldn't reach the product database. Check your connection."
        )

    if resp.status_code == 429:
        return BarcodeScanResponse(success=False, message="Rate limited. Try again in a moment.")
    if resp.status_code >= 500:
        return BarcodeScanResponse(success=False, message="Product database is unavailable.")

    data = resp.json()
    if data.get("status") != 1:
        return BarcodeScanResponse(
            success=False,
            message=f"Product not found (barcode: {barcode})."
        )

    product = _normalize(barcode, data["product"])
    upsert_scanned_product(barcode, product.model_dump())
    return BarcodeScanResponse(success=True, product=product)


@router.delete("/scanned_products")
def delete_scanned_products():
    clear_scanned_products()
    return {"ok": True}


@router.get("/scanned_products")
def list_scanned_products():
    rows = get_all_scanned_products()
    return [{"barcode": r["barcode"], "name": r["name"], "brand": r.get("brand"), "size": r.get("size"), "price": r.get("price")} for r in rows]


@router.get("/lookup_barcode/{barcode}", response_model=BarcodeScanResponse)
def lookup_barcode(barcode: str):
    cached = get_scanned_product(barcode)
    if cached:
        product = ScannedProduct(
            barcode=barcode,
            name=cached["name"],
            brand=cached.get("brand"),
            size=cached.get("size"),
            serving=cached.get("serving"),
            nutriscore=cached.get("nutriscore"),
            nova=cached.get("nova"),
            ingredients=cached.get("ingredients"),
            allergens=json.loads(cached.get("allergens") or "[]"),
            labels=json.loads(cached.get("labels") or "[]"),
            categories=json.loads(cached.get("categories") or "[]"),
            nutrition_per_100g=NutritionPer100g(
                calories=cached.get("calories"),
                fat=cached.get("fat"),
                saturated_fat=cached.get("saturated_fat"),
                carbs=cached.get("carbs"),
                sugars=cached.get("sugars"),
                fiber=cached.get("fiber"),
                protein=cached.get("protein"),
                salt=cached.get("salt"),
                sodium=cached.get("sodium"),
            ),
        )
        return BarcodeScanResponse(success=True, product=product)

    try:
        resp = requests.get(
            OFF_URL.format(barcode=barcode),
            params={"fields": OFF_FIELDS},
            headers=OFF_HEADERS,
            timeout=8,
        )
    except requests.RequestException:
        return BarcodeScanResponse(success=False, message="Couldn't reach the product database.")

    if resp.status_code == 429:
        return BarcodeScanResponse(success=False, message="Rate limited. Try again in a moment.")
    if resp.status_code >= 500:
        return BarcodeScanResponse(success=False, message="Product database is unavailable.")

    data = resp.json()
    if data.get("status") != 1:
        return BarcodeScanResponse(success=False, message=f"Product not found (barcode: {barcode}).")

    product = _normalize(barcode, data["product"])
    upsert_scanned_product(barcode, product.model_dump())
    return BarcodeScanResponse(success=True, product=product)


@router.patch("/scanned_products/{barcode}/price")
def set_price(barcode: str, req: UpdatePriceRequest):
    if get_scanned_product(barcode) is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    update_scanned_price(barcode, req.price)
    return {"ok": True}
