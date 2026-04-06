"""
app/routers/ai.py — POST /ai/estimate

Cost controls (in order of evaluation):
  1. Auth guard — every request must be authenticated
  2. Rate limit — free users: 10 lifetime uses; Pro users: 20 per day
  3. Cache check — normalized text → MD5 → look up ai_cache (30-day TTL)
  4. Anthropic API call — only if all above pass
  5. Decrement counter — only on real (non-cached) API calls
"""

import hashlib
import json
import logging
import os
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.schemas import AIEstimateItem, AIEstimateRequest, AIEstimateResponse
from app.routers.auth import get_current_user

router = APIRouter(prefix="/ai", tags=["ai"])

FREE_TIER_LIMIT = 10
PRO_DAILY_LIMIT = 20

SYSTEM_PROMPT = """\
You are a calorie estimation assistant for an Indian food tracking app.
The user will describe a meal in English, Hindi, or Hinglish (mixed).

Return ONLY a valid JSON object — no markdown, no explanation, no code fences.

JSON structure:
{
  "items": [
    {"name": "Food name in English", "quantity": 1, "unit": "bowl", "estimated_calories": 150}
  ],
  "total_calories": 150,
  "confidence": "high"
}

Indian portion defaults (use unless user specifies otherwise):
- 1 roti / chapati = 80 kcal, unit "piece"
- 1 paratha = 200 kcal, unit "piece"
- 1 puri = 100 kcal, unit "piece"
- 1 bowl dal / sabzi / curry = 150 kcal, unit "bowl"
- 1 bowl rice / biryani = 200 kcal, unit "bowl"
- 1 cup tea / chai = 50 kcal, unit "cup"
- 1 glass lassi = 180 kcal, unit "glass"
- 1 samosa = 150 kcal, unit "piece"
- 1 plate chole bhature = 550 kcal, unit "plate"
- 1 dosa (plain) = 160 kcal, unit "piece"
- 1 idli = 60 kcal, unit "piece"

Rules:
- Parse each distinct food item separately
- For ambiguous items, assume home-cooked medium portion
- quantity must be a number (0.5, 1, 2, etc.)
- confidence: "high" = portions clear, "medium" = estimated, "low" = very unclear
- estimated_calories must be an integer
- total_calories = sum of (quantity × estimated_calories) for all items
- Return ONLY the JSON object, nothing else
"""


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _cache_key(text: str) -> str:
    return hashlib.md5(_normalize(text).encode()).hexdigest()


async def _check_rate_limit(user: dict) -> tuple[bool, int, bool]:
    """Returns (allowed, uses_remaining_or_today, is_pro)."""
    is_pro = user.get("is_pro", False)
    if is_pro:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        if user.get("ai_uses_today_date") == today:
            used_today = user.get("ai_uses_today", 0)
        else:
            used_today = 0
        remaining = PRO_DAILY_LIMIT - used_today
        return remaining > 0, remaining, True
    else:
        remaining = user.get("ai_uses_remaining", FREE_TIER_LIMIT)
        return remaining > 0, remaining, False


async def _decrement_usage(user: dict, is_pro: bool, db) -> None:
    if is_pro:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        if user.get("ai_uses_today_date") == today:
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$inc": {"ai_uses_today": 1}},
            )
        else:
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {"ai_uses_today": 1, "ai_uses_today_date": today}},
            )
    else:
        current = user.get("ai_uses_remaining", FREE_TIER_LIMIT)
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"ai_uses_remaining": max(0, current - 1)}},
        )


@router.post("/estimate", response_model=AIEstimateResponse)
async def estimate(
    data: AIEstimateRequest,
    current_user: dict = Depends(get_current_user),
):
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    if len(text) > 500:
        raise HTTPException(status_code=400, detail="Text too long (max 500 characters)")

    db = get_db()

    # ── 1. Rate limit check ───────────────────────────────────────────
    allowed, remaining, is_pro = await _check_rate_limit(current_user)
    if not allowed:
        if is_pro:
            raise HTTPException(
                status_code=429,
                detail=f"Pro daily limit of {PRO_DAILY_LIMIT} AI estimates reached. Resets tomorrow.",
            )
        raise HTTPException(status_code=403, detail="free_limit_reached")

    # ── 2. Cache lookup ───────────────────────────────────────────────
    cache_key = _cache_key(text)
    cached_doc = await db.ai_cache.find_one({"text_hash": cache_key})

    if cached_doc:
        r = cached_doc["response"]
        return AIEstimateResponse(
            items=[AIEstimateItem(**item) for item in r["items"]],
            total_calories=r["total_calories"],
            confidence=r["confidence"],
            cached=True,
        )

    # ── 3. Groq API call ──────────────────────────────────────────────
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI service is not configured on this server")

    try:
        from groq import Groq as _Groq  # lazy import — server starts without the package
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable: run `pip install groq` on the server",
        )

    try:
        client = _Groq(api_key=api_key)
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            max_tokens=1024,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
        )
        raw = completion.choices[0].message.content.strip()
    except Exception as exc:
        logger.exception("Groq API call failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"AI service error: {exc}")

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("JSON parse failed. Raw response was: %r — error: %s", raw, exc)
        raise HTTPException(status_code=500, detail="AI returned an unparseable response. Please try again.")

    # ── 4. Validate and normalise items ──────────────────────────────
    items: list[dict] = []
    total = 0
    for entry in parsed.get("items", []):
        cal = int(entry.get("estimated_calories", 0))
        qty = float(entry.get("quantity", 1))
        items.append(
            {
                "name": str(entry.get("name", "Unknown")),
                "quantity": qty,
                "unit": str(entry.get("unit", "serving")),
                "estimated_calories": cal,
            }
        )
        total += round(qty * cal)

    confidence = parsed.get("confidence", "medium")
    if confidence not in ("high", "medium", "low"):
        confidence = "medium"

    response_payload = {"items": items, "total_calories": total, "confidence": confidence}

    # ── 5. Store in cache ─────────────────────────────────────────────
    await db.ai_cache.update_one(
        {"text_hash": cache_key},
        {
            "$set": {
                "text_hash": cache_key,
                "text": _normalize(text),
                "response": response_payload,
                "created_at": datetime.utcnow(),
            }
        },
        upsert=True,
    )

    # ── 6. Decrement usage counter (only real API calls) ──────────────
    await _decrement_usage(current_user, is_pro, db)

    return AIEstimateResponse(
        items=[AIEstimateItem(**item) for item in items],
        total_calories=total,
        confidence=confidence,
        cached=False,
    )
