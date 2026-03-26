from typing import List, Optional
from app.database import get_db


async def search_foods(query: str = "", category: str = "", cuisine: str = "", limit: int = 50) -> List[dict]:
    db = get_db()
    filter: dict = {}
    if query:
        filter["item"] = {"$regex": query, "$options": "i"}
    if category:
        filter["category"] = {"$regex": f"^{category}$", "$options": "i"}
    if cuisine:
        filter["cuisine"] = {"$regex": f"^{cuisine}$", "$options": "i"}

    cursor = db["foods"].find(filter, {"_id": 0}).limit(limit)
    return await cursor.to_list(length=limit)


async def get_food_by_id(food_id: str) -> Optional[dict]:
    db = get_db()
    return await db["foods"].find_one({"id": food_id}, {"_id": 0})


async def get_categories() -> List[str]:
    db = get_db()
    return sorted(await db["foods"].distinct("category"))


async def get_cuisines() -> List[str]:
    db = get_db()
    return sorted(await db["foods"].distinct("cuisine"))
