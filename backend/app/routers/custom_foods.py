import re
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime
from app.database import get_db
from app.models.schemas import CustomFoodCreate
from app.routers.auth import get_current_user

router = APIRouter(prefix="/custom-foods", tags=["custom-foods"])


def _serialize(cf: dict) -> dict:
    cf["id"] = str(cf.pop("_id"))
    cf["user_id"] = str(cf["user_id"])
    cf["created_at"] = cf["created_at"].isoformat()
    return cf


def _to_food_item(cf: dict) -> dict:
    """Convert a custom food document to a FoodItem-shaped dict for the frontend."""
    serving_g = cf.get("serving_size_g") or 100.0
    cal = cf.get("calories_per_serving", 0)
    kcal_per_100g = round(cal / serving_g * 100, 1) if serving_g > 0 else cal
    return {
        "id": cf["id"],
        "item": cf["name"],
        "category": "Custom",
        "cuisine": "Custom",
        "kcal_per_100g": kcal_per_100g,
        "bowl_g": serving_g,
        "kcal_per_bowl": cal,
        "is_custom": True,
        "combo_items": cf.get("combo_items"),
    }


@router.post("/", response_model=dict)
async def create_custom_food(
    data: CustomFoodCreate, current_user: dict = Depends(get_current_user)
):
    db = get_db()
    doc = {
        "user_id": current_user["_id"],
        "name": data.name.strip(),
        "calories_per_serving": data.calories_per_serving,
        "serving_size_g": data.serving_size_g or 100.0,
        "combo_items": data.combo_items or [],
        "created_at": datetime.utcnow(),
    }
    result = await db.custom_foods.insert_one(doc)
    doc["_id"] = result.inserted_id
    cf = _serialize(doc)
    return _to_food_item(cf)


@router.get("/", response_model=list)
async def list_custom_foods(
    q: str = "", current_user: dict = Depends(get_current_user)
):
    db = get_db()
    query: dict = {"user_id": current_user["_id"]}
    if q:
        query["name"] = {"$regex": re.escape(q), "$options": "i"}

    docs = await db.custom_foods.find(query).sort("created_at", -1).to_list(100)
    result = []
    for doc in docs:
        cf = _serialize(doc)
        result.append(_to_food_item(cf))
    return result


@router.delete("/{food_id}")
async def delete_custom_food(
    food_id: str, current_user: dict = Depends(get_current_user)
):
    if not ObjectId.is_valid(food_id):
        raise HTTPException(status_code=400, detail="Invalid food ID")
    db = get_db()
    result = await db.custom_foods.delete_one(
        {"_id": ObjectId(food_id), "user_id": current_user["_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Custom food not found")
    return {"message": "Deleted"}
