from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timedelta
from typing import List, Optional
from app.database import get_db
from app.models.schemas import MealLogCreate, MealLogResponse
from app.routers.auth import get_current_user

router = APIRouter(prefix="/logs", tags=["logs"])

MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack", "adhoc"]


def serialize_log(log: dict) -> dict:
    log["id"] = str(log.pop("_id"))
    log["user_id"] = str(log["user_id"])
    return log


@router.post("/", response_model=dict)
async def create_log(data: MealLogCreate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    total_calories = sum(e.calories for e in data.entries)
    
    log_dict = {
        "user_id": current_user["_id"],
        "date": data.date,
        "meal_type": data.meal_type,
        "entries": [e.model_dump() for e in data.entries],
        "total_calories": total_calories,
        "notes": data.notes,
        "created_at": datetime.utcnow(),
    }
    result = await db.meal_logs.insert_one(log_dict)
    log_dict["_id"] = result.inserted_id
    return serialize_log(log_dict)


@router.get("/date/{date_str}")
async def get_logs_by_date(date_str: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    logs = await db.meal_logs.find({
        "user_id": current_user["_id"],
        "date": date_str,
    }).to_list(100)
    return [serialize_log(l) for l in logs]


@router.delete("/{log_id}")
async def delete_log(log_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    result = await db.meal_logs.delete_one({
        "_id": ObjectId(log_id),
        "user_id": current_user["_id"],
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Log not found")
    return {"message": "Deleted"}


@router.get("/summary/{date_str}")
async def get_daily_summary(date_str: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    logs = await db.meal_logs.find({
        "user_id": current_user["_id"],
        "date": date_str,
    }).to_list(100)

    total_calories = sum(l["total_calories"] for l in logs)
    meal_breakdown = {}
    for l in logs:
        mt = l["meal_type"]
        if mt not in meal_breakdown:
            meal_breakdown[mt] = 0
        meal_breakdown[mt] += l["total_calories"]

    return {
        "date": date_str,
        "total_calories": total_calories,
        "calorie_goal": current_user.get("calorie_goal"),
        "meals": [serialize_log(l) for l in logs],
        "meal_breakdown": meal_breakdown,
    }


@router.get("/history/range")
async def get_history(
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    logs = await db.meal_logs.find({
        "user_id": current_user["_id"],
        "date": {"$gte": start_date, "$lte": end_date},
    }).sort("date", 1).to_list(500)

    # Aggregate by date
    by_date = {}
    for l in logs:
        d = l["date"]
        if d not in by_date:
            by_date[d] = {"date": d, "total_calories": 0, "meals": []}
        by_date[d]["total_calories"] += l["total_calories"]
        by_date[d]["meals"].append(serialize_log(l))

    calorie_goal = current_user.get("calorie_goal")
    result = []
    for d, v in sorted(by_date.items()):
        v["calorie_goal"] = calorie_goal
        result.append(v)
    return result


@router.get("/history/macros")
async def get_macro_history(
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    logs = await db.meal_logs.find({
        "user_id": current_user["_id"],
        "date": {"$gte": start_date, "$lte": end_date},
    }).sort("date", 1).to_list(500)

    by_date = {}
    for l in logs:
        d = l["date"]
        if d not in by_date:
            by_date[d] = {"date": d, "calories": 0, "protein": 0, "carbs": 0, "fat": 0}
        by_date[d]["calories"] += l["total_calories"]
        for entry in l.get("entries", []):
            by_date[d]["protein"] += entry.get("protein_g") or 0
            by_date[d]["carbs"] += entry.get("carbs_g") or 0
            by_date[d]["fat"] += entry.get("fat_g") or 0

    return list(by_date.values())
