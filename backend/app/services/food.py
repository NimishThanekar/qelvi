import re
from typing import List, Optional
from app.database import get_db


async def search_foods(query: str = "", category: str = "", cuisine: str = "", meal_type: str = "", limit: int = 50) -> List[dict]:
    db = get_db()
    filter: dict = {}
    if query:
        filter["item"] = {"$regex": re.escape(query), "$options": "i"}
    if category:
        filter["category"] = {"$regex": f"^{re.escape(category)}$", "$options": "i"}
    if cuisine:
        filter["cuisine"] = {"$regex": f"^{re.escape(cuisine)}$", "$options": "i"}

    cursor = db["foods"].find(filter)
    foods = await cursor.to_list(length=None)
    for food in foods:
        food["id"] = str(food.pop("_id"))

    if meal_type:
        target = "anytime" if meal_type == "adhoc" else meal_type.lower()

        def meal_score(food: dict) -> int:
            if food.get("meal_category", "").lower() == target:
                return 2
            if target in [t.lower() for t in food.get("meal_tags", [])]:
                return 1
            return 0

        foods.sort(key=meal_score, reverse=True)

    return foods[:limit]


async def get_food_by_id(food_id: str) -> Optional[dict]:
    db = get_db()
    food = await db["foods"].find_one({"_id": food_id})
    if food:
        food["id"] = str(food.pop("_id"))
    return food


async def get_categories() -> List[str]:
    db = get_db()
    return sorted(await db["foods"].distinct("category"))


async def get_cuisines() -> List[str]:
    db = get_db()
    return sorted(await db["foods"].distinct("cuisine"))
