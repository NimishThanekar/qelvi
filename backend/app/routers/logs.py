from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timedelta, date
from typing import List, Optional
from app.database import get_db
from app.models.schemas import MealLogCreate, MealLogResponse, MealTemplateCreate
from app.routers.auth import get_current_user, require_pro

router = APIRouter(prefix="/logs", tags=["logs"])

MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack", "adhoc"]
_MAX_REFERRAL_PRO_DAYS = 365
_REFERRAL_ACTIVATION_MEALS = 3
_REFERRAL_EXPIRY_DAYS = 14


def serialize_log(log: dict) -> dict:
    log["id"] = str(log.pop("_id"))
    log["user_id"] = str(log["user_id"])
    return log


async def _check_referral_activation(db, user: dict) -> None:
    """
    Called after every meal log creation.
    If the logging user has a 'pending' referral, check whether they've now
    logged >= 3 meals. If so, grant the referrer their Pro days and mark
    the referral as 'activated'. If the 14-day window has passed without
    reaching 3 meals, mark it 'expired'.
    """
    if user.get("referral_status") != "pending" or not user.get("referred_by"):
        return

    created_at = user.get("created_at")
    if created_at and (datetime.utcnow() - created_at).days > _REFERRAL_EXPIRY_DAYS:
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"referral_status": "expired"}},
        )
        return

    meal_count = await db.meal_logs.count_documents({"user_id": user["_id"]})
    if meal_count >= _REFERRAL_ACTIVATION_MEALS:
        referrer = await db.users.find_one({"_id": user["referred_by"]})
        if referrer:
            already_earned = referrer.get("referral_pro_days_earned", 0)
            days_to_grant = min(7, _MAX_REFERRAL_PRO_DAYS - already_earned)
            if days_to_grant > 0:
                now = datetime.utcnow()
                current_expiry = referrer.get("pro_expires_at")
                base = (
                    current_expiry
                    if isinstance(current_expiry, datetime) and current_expiry > now
                    else now
                )
                new_expiry = base + timedelta(days=days_to_grant)
                await db.users.update_one(
                    {"_id": referrer["_id"]},
                    {
                        "$set": {"is_pro": True, "pro_expires_at": new_expiry},
                        "$inc": {"referral_pro_days_earned": days_to_grant},
                    },
                )
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"referral_status": "activated"}},
        )


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
        "source": data.source,
        "created_at": datetime.utcnow(),
    }
    result = await db.meal_logs.insert_one(log_dict)
    log_dict["_id"] = result.inserted_id

    # Lazily activate pending referral if this user has now logged 3+ meals
    await _check_referral_activation(db, current_user)

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
    if not ObjectId.is_valid(log_id):
        raise HTTPException(status_code=400, detail="Invalid log ID")
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
    from app.data.festivals import get_active_festivals, compute_festival_adjustment

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

    country = (current_user.get("country") or "IN").upper()
    festival_mode = current_user.get("festival_mode") or "awareness"
    base_goal = current_user.get("calorie_goal") or 2000

    try:
        check_date = date.fromisoformat(date_str)
    except ValueError:
        check_date = date.today()

    active_festivals = get_active_festivals(country, check_date)
    festival = active_festivals[0] if active_festivals else None
    festival_adj = compute_festival_adjustment(festival, base_goal, festival_mode)

    # When full mode, effective goal is adjusted
    effective_goal = (
        festival_adj["adjusted_goal"]
        if festival_adj and festival_mode == "full"
        else base_goal
    )

    return {
        "date": date_str,
        "total_calories": total_calories,
        "calorie_goal": effective_goal,
        "meals": [serialize_log(l) for l in logs],
        "meal_breakdown": meal_breakdown,
        "festival_adjustment": festival_adj,
    }


@router.get("/history/range")
async def get_history(
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user),
):
    # Free users are capped to 7 days of history.
    # Pro check: if user is not pro, enforce that the range ≤ 7 days.
    if not current_user.get("is_pro", False):
        try:
            start = date.fromisoformat(start_date)
            end = date.fromisoformat(end_date)
            if (end - start).days > 6:
                # Silently truncate to the last 7 days so the UI degrades gracefully
                start_date = (end - timedelta(days=6)).isoformat()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format")

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


