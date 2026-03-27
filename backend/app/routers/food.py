from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.services.food import search_foods, get_food_by_id, get_categories, get_cuisines

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


@router.get("/{food_id}")
async def get_food(food_id: str):
    food = await get_food_by_id(food_id)
    if not food:
        raise HTTPException(status_code=404, detail="Food not found")
    return food
