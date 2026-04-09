from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import date, timedelta
import re
from app.database import get_db
from app.routers.auth import get_current_user, require_pro, get_optional_current_user
from app.data.festivals import (
    get_active_festivals,
    get_upcoming_festival,
    get_recently_ended_festivals,
    compute_festival_adjustment,
)

router = APIRouter(prefix="/festivals", tags=["festivals"])


# ── GET /festivals/active ─────────────────────────────────────────────────────
# Must be declared BEFORE /{festival_id}/... routes.
@router.get("/active")
async def active_festivals(
    country: str = Query(None),
    current_user: "dict | None" = Depends(get_optional_current_user),
):
    """
    Return festivals active today (and the nearest upcoming within 7 days).
    Public endpoint — no auth required. Authenticated users get personalized
    country/mode and recovery data.
    """
    db = get_db()
    today = date.today()

    resolved_country = (
        country
        or (current_user.get("country", "IN") if current_user else None)
        or "IN"
    ).upper()
    festival_mode = (current_user.get("festival_mode", "awareness") if current_user else "awareness") or "awareness"

    active = get_active_festivals(resolved_country, today)
    upcoming = get_upcoming_festival(resolved_country, today, days_ahead=7)

    # Recovery mode is only available for authenticated users in "full" mode
    recovery = None
    if current_user and festival_mode == "full":
        recently_ended = get_recently_ended_festivals(resolved_country, today)
        if recently_ended:
            f = recently_ended[0]
            days_since_end = f["_days_since_end"]

            base_goal = current_user.get("calorie_goal", 2000) or 2000
            festival_cals = await db.meal_logs.aggregate([
                {
                    "$match": {
                        "user_id": current_user["_id"],
                        "date": {
                            "$gte": f["start_date"],
                            "$lte": f["end_date"],
                        },
                    }
                },
                {"$group": {"_id": None, "total": {"$sum": "$total_calories"}}},
            ]).to_list(1)

            total_cals_during = festival_cals[0]["total"] if festival_cals else 0
            festival_days = (
                date.fromisoformat(f["end_date"]) - date.fromisoformat(f["start_date"])
            ).days + 1
            expected_cals = base_goal * festival_days
            excess = max(0, round(total_cals_during - expected_cals))

            remaining_recovery_days = f["recovery_days"] - days_since_end
            daily_reduction = min(300, round(excess / max(remaining_recovery_days, 1)))
            suggested_goal = max(1200, base_goal - daily_reduction)

            recovery = {
                "festival_name": f["name"],
                "festival_emoji": f["emoji"],
                "ended_date": f["end_date"],
                "recovery_days_total": f["recovery_days"],
                "recovery_day_current": days_since_end,
                "excess_calories": excess,
                "suggested_daily_reduction": daily_reduction,
                "suggested_goal": suggested_goal,
            }

    return {
        "active": active,
        "upcoming": upcoming,
        "recovery": recovery,
    }


