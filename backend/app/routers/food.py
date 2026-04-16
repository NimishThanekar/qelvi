from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from datetime import datetime, timedelta
from app.services.food import search_foods, get_food_by_id, get_categories, get_cuisines
from app.database import get_db
from app.routers.auth import get_current_user, require_pro
from app.models.schemas import RecommendationsResponse, RecommendationItem

router = APIRouter(prefix="/foods", tags=["foods"])


@router.get("/")
async def list_foods(
    q: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    cuisine: Optional[str] = Query(None),
    meal_type: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
):
    return await search_foods(query=q or "", category=category or "", cuisine=cuisine or "", meal_type=meal_type or "", limit=limit)


@router.get("/categories")
async def list_categories():
    return await get_categories()


@router.get("/cuisines")
async def list_cuisines():
    return await get_cuisines()


@router.get("/recommendations", response_model=RecommendationsResponse)
async def get_recommendations(
    remaining_calories: int = Query(..., ge=1),
    meal_type: Optional[str] = Query(None),
    current_user: dict = Depends(require_pro),
):
    db = get_db()
    user_id = current_user["_id"]

    lower = remaining_calories * 0.70
    upper = remaining_calories * 1.10

    def best_serving(food: dict) -> tuple[str, float]:
        if food.get("kcal_per_piece") and food["kcal_per_piece"] > 0:
            return ("piece", float(food["kcal_per_piece"]))
        if food.get("kcal_per_scoop") and food["kcal_per_scoop"] > 0:
            return ("scoop", float(food["kcal_per_scoop"]))
        if food.get("kcal_per_bowl") and food["kcal_per_bowl"] > 0:
            return ("bowl", float(food["kcal_per_bowl"]))
        if food.get("kcal_per_restaurant_serving") and food["kcal_per_restaurant_serving"] > 0:
            return ("restaurant", float(food["kcal_per_restaurant_serving"]))
        return ("100g", float(food.get("kcal_per_100g", 0)))

    # Fetch all foods and filter by calorie range
    all_foods = await db.foods.find({}).to_list(length=5000)
    in_range: list[dict] = []
    for food in all_foods:
        stype, scal = best_serving(food)
        if lower <= scal <= upper:
            in_range.append({
                "food_id": str(food["_id"]),
                "food_name": food.get("item", ""),
                "category": food.get("category", ""),
                "serving_type": stype,
                "serving_calories": scal,
            })

    # Fetch user's logs from last 30 days to count food frequency
    cutoff = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")
    recent_logs = await db.meal_logs.find(
        {"user_id": user_id, "date": {"$gte": cutoff}}
    ).to_list(length=1000)

    food_counts: dict[str, int] = {}
    for log in recent_logs:
        for entry in log.get("entries", []):
            fid = entry.get("food_id")
            if fid:
                food_counts[fid] = food_counts.get(fid, 0) + 1

    from_history: list[dict] = []
    suggestions: list[dict] = []
    for item in in_range:
        count = food_counts.get(item["food_id"], 0)
        if count > 0:
            from_history.append({**item, "times_logged": count})
        else:
            suggestions.append({**item, "times_logged": 0})

    # Include user's custom foods in the recommendations pool
    custom_foods = await db.custom_foods.find({"user_id": user_id}).to_list(length=200)
    for cf in custom_foods:
        scal = float(cf.get("calories_per_serving", 0))
        if scal <= 0:
            continue
        if lower <= scal <= upper:
            fid = str(cf["_id"])
            count = food_counts.get(fid, 0)
            item = {
                "food_id": fid,
                "food_name": cf.get("name", ""),
                "category": "Custom",
                "serving_type": "serving",
                "serving_calories": scal,
                "times_logged": count,
            }
            if count > 0:
                from_history.append(item)
            else:
                suggestions.append(item)

    from_history.sort(key=lambda x: x["times_logged"], reverse=True)
    suggestions.sort(key=lambda x: abs(x["serving_calories"] - remaining_calories))

    return RecommendationsResponse(
        from_history=[RecommendationItem(**i) for i in from_history[:5]],
        suggestions=[RecommendationItem(**i) for i in suggestions[:5]],
    )


@router.get("/{food_id}")
async def get_food(food_id: str):
    food = await get_food_by_id(food_id)
    if not food:
        raise HTTPException(status_code=404, detail="Food not found")
    return food
