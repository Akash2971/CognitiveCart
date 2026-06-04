from fastapi import APIRouter, HTTPException
from database import get_all_catalog, get_store_location, get_all_store_locations
from models import LocationResponse, StoreLocation, UserProfile

router = APIRouter()


@router.get("/locations", response_model=list[StoreLocation])
def all_locations():
    return [StoreLocation(**r) for r in get_all_store_locations()]


@router.get("/location/{category}", response_model=LocationResponse)
def get_location(category: str):
    row = get_store_location(category)
    if not row:
        raise HTTPException(status_code=404, detail=f"No location found for '{category}'.")

    landmarks = row.get("landmarks") or ""
    spoken = f"{row['category'].capitalize()} is in {row['aisle']}."
    if landmarks:
        spoken += f" {landmarks}."

    return LocationResponse(
        category=row["category"],
        aisle=row["aisle"],
        landmarks=row.get("landmarks"),
        spoken=spoken,
    )


@router.get("/catalog")
def list_catalog():
    rows = get_all_catalog()
    return [{"name": r["name"], "brand": r.get("brand"), "barcode": r.get("barcode"), "category": r["category"]} for r in rows]


@router.get("/user_profile")
def read_profile():
    from database import get_user_profile
    return get_user_profile()


@router.post("/user_profile")
def write_profile(profile: UserProfile):
    from database import set_user_profile
    set_user_profile(profile.goals, profile.restrictions, profile.priorities, profile.price_preference)
    return {"ok": True}
