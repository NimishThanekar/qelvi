from fastapi import APIRouter, Depends
from bson import ObjectId
from datetime import datetime, date, timedelta
from app.database import get_db
from app.routers.auth import get_admin_user

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/overview")
async def get_overview(current_user: dict = Depends(get_admin_user)):
    db = get_db()
    today = date.today()
    seven_ago = (today - timedelta(days=7)).isoformat()
    thirty_ago = (today - timedelta(days=30)).isoformat()
    seven_ago_dt = datetime.combine(today - timedelta(days=7), datetime.min.time())
    thirty_ago_dt = datetime.combine(today - timedelta(days=30), datetime.min.time())

    total_users = await db.users.count_documents({})
    total_logs = await db.meal_logs.count_documents({})
    total_groups = await db.groups.count_documents({})

    # Active users: distinct user_ids with logs in last 7 days
    active_pipeline = [
        {"$match": {"date": {"$gte": seven_ago}}},
        {"$group": {"_id": "$user_id"}},
        {"$count": "count"},
    ]
    active_result = await db.meal_logs.aggregate(active_pipeline).to_list(1)
    active_users_7d = active_result[0]["count"] if active_result else 0

    # New signups
    new_signups_7d = await db.users.count_documents({"created_at": {"$gte": seven_ago_dt}})
    new_signups_30d = await db.users.count_documents({"created_at": {"$gte": thirty_ago_dt}})

    # Avg meals per user per day (last 7 days)
    logs_7d = await db.meal_logs.count_documents({"date": {"$gte": seven_ago}})
    avg_meals = round(logs_7d / max(active_users_7d * 7, 1), 2)

    # Total calories ever logged
    cal_pipeline = [
        {"$group": {"_id": None, "total": {"$sum": "$total_calories"}}},
    ]
    cal_result = await db.meal_logs.aggregate(cal_pipeline).to_list(1)
    total_calories = round(cal_result[0]["total"]) if cal_result else 0

    return {
        "total_users": total_users,
        "total_logs": total_logs,
        "total_groups": total_groups,
        "active_users_7d": active_users_7d,
        "new_signups_7d": new_signups_7d,
        "new_signups_30d": new_signups_30d,
        "avg_meals_per_user_per_day": avg_meals,
        "total_calories_logged": total_calories,
    }


@router.get("/users")
async def get_users(current_user: dict = Depends(get_admin_user)):
    db = get_db()
    today = date.today()
    seven_ago = (today - timedelta(days=7)).isoformat()
    thirty_ago = (today - timedelta(days=30)).isoformat()

    users = await db.users.find({}, {"password": 0}).to_list(500)

    # Batch: get per-user meal stats via aggregation
    user_stats_pipeline = [
        {"$group": {
            "_id": "$user_id",
            "total_meals": {"$sum": 1},
            "last_active": {"$max": "$date"},
        }},
    ]
    user_stats_raw = await db.meal_logs.aggregate(user_stats_pipeline).to_list(500)
    user_stats = {str(s["_id"]): s for s in user_stats_raw}

    # Per-user avg daily cals (last 7 days)
    avg_pipeline = [
        {"$match": {"date": {"$gte": seven_ago}}},
        {"$group": {
            "_id": {"user_id": "$user_id", "date": "$date"},
            "day_total": {"$sum": "$total_calories"},
        }},
        {"$group": {
            "_id": "$_id.user_id",
            "avg_daily": {"$avg": "$day_total"},
        }},
    ]
    avg_raw = await db.meal_logs.aggregate(avg_pipeline).to_list(500)
    avg_map = {str(a["_id"]): round(a["avg_daily"]) for a in avg_raw}

    # Per-user goal adherence (last 30 days) — days where daily cals are 80-120% of goal
    adherence_pipeline = [
        {"$match": {"date": {"$gte": thirty_ago}}},
        {"$group": {
            "_id": {"user_id": "$user_id", "date": "$date"},
            "day_total": {"$sum": "$total_calories"},
        }},
    ]
    adherence_raw = await db.meal_logs.aggregate(adherence_pipeline).to_list(5000)

    # Build user goal map
    user_goals = {str(u["_id"]): u.get("calorie_goal") for u in users}

    # Calculate adherence per user
    user_day_totals: dict = {}
    for entry in adherence_raw:
        uid = str(entry["_id"]["user_id"])
        if uid not in user_day_totals:
            user_day_totals[uid] = []
        user_day_totals[uid].append(entry["day_total"])

    adherence_map: dict = {}
    for uid, totals in user_day_totals.items():
        goal = user_goals.get(uid)
        if not goal or not totals:
            adherence_map[uid] = 0
            continue
        on_target = sum(1 for t in totals if goal * 0.8 <= t <= goal * 1.2)
        adherence_map[uid] = round(on_target / len(totals) * 100)

    # Per-user streak (consecutive days with logs ending today)
    all_dates_pipeline = [
        {"$group": {
            "_id": "$user_id",
            "dates": {"$addToSet": "$date"},
        }},
    ]
    dates_raw = await db.meal_logs.aggregate(all_dates_pipeline).to_list(500)
    dates_map = {str(d["_id"]): set(d["dates"]) for d in dates_raw}

    def calc_streak(uid: str) -> int:
        dates = dates_map.get(uid, set())
        streak = 0
        check = today
        for _ in range(365):
            if check.isoformat() in dates:
                streak += 1
                check -= timedelta(days=1)
            else:
                break
        return streak

    result = []
    for u in users:
        uid = str(u["_id"])
        stats = user_stats.get(uid, {})
        result.append({
            "id": uid,
            "name": u.get("name", ""),
            "email": u.get("email", ""),
            "created_at": u.get("created_at", "").isoformat() if isinstance(u.get("created_at"), datetime) else str(u.get("created_at", "")),
            "total_meals": stats.get("total_meals", 0),
            "last_active": stats.get("last_active"),
            "current_streak": calc_streak(uid),
            "calorie_goal": u.get("calorie_goal"),
            "avg_daily_calories_7d": avg_map.get(uid, 0),
            "goal_adherence_pct": adherence_map.get(uid, 0),
            "is_admin": u.get("is_admin", False),
        })

    return result


