from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timedelta, date
from typing import List, Optional
from app.database import get_db
from app.models.schemas import MealLogCreate, MealLogResponse, MealTemplateCreate
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
        "context": data.context,
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


@router.get("/frequent")
async def get_frequent_meals(current_user: dict = Depends(get_current_user)):
    """Top 5 most frequently logged food items in the last 30 days."""
    db = get_db()
    thirty_days_ago = (date.today() - timedelta(days=30)).isoformat()

    logs = await db.meal_logs.find({
        "user_id": current_user["_id"],
        "date": {"$gte": thirty_days_ago},
    }).to_list(500)

    food_counts: dict = {}
    food_data: dict = {}
    for log in logs:
        for entry in log.get("entries", []):
            fid = entry.get("food_id")
            if fid:
                food_counts[fid] = food_counts.get(fid, 0) + 1
                if fid not in food_data:
                    food_data[fid] = entry

    top5 = sorted(food_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    return [{"count": count, **food_data[fid]} for fid, count in top5]


@router.get("/repeat-last")
async def repeat_last_meal(meal_type: str = "lunch", current_user: dict = Depends(get_current_user)):
    """Get the most recently logged meal of the given type."""
    db = get_db()
    log = await db.meal_logs.find_one(
        {"user_id": current_user["_id"], "meal_type": meal_type},
        sort=[("created_at", -1)],
    )
    if not log:
        raise HTTPException(status_code=404, detail="No previous meal found")
    return serialize_log(log)


@router.post("/save-template")
async def save_template(data: MealTemplateCreate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    total_calories = sum(e.calories for e in data.entries)
    doc = {
        "user_id": current_user["_id"],
        "name": data.name,
        "meal_type": data.meal_type,
        "entries": [e.model_dump() for e in data.entries],
        "total_calories": total_calories,
        "created_at": datetime.utcnow(),
    }
    result = await db.meal_templates.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc["user_id"] = str(doc["user_id"])
    doc.pop("_id", None)
    return doc


@router.get("/templates")
async def get_templates(current_user: dict = Depends(get_current_user)):
    db = get_db()
    templates = await db.meal_templates.find(
        {"user_id": current_user["_id"]}
    ).sort("created_at", -1).to_list(50)
    result = []
    for t in templates:
        t["id"] = str(t.pop("_id"))
        t["user_id"] = str(t["user_id"])
        result.append(t)
    return result


@router.get("/day-status")
async def get_day_status(current_user: dict = Depends(get_current_user)):
    """Returns whether today is a recovery day based on yesterday's surplus."""
    db = get_db()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    today_str = date.today().isoformat()

    yesterday_logs = await db.meal_logs.find({
        "user_id": current_user["_id"],
        "date": yesterday,
    }).to_list(100)

    yesterday_calories = sum(l["total_calories"] for l in yesterday_logs)
    calorie_goal = current_user.get("calorie_goal") or 2000
    surplus_pct = ((yesterday_calories - calorie_goal) / calorie_goal * 100) if calorie_goal > 0 else 0

    context_counts: dict = {}
    for log in yesterday_logs:
        ctx = log.get("context")
        if ctx:
            context_counts[ctx] = context_counts.get(ctx, 0) + 1
    yesterday_context = max(context_counts, key=lambda k: context_counts[k]) if context_counts else None

    return {
        "date": today_str,
        "recovery_day": surplus_pct > 20,
        "yesterday_calories": round(yesterday_calories),
        "surplus_pct": round(surplus_pct, 1),
        "calorie_goal": calorie_goal,
        "yesterday_context": yesterday_context,
    }


@router.get("/context-stats")
async def get_context_stats(current_user: dict = Depends(get_current_user)):
    """Per-context calorie averages, over-goal rates, and delta vs home — last 60 days."""
    db = get_db()
    sixty_days_ago = (date.today() - timedelta(days=60)).isoformat()

    context_logs = await db.meal_logs.find({
        "user_id": current_user["_id"],
        "date": {"$gte": sixty_days_ago},
        "context": {"$exists": True, "$ne": None},
    }).to_list(1000)

    if not context_logs:
        return []

    calorie_goal = current_user.get("calorie_goal") or 2000

    # Build daily totals across ALL logs (needed to decide if a day was over goal)
    all_logs = await db.meal_logs.find({
        "user_id": current_user["_id"],
        "date": {"$gte": sixty_days_ago},
    }).to_list(2000)

    daily_totals: dict = {}
    for log in all_logs:
        d = log["date"]
        daily_totals[d] = daily_totals.get(d, 0) + log["total_calories"]

    # Group context logs by context value
    context_data: dict = {}
    for log in context_logs:
        ctx = log.get("context")
        if not ctx:
            continue
        if ctx not in context_data:
            context_data[ctx] = {"calories": [], "dates": set()}
        context_data[ctx]["calories"].append(log["total_calories"])
        context_data[ctx]["dates"].add(log["date"])

    home_avg: Optional[float] = None
    result = []

    for ctx, data in context_data.items():
        cals = data["calories"]
        dates = data["dates"]
        avg_cal = sum(cals) / len(cals)
        days_over = sum(1 for d in dates if daily_totals.get(d, 0) > calorie_goal)
        over_goal_pct = round(days_over / len(dates) * 100) if dates else 0

        result.append({
            "context": ctx,
            "avg_calories": round(avg_cal),
            "count": len(cals),
            "over_goal_pct": over_goal_pct,
            "days_with_context": len(dates),
            "vs_home_delta": None,
        })

        if ctx == "home":
            home_avg = avg_cal

    if home_avg is not None:
        for item in result:
            item["vs_home_delta"] = round(item["avg_calories"] - home_avg)

    return sorted(result, key=lambda x: x["avg_calories"], reverse=True)


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
