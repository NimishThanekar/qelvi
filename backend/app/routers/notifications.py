"""
app/routers/notifications.py

POST /notifications/send-reminders

Evaluates three reminder conditions and sends push notifications to
all eligible users who have a push_subscription stored:

  1. "Haven't logged today" — fires at 2 PM IST if no logs for today
  2. "Streak at risk"       — fires at 8 PM IST if streak > 3 and no logs today
  3. "Weekly summary"       — fires every Sunday at 8 PM IST

This endpoint is meant to be called by an external cron (e.g. a free
cron-job.org schedule or a server cron) twice a day:
    POST /notifications/send-reminders?secret=<REMINDER_SECRET>

Set REMINDER_SECRET in .env to protect the endpoint from abuse.
"""

import logging
import os
from datetime import date, timedelta, datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from app.database import get_db
from app.routers.auth import get_admin_user
from app.services.notifications import send_push

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ── Admin broadcast ───────────────────────────────────────────────────────────

class BroadcastRequest(BaseModel):
    title: str
    body: str
    url: str = "/dashboard"
    user_id: Optional[str] = None  # None = send to all subscribers


@router.post("/broadcast")
async def broadcast(data: BroadcastRequest, _admin=Depends(get_admin_user)):
    """
    Admin-only: send a custom push notification to all subscribed users,
    or to a single user when user_id is provided.
    """
    from bson import ObjectId
    db = get_db()

    if data.user_id:
        if not ObjectId.is_valid(data.user_id):
            raise HTTPException(status_code=400, detail="Invalid user ID")
        users = await db.users.find(
            {"_id": ObjectId(data.user_id), "push_subscription": {"$exists": True, "$ne": None}}
        ).to_list(1)
    else:
        users = await db.users.find(
            {"push_subscription": {"$exists": True, "$ne": None}}
        ).to_list(5000)

    sent = errors = 0
    for user in users:
        sub = user.get("push_subscription")
        if not sub:
            continue
        ok = await send_push(sub, data.title, data.body, data.url)
        if ok:
            sent += 1
        else:
            errors += 1
            await db.users.update_one({"_id": user["_id"]}, {"$unset": {"push_subscription": ""}})

    return {"sent": sent, "errors": errors}


@router.get("/stats")
async def push_stats(_admin=Depends(get_admin_user)):
    """Admin-only: count of users with push subscriptions."""
    db = get_db()
    total_users = await db.users.count_documents({})
    subscribed = await db.users.count_documents(
        {"push_subscription": {"$exists": True, "$ne": None}}
    )
    return {"total_users": total_users, "push_subscribed": subscribed}


def _ist_now() -> datetime:
    """Current datetime in IST (UTC+5:30)."""
    from datetime import timezone, timedelta
    IST = timezone(timedelta(hours=5, minutes=30))
    return datetime.now(IST)


async def _count_today_logs(db, user_id, today_str: str) -> int:
    return await db.meal_logs.count_documents(
        {"user_id": user_id, "date": today_str}
    )


async def _get_streak(db, user_id, today_str: str) -> int:
    """Count consecutive logged days ending yesterday."""
    streak = 0
    check = date.fromisoformat(today_str) - timedelta(days=1)
    for _ in range(60):
        count = await db.meal_logs.count_documents(
            {"user_id": user_id, "date": check.isoformat()}
        )
        if count == 0:
            break
        streak += 1
        check -= timedelta(days=1)
    return streak


@router.post("/send-reminders")
async def send_reminders(secret: str = Query(...)):
    """
    Trigger push notifications for all eligible users.
    Protected by a shared secret passed as a query param.
    """
    expected = os.getenv("REMINDER_SECRET", "")
    if expected and secret != expected:
        raise HTTPException(status_code=403, detail="Invalid secret")

    db = get_db()
    now_ist = _ist_now()
    today_str = now_ist.date().isoformat()
    hour = now_ist.hour
    is_sunday = now_ist.weekday() == 6  # 0=Mon, 6=Sun

    # Decide which reminders are in scope for this run
    do_unlogged  = (13 <= hour <= 15)   # 1–3 PM window
    do_streak    = (19 <= hour <= 21)   # 7–9 PM window
    do_weekly    = is_sunday and (19 <= hour <= 21)

    if not any([do_unlogged, do_streak, do_weekly]):
        return {"sent": 0, "skipped": "outside reminder windows"}

    # Fetch all users with a push subscription
    users = await db.users.find(
        {"push_subscription": {"$exists": True, "$ne": None}}
    ).to_list(5000)

    sent = 0
    errors = 0

    for user in users:
        sub = user.get("push_subscription")
        if not sub or not sub.get("endpoint"):
            continue

        uid = user["_id"]
        name = user.get("name", "").split()[0] or "there"
        today_count = await _count_today_logs(db, uid, today_str)

        # ── 1. Haven't logged today (2 PM) ──────────────────────────
        if do_unlogged and today_count == 0:
            ok = await send_push(
                sub,
                title="Time to log your meals 🍽️",
                body=f"Hey {name}, you haven't logged anything today. Keep the streak alive!",
                url="/log",
            )
            if ok:
                sent += 1
            else:
                errors += 1
                # Remove broken subscription
                await db.users.update_one({"_id": uid}, {"$unset": {"push_subscription": ""}})

        # ── 2. Streak at risk (8 PM) ─────────────────────────────────
        if do_streak and today_count == 0:
            streak = await _get_streak(db, uid, today_str)
            if streak > 3:
                ok = await send_push(
                    sub,
                    title=f"Your {streak}-day streak is at risk 🔥",
                    body=f"Log at least one meal today to keep it going, {name}!",
                    url="/log",
                )
                if ok:
                    sent += 1
                else:
                    errors += 1

        # ── 3. Weekly summary (Sunday 8 PM) ─────────────────────────
        if do_weekly:
            # Quick calorie sum for this week
            week_start = (now_ist.date() - timedelta(days=6)).isoformat()
            logs = await db.meal_logs.find({
                "user_id": uid,
                "date": {"$gte": week_start, "$lte": today_str},
            }).to_list(200)
            days_logged = len({l["date"] for l in logs})
            total_kcal = sum(l["total_calories"] for l in logs)
            avg_kcal = round(total_kcal / max(days_logged, 1))

            ok = await send_push(
                sub,
                title="Your weekly summary 📊",
                body=f"{days_logged}/7 days logged this week · avg {avg_kcal} kcal/day. Check your insights!",
                url="/insights",
            )
            if ok:
                sent += 1
            else:
                errors += 1

    logger.info("send-reminders: sent=%d errors=%d", sent, errors)
    return {"sent": sent, "errors": errors, "users_checked": len(users)}