@router.get("/engagement")
async def get_engagement(current_user: dict = Depends(get_admin_user)):
    db = get_db()
    today = date.today()
    result = []

    for i in range(30):
        d = today - timedelta(days=29 - i)
        d_str = d.isoformat()
        d_start = datetime.combine(d, datetime.min.time())
        d_end = datetime.combine(d + timedelta(days=1), datetime.min.time())

        signups = await db.users.count_documents({
            "created_at": {"$gte": d_start, "$lt": d_end},
        })

        # Active users on this day
        active_pipeline = [
            {"$match": {"date": d_str}},
            {"$group": {"_id": "$user_id"}},
            {"$count": "count"},
        ]
        active_result = await db.meal_logs.aggregate(active_pipeline).to_list(1)
        active_users = active_result[0]["count"] if active_result else 0

        total_logs = await db.meal_logs.count_documents({"date": d_str})

        result.append({
            "date": d_str,
            "signups": signups,
            "active_users": active_users,
            "total_logs": total_logs,
        })

    return result


@router.get("/foods/popular")
async def get_popular_foods(current_user: dict = Depends(get_admin_user)):
    db = get_db()
    pipeline = [
        {"$unwind": "$entries"},
        {"$group": {
            "_id": "$entries.food_id",
            "food_name": {"$first": "$entries.food_name"},
            "category": {"$first": "$entries.category"},
            "cuisine": {"$first": "$entries.cuisine"},
            "times_logged": {"$sum": 1},
            "unique_users": {"$addToSet": "$user_id"},
            "total_calories": {"$sum": "$entries.calories"},
        }},
        {"$addFields": {
            "unique_user_count": {"$size": "$unique_users"},
            "avg_serving_calories": {"$round": [{"$divide": ["$total_calories", "$times_logged"]}, 0]},
        }},
        {"$project": {"unique_users": 0, "total_calories": 0}},
        {"$sort": {"times_logged": -1}},
        {"$limit": 20},
    ]
    results = await db.meal_logs.aggregate(pipeline).to_list(20)
    return results


@router.get("/contexts")
async def get_context_stats(current_user: dict = Depends(get_admin_user)):
    db = get_db()
    pipeline = [
        {"$match": {"context": {"$exists": True, "$ne": None}}},
        {"$group": {
            "_id": "$context",
            "total_logs": {"$sum": 1},
            "avg_calories": {"$avg": "$total_calories"},
            "unique_users": {"$addToSet": "$user_id"},
        }},
        {"$addFields": {
            "unique_user_count": {"$size": "$unique_users"},
            "avg_calories": {"$round": ["$avg_calories", 0]},
        }},
        {"$project": {"unique_users": 0}},
        {"$sort": {"total_logs": -1}},
    ]
    results = await db.meal_logs.aggregate(pipeline).to_list(20)
    for r in results:
        r["context"] = r.pop("_id")
    return results


@router.get("/groups/stats")
async def get_group_stats(current_user: dict = Depends(get_admin_user)):
    db = get_db()
    today = date.today()
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    today_str = today.isoformat()

    total_groups = await db.groups.count_documents({})
    if total_groups == 0:
        return {
            "total_groups": 0,
            "avg_members": 0,
            "checkins_this_week": 0,
            "most_active_group": None,
        }

    # Average members per group
    members_pipeline = [
        {"$project": {"member_count": {"$size": "$member_ids"}}},
        {"$group": {"_id": None, "avg": {"$avg": "$member_count"}}},
    ]
    members_result = await db.groups.aggregate(members_pipeline).to_list(1)
    avg_members = round(members_result[0]["avg"], 1) if members_result else 0

    # Checkins this week
    checkins_this_week = await db.group_checkins.count_documents({
        "date": {"$gte": week_start, "$lte": today_str},
    })

    # Most active group this week
    active_pipeline = [
        {"$match": {"date": {"$gte": week_start, "$lte": today_str}}},
        {"$group": {"_id": "$group_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 1},
    ]
    active_result = await db.group_checkins.aggregate(active_pipeline).to_list(1)
    most_active = None
    if active_result:
        group = await db.groups.find_one({"_id": active_result[0]["_id"]})
        if group:
            most_active = group["name"]

    return {
        "total_groups": total_groups,
        "avg_members": avg_members,
        "checkins_this_week": checkins_this_week,
        "most_active_group": most_active,
    }