# ── GET /festivals/history ───────────────────────────────────────────────────
@router.get("/history")
async def festival_history(current_user: dict = Depends(require_pro)):
    """
    Pro only. Returns calorie performance during past festival periods.
    Compares avg daily calories during the festival vs the week before.
    """
    db = get_db()
    resolved_country = (current_user.get("country", "IN") or "IN").upper()
    today = date.today()

    from app.data.festivals import get_festivals_for_country
    festivals = get_festivals_for_country(resolved_country)

    results = []
    for f in festivals:
        try:
            start = date.fromisoformat(f["start_date"])
            end = date.fromisoformat(f["end_date"])
        except ValueError:
            continue

        # Only include past festivals
        if end >= today:
            continue

        # Baseline: week before the festival
        baseline_start = (start - timedelta(days=7)).isoformat()
        baseline_end = (start - timedelta(days=1)).isoformat()

        # Fetch festival period logs
        fest_pipeline = [
            {
                "$match": {
                    "user_id": current_user["_id"],
                    "date": {"$gte": f["start_date"], "$lte": f["end_date"]},
                }
            },
            {
                "$group": {
                    "_id": "$date",
                    "day_total": {"$sum": "$total_calories"},
                }
            },
        ]
        # Baseline logs
        base_pipeline = [
            {
                "$match": {
                    "user_id": current_user["_id"],
                    "date": {"$gte": baseline_start, "$lte": baseline_end},
                }
            },
            {
                "$group": {
                    "_id": "$date",
                    "day_total": {"$sum": "$total_calories"},
                }
            },
        ]

        fest_days_data = await db.meal_logs.aggregate(fest_pipeline).to_list(50)
        base_days_data = await db.meal_logs.aggregate(base_pipeline).to_list(50)

        if not fest_days_data:
            continue  # User didn't log during this festival

        avg_during = round(
            sum(d["day_total"] for d in fest_days_data) / len(fest_days_data)
        )
        avg_before = (
            round(sum(d["day_total"] for d in base_days_data) / len(base_days_data))
            if base_days_data
            else None
        )
        delta_pct = (
            round((avg_during - avg_before) / avg_before * 100, 1)
            if avg_before and avg_before > 0
            else None
        )

        festival_days_count = (end - start).days + 1
        total_excess = (
            round((avg_during - avg_before) * festival_days_count)
            if avg_before
            else None
        )

        results.append({
            "festival_id": f["id"],
            "festival_name": f["name"],
            "emoji": f["emoji"],
            "start_date": f["start_date"],
            "end_date": f["end_date"],
            "avg_during": avg_during,
            "avg_before": avg_before,
            "delta_pct": delta_pct,
            "excess_calories": total_excess,
            "days_logged": len(fest_days_data),
        })

    return results


# ── GET /festivals/{festival_id}/foods ───────────────────────────────────────
@router.get("/{festival_id}/foods")
async def festival_foods(
    festival_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Return food items matching the festival's food_keywords.
    Queries the foods collection via regex for each keyword.
    """
    db = get_db()
    resolved_country = (current_user.get("country", "IN") or "IN").upper()

    from app.data.festivals import get_festivals_for_country
    all_festivals = get_festivals_for_country(resolved_country)
    festival = next((f for f in all_festivals if f["id"] == festival_id), None)

    if not festival:
        raise HTTPException(404, "Festival not found")

    keywords = festival.get("food_keywords", [])
    if not keywords:
        return []

    # Build an $or regex query for all keywords
    regex_conditions = [
        {"item": {"$regex": kw, "$options": "i"}}
        for kw in keywords
    ]

    foods = await db.foods.find(
        {"$or": regex_conditions},
        {
            "_id": 1, "item": 1, "category": 1, "cuisine": 1,
            "kcal_per_100g": 1, "kcal_per_scoop": 1,
            "kcal_per_bowl": 1, "kcal_per_restaurant_serving": 1,
        }
    ).limit(20).to_list(20)

    def best_serving_cal(food: dict) -> float:
        return (
            food.get("kcal_per_scoop")
            or food.get("kcal_per_bowl")
            or food.get("kcal_per_restaurant_serving")
            or food.get("kcal_per_100g", 0)
        )

    # Sort by relevance: keywords that appear earlier in the list rank higher
    keyword_rank = {kw.lower(): i for i, kw in enumerate(keywords)}

    def relevance_score(food: dict) -> int:
        name = food.get("item", "").lower()
        for kw, rank in keyword_rank.items():
            if kw in name:
                return rank
        return len(keywords)

    foods.sort(key=relevance_score)

    result = []
    for food in foods:
        serving_cal = best_serving_cal(food)
        result.append({
            "id": str(food["_id"]),
            "name": food.get("item", ""),
            "category": food.get("category", ""),
            "cuisine": food.get("cuisine", ""),
            "kcal_per_100g": food.get("kcal_per_100g"),
            "serving_calories": round(serving_cal) if serving_cal else None,
        })

    return result