@router.get("/weekly-wrap")
async def get_weekly_wrap(
    week_start: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Weekly summary with fun insights — 'Spotify Wrapped' for calories."""
    db = get_db()
    today = date.today()

    if week_start:
        ws = date.fromisoformat(week_start)
    else:
        ws = today - timedelta(days=today.weekday())  # Most recent Monday

    we = ws + timedelta(days=6)
    ws_str = ws.isoformat()
    we_str = we.isoformat()

    logs = await db.meal_logs.find({
        "user_id": current_user["_id"],
        "date": {"$gte": ws_str, "$lte": we_str},
    }).to_list(500)

    calorie_goal = current_user.get("calorie_goal") or 2000

    # Daily totals
    daily: dict = {}
    food_counts: dict = {}
    meal_type_counts: dict = {}
    context_counts: dict = {}
    unique_foods: set = set()

    for log in logs:
        d = log["date"]
        daily[d] = daily.get(d, 0) + log["total_calories"]
        mt = log.get("meal_type")
        if mt:
            meal_type_counts[mt] = meal_type_counts.get(mt, 0) + 1
        ctx = log.get("context")
        if ctx:
            context_counts[ctx] = context_counts.get(ctx, 0) + 1
        for entry in log.get("entries", []):
            fname = entry.get("food_name", "")
            if fname:
                food_counts[fname] = food_counts.get(fname, 0) + 1
                unique_foods.add(fname)

    total_calories = sum(daily.values())
    days_logged = len(daily)
    avg_daily = round(total_calories / max(days_logged, 1))

    # Best day: closest to goal
    best_day = None
    if daily:
        best_day = min(daily.keys(), key=lambda d: abs(daily[d] - calorie_goal))

    most_logged_food = max(food_counts, key=food_counts.get) if food_counts else None
    most_common_meal = max(meal_type_counts, key=meal_type_counts.get) if meal_type_counts else None

    # Streak: consecutive days with logs from end of week backwards
    streak = 0
    for i in range(6, -1, -1):
        d = (ws + timedelta(days=i)).isoformat()
        if d in daily:
            streak += 1
        else:
            if i < 6:
                break

    consistency_score = days_logged

    # vs previous week
    prev_ws = ws - timedelta(days=7)
    prev_we = prev_ws + timedelta(days=6)
    prev_logs = await db.meal_logs.find({
        "user_id": current_user["_id"],
        "date": {"$gte": prev_ws.isoformat(), "$lte": prev_we.isoformat()},
    }).to_list(500)

    prev_daily: dict = {}
    for log in prev_logs:
        d = log["date"]
        prev_daily[d] = prev_daily.get(d, 0) + log["total_calories"]

    prev_avg = sum(prev_daily.values()) / max(len(prev_daily), 1) if prev_daily else None
    vs_previous_week = None
    if prev_avg and prev_avg > 0:
        vs_previous_week = round((avg_daily - prev_avg) / prev_avg * 100, 1)

    # Fun title
    title = "The Tracker"
    title_emoji = "📊"
    if consistency_score >= 6:
        title = "The Consistent One"
        title_emoji = "🎯"
    elif len(unique_foods) >= 10:
        title = "The Explorer"
        title_emoji = "🧭"
    elif context_counts.get("home", 0) > sum(context_counts.values()) * 0.7:
        title = "The Home Chef"
        title_emoji = "👨‍🍳"
    elif context_counts.get("restaurant", 0) >= 3:
        title = "The Diner Out"
        title_emoji = "🍽️"
    elif total_calories > 0 and avg_daily < calorie_goal * 0.85:
        title = "The Disciplined"
        title_emoji = "💪"
    elif streak >= 5:
        title = "Streak Machine"
        title_emoji = "🔥"

    return {
        "week_start": ws_str,
        "week_end": we_str,
        "total_calories": round(total_calories),
        "avg_daily_calories": avg_daily,
        "best_day": best_day,
        "most_logged_food": most_logged_food,
        "most_common_meal_type": most_common_meal,
        "streak": streak,
        "context_breakdown": context_counts,
        "consistency_score": consistency_score,
        "vs_previous_week": vs_previous_week,
        "title": title,
        "title_emoji": title_emoji,
        "days_logged": days_logged,
        "total_meals": len(logs),
        "unique_foods": len(unique_foods),
        "calorie_goal": calorie_goal,
    }


@router.get("/context-insights")
async def get_context_insights(current_user: dict = Depends(require_pro)):
    """
    Rich context insights for the last 30 days:
      - avg_calories, over_goal_pct, vs_home_delta
      - top_foods (top 3 by frequency)
      - day_of_week: {0-6: avg_kcal}
      - day_of_week_count: {0-6: number_of_logs}  (frequency, not calories)
      - peak_day: weekday name with highest avg calories
      - prev_avg_calories: avg for the prior 30-day window (days 31-60 ago), null if no data
      - trend_pct: % change current vs prior period, positive = calories went UP
    """
    db = get_db()
    today = date.today()
    thirty_days_ago = (today - timedelta(days=30)).isoformat()
    sixty_days_ago  = (today - timedelta(days=60)).isoformat()

    # ── Current window (last 30 days) ────────────────────────────────
    context_logs = await db.meal_logs.find({
        "user_id": current_user["_id"],
        "date": {"$gte": thirty_days_ago},
        "context": {"$exists": True, "$ne": None},
    }).to_list(1000)

    if not context_logs:
        return []

    calorie_goal = current_user.get("calorie_goal") or 2000

    all_logs = await db.meal_logs.find({
        "user_id": current_user["_id"],
        "date": {"$gte": thirty_days_ago},
    }).to_list(2000)

    daily_totals: dict = {}
    for log in all_logs:
        d = log["date"]
        daily_totals[d] = daily_totals.get(d, 0) + log["total_calories"]

    # ── Prior window (days 31-60) ─────────────────────────────────────
    prev_context_logs = await db.meal_logs.find({
        "user_id": current_user["_id"],
        "date": {"$gte": sixty_days_ago, "$lt": thirty_days_ago},
        "context": {"$exists": True, "$ne": None},
    }).to_list(1000)

    prev_avgs: dict = {}  # ctx -> avg_calories in prior window
    prev_buckets: dict = {}
    for log in prev_context_logs:
        ctx = log.get("context")
        if ctx:
            prev_buckets.setdefault(ctx, []).append(log["total_calories"])
    for ctx, cals in prev_buckets.items():
        prev_avgs[ctx] = sum(cals) / len(cals)

    # ── Aggregate current window ──────────────────────────────────────
    DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    context_data: dict = {}
    for log in context_logs:
        ctx = log.get("context")
        if not ctx:
            continue
        if ctx not in context_data:
            context_data[ctx] = {
                "calories": [], "dates": set(),
                "food_counts": {}, "day_calories": {}, "day_counts": {},
            }
        d = log["date"]
        context_data[ctx]["calories"].append(log["total_calories"])
        context_data[ctx]["dates"].add(d)
        dow = datetime.fromisoformat(d).weekday()
        context_data[ctx]["day_calories"].setdefault(dow, []).append(log["total_calories"])
        context_data[ctx]["day_counts"][dow] = context_data[ctx]["day_counts"].get(dow, 0) + 1
        for entry in log.get("entries", []):
            fname = entry.get("food_name", "")
            if fname:
                context_data[ctx]["food_counts"][fname] = context_data[ctx]["food_counts"].get(fname, 0) + 1

    home_avg: Optional[float] = None
    result = []

    for ctx, data in context_data.items():
        cals = data["calories"]
        dates = data["dates"]
        avg_cal = sum(cals) / len(cals)
        days_over = sum(1 for d in dates if daily_totals.get(d, 0) > calorie_goal)
        over_goal_pct = round(days_over / len(dates) * 100) if dates else 0

        top_foods = [f for f, _ in sorted(data["food_counts"].items(), key=lambda x: x[1], reverse=True)[:3]]

        dow_avg: dict = {}
        dow_count: dict = {}
        peak_day = None
        peak_cal = 0.0
        for dow, dow_cals in data["day_calories"].items():
            avg = round(sum(dow_cals) / len(dow_cals))
            dow_avg[str(dow)] = avg
            dow_count[str(dow)] = data["day_counts"].get(dow, 0)
            if avg > peak_cal:
                peak_cal = avg
                peak_day = DAY_NAMES[dow]

        # Trend vs prior period
        prev_avg = prev_avgs.get(ctx)
        trend_pct = None
        if prev_avg and prev_avg > 0:
            trend_pct = round((avg_cal - prev_avg) / prev_avg * 100, 1)

        result.append({
            "context": ctx,
            "avg_calories": round(avg_cal),
            "count": len(cals),
            "over_goal_pct": over_goal_pct,
            "days_with_context": len(dates),
            "vs_home_delta": None,
            "top_foods": top_foods,
            "day_of_week": dow_avg,
            "day_of_week_count": dow_count,
            "peak_day": peak_day,
            "prev_avg_calories": round(prev_avg) if prev_avg else None,
            "trend_pct": trend_pct,
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


# ── Food Personality ──────────────────────────────────────────────────────────
@router.get("/food-personality")
async def get_food_personality(current_user: dict = Depends(require_pro)):
    db = get_db()
    uid = current_user["_id"]
    since = (date.today() - timedelta(days=60)).isoformat()

    logs = await db.meal_logs.find(
        {"user_id": uid, "date": {"$gte": since}}
    ).sort("date", 1).to_list(2000)

    unique_days = set(l["date"] for l in logs)
    if len(unique_days) < 14:
        raise HTTPException(400, "Not enough data — log meals for at least 14 days to unlock your Food Personality")

    goal = current_user.get("calorie_goal", 2000) or 2000
    total_cals: list[float] = []
    day_meal_counts: dict[str, int] = {}
    context_counts: dict[str, int] = {}
    food_counts: dict[str, int] = {}
    weekend_cals: list[float] = []
    weekday_cals: list[float] = []
    day_cal_map: dict[str, float] = {}

    for l in logs:
        d = l["date"]
        cals = l.get("total_calories", 0)
        total_cals.append(cals)
        day_cal_map[d] = day_cal_map.get(d, 0) + cals
        day_meal_counts[d] = day_meal_counts.get(d, 0) + 1

        ctx = l.get("context") or "home"
        context_counts[ctx] = context_counts.get(ctx, 0) + 1

        for entry in l.get("entries", []):
            fn = entry.get("food_name", "")
            if fn:
                food_counts[fn] = food_counts.get(fn, 0) + 1

        try:
            wd = date.fromisoformat(d).weekday()  # 0=Mon 6=Sun
            if wd >= 5:
                weekend_cals.append(cals)
            else:
                weekday_cals.append(cals)
        except ValueError:
            pass

    tracked_days = len(unique_days)
    avg_cal = round(sum(total_cals) / len(total_cals)) if total_cals else 0
    avg_day_cal = round(sum(day_cal_map.values()) / len(day_cal_map)) if day_cal_map else 0
    top_food = max(food_counts, key=food_counts.get) if food_counts else None  # type: ignore[arg-type]
    top_ctx = max(context_counts, key=context_counts.get) if context_counts else "home"
    avg_meals_per_day = sum(day_meal_counts.values()) / len(day_meal_counts) if day_meal_counts else 0

    # Days where user hit 70–110% of goal
    on_target_days = sum(1 for v in day_cal_map.values() if goal * 0.7 <= v <= goal * 1.1)
    consistency_pct = round(on_target_days / tracked_days * 100)

    weekend_avg = round(sum(weekend_cals) / len(weekend_cals)) if weekend_cals else 0
    weekday_avg = round(sum(weekday_cals) / len(weekday_cals)) if weekday_cals else 0

    # Score each personality type
    scores: dict[str, float] = {}

    # Consistent Tracker — high tracking frequency + on-target days
    scores["consistent_tracker"] = (tracked_days / 60) * 50 + consistency_pct * 0.5

    # Meal Skipper — very few meals per day
    if avg_meals_per_day < 2:
        scores["meal_skipper"] = 80
    else:
        scores["meal_skipper"] = max(0, (2 - avg_meals_per_day) * 40)

    # Weekend Warrior — weekend calories significantly higher than weekday
    if weekday_avg > 0:
        ww_ratio = (weekend_avg - weekday_avg) / weekday_avg
        scores["weekend_warrior"] = min(80, max(0, ww_ratio * 200))
    else:
        scores["weekend_warrior"] = 0

    # Street Food Explorer — restaurant/street_food context dominant
    street_count = context_counts.get("restaurant", 0) + context_counts.get("street_food", 0) + context_counts.get("delivery", 0)
    scores["street_food_explorer"] = min(80, street_count / max(len(logs), 1) * 160)

    # Home Cook Hero — home context dominant
    home_ratio = context_counts.get("home", 0) / max(len(logs), 1)
    scores["home_cook_hero"] = min(80, home_ratio * 100)

    # The Balanced One — consistent + near goal + variety
    variety = min(len(food_counts) / 20, 1.0)
    scores["the_balanced_one"] = consistency_pct * 0.5 + variety * 30

    # Late Night Snacker — adhoc context + high avg meal count (proxy)
    adhoc_ratio = context_counts.get("work", 0) / max(len(logs), 1)
    scores["late_night_snacker"] = min(60, adhoc_ratio * 120 + (avg_meals_per_day > 4) * 20)

    # Festival Feaster — not directly detectable without festival data, use high variety + spikes
    max_day_cal = max(day_cal_map.values()) if day_cal_map else 0
    spike_ratio = max_day_cal / goal if goal > 0 else 1
    scores["festival_feaster"] = min(60, max(0, (spike_ratio - 1.3) * 80))

    personality_key = max(scores, key=scores.get)  # type: ignore[arg-type]

    PERSONALITIES = {
        "consistent_tracker": {
            "title": "Consistent Tracker",
            "emoji": "📊",
            "description": "You show up every day, no excuses. Your streak speaks for itself — you've built logging into a habit most people only dream about. Your data is your superpower.",
        },
        "meal_skipper": {
            "title": "Meal Skipper",
            "emoji": "⏭️",
            "description": "You live by the 'quality over quantity' rule — fewer meals, but they count. Whether it's intermittent fasting or just a packed schedule, you make every meal matter.",
        },
        "weekend_warrior": {
            "title": "Weekend Warrior",
            "emoji": "🎉",
            "description": "Weekdays? Disciplined. Weekends? Let's gooo. You've mastered the art of balance — keep the weekday momentum and enjoy those weekend feasts guilt-free.",
        },
        "street_food_explorer": {
            "title": "Street Food Explorer",
            "emoji": "🛵",
            "description": "Chaat, dosa, biryani — you eat where the real flavours are. You're an adventurer at heart, and your food log reads like a city food guide. Keep exploring.",
        },
        "home_cook_hero": {
            "title": "Home Cook Hero",
            "emoji": "🍳",
            "description": "You know exactly what goes into your food — because you made it. Home cooking is your love language, and your body is thanking you for it.",
        },
        "the_balanced_one": {
            "title": "The Balanced One",
            "emoji": "⚖️",
            "description": "You've cracked the code. Consistent, goal-aligned, and varied — your nutrition profile is the benchmark others aspire to. Teach us your ways.",
        },
        "late_night_snacker": {
            "title": "Late Night Snacker",
            "emoji": "🌙",
            "description": "When the world sleeps, your appetite wakes up. You're a creature of the night, and your snack game is unmatched. Just maybe hold off on that midnight biryani sometimes.",
        },
        "festival_feaster": {
            "title": "Festival Feaster",
            "emoji": "🪔",
            "description": "Every celebration is a reason to eat well. From Diwali sweets to birthday cakes, you live for those calorie-spiked joyful moments. Life's too short not to feast.",
        },
    }

    p = PERSONALITIES[personality_key]

    return {
        "personality_type": personality_key,
        "title": p["title"],
        "emoji": p["emoji"],
        "description": p["description"],
        "stats": {
            "tracked_days": tracked_days,
            "avg_daily_calories": avg_day_cal,
            "top_food": top_food,
            "top_context": top_ctx,
            "consistency_pct": consistency_pct,
            "calorie_goal": goal,
        },
    }
