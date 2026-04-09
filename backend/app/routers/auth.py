from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from typing import Optional
from pydantic import BaseModel
import secrets
import string
import time
from app.database import get_db
from app.models.schemas import UserRegister, UserLogin, UserUpdate, UserResponse, FestivalAdjustment, Token, PasswordChange
from app.services.auth import (
    verify_password, hash_password, create_access_token,
    decode_token_full, calculate_bmr, calculate_tdee
)
import os
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# ── In-memory user cache (per-process, 60-second TTL) ────────────────────────
# Avoids a MongoDB round-trip on every authenticated request.
# Key: user_id string. Value: (user_dict, expires_at monotonic timestamp).
_user_cache: dict[str, tuple[dict, float]] = {}
_USER_CACHE_TTL = 60.0  # seconds


def _get_cached_user(user_id: str) -> "dict | None":
    entry = _user_cache.get(user_id)
    if entry and time.monotonic() < entry[1]:
        return entry[0]
    return None


def _set_cached_user(user_id: str, user: dict) -> None:
    _user_cache[user_id] = (user, time.monotonic() + _USER_CACHE_TTL)


def _evict_cached_user(user_id: str) -> None:
    _user_cache.pop(user_id, None)


_REFERRAL_CHARS = string.ascii_uppercase + string.digits


async def generate_referral_code(db) -> str:
    """Generate a unique 6-char uppercase alphanumeric referral code."""
    for _ in range(15):  # ample retries; collision probability is negligible
        code = "".join(secrets.choice(_REFERRAL_CHARS) for _ in range(6))
        if not await db.users.find_one({"referral_code": code}):
            return code
    # Extremely unlikely fallback — use 8 chars to reduce collision risk further
    return "".join(secrets.choice(_REFERRAL_CHARS) for _ in range(8))


async def _extend_pro(db, user: dict, days: int) -> None:
    """Extend a user's Pro subscription by `days` days (from now or current expiry)."""
    now = datetime.utcnow()
    current = user.get("pro_expires_at")
    base = current if (isinstance(current, datetime) and current > now) else now
    new_expiry = base + timedelta(days=days)
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"is_pro": True, "pro_expires_at": new_expiry}},
    )


def format_user(user: dict) -> UserResponse:
    from datetime import date as _date
    from app.data.festivals import get_active_festivals, compute_festival_adjustment

    bmr = None
    tdee = None
    if all([user.get("weight_kg"), user.get("height_cm"), user.get("age"), user.get("gender")]):
        bmr = calculate_bmr(user["weight_kg"], user["height_cm"], user["age"], user["gender"])
        tdee = calculate_tdee(bmr, user.get("activity_level", "moderate"))

    country = (user.get("country") or "IN").upper()
    festival_mode = user.get("festival_mode") or "awareness"
    base_goal = user.get("calorie_goal") or 2000

    active_festivals = get_active_festivals(country, _date.today())
    festival = active_festivals[0] if active_festivals else None
    raw_adj = compute_festival_adjustment(festival, base_goal, festival_mode)
    festival_adj = FestivalAdjustment(**raw_adj) if raw_adj else None

    # role is canonical; is_admin stays for backward compat but role="admin" is the truth
    role = user.get("role", "user")
    if user.get("is_admin", False) and role == "user":
        role = "admin"  # back-fill: old admin users without explicit role field

    # practitioner_consent: only meaningful for patients (users with a practitioner_id)
    p_consent: Optional[bool] = None
    if user.get("practitioner_id") is not None:
        p_consent = user.get("practitioner_consent", True)

    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        name=user["name"],
        age=user.get("age"),
        weight_kg=user.get("weight_kg"),
        height_cm=user.get("height_cm"),
        gender=user.get("gender"),
        activity_level=user.get("activity_level"),
        dietary_preferences=user.get("dietary_preferences", []),
        calorie_goal=user.get("calorie_goal"),
        bmr=round(bmr, 1) if bmr else None,
        tdee=round(tdee, 1) if tdee else None,
        is_admin=(role == "admin"),
        is_pro=user.get("is_pro", False),
        ai_uses_remaining=user.get("ai_uses_remaining", 10),
        pro_expires_at=user["pro_expires_at"].isoformat() if user.get("pro_expires_at") else None,
        plan_type=user.get("plan_type"),
        country=country,
        festival_mode=festival_mode,
        festival_adjustment=festival_adj,
        referral_code=user.get("referral_code", ""),
        role=role,
        is_practitioner=(role == "practitioner"),
        practitioner_consent=p_consent,
    )


async def get_current_user(token: str = Depends(oauth2_scheme)):
    db = get_db()

    payload = decode_token_full(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    # ── In-memory cache check ─────────────────────────────────────────
    cached = _get_cached_user(user_id)
    if cached is not None:
        user = cached
    else:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        _set_cached_user(user_id, user)

    # ── Password-change token invalidation ───────────────────────────
    iat = payload.get("iat")
    password_changed_at = user.get("password_changed_at")
    if iat and password_changed_at:
        token_issued = datetime.utcfromtimestamp(iat) if isinstance(iat, (int, float)) else iat
        if isinstance(token_issued, datetime) and isinstance(password_changed_at, datetime):
            # Normalize both to naive UTC to prevent TypeError on timezone-aware comparison
            ti = token_issued.replace(tzinfo=None)
            pc = password_changed_at.replace(tzinfo=None)
            if ti < pc:
                raise HTTPException(status_code=401, detail="Session expired. Please log in again.")

    # ── Auto-downgrade expired Pro subscriptions ──────────────────────
    if user.get("is_pro") and user.get("pro_expires_at"):
        expires_at = user["pro_expires_at"]
        if datetime.utcnow() > expires_at:
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {"is_pro": False}},
            )
            user["is_pro"] = False
            _set_cached_user(user_id, user)  # update cache with downgraded state

    return user


def _is_admin(user: dict) -> bool:
    """True if the user has admin privileges (legacy flag OR canonical role)."""
    return user.get("is_admin", False) or user.get("role") == "admin"


def _is_practitioner(user: dict) -> bool:
    """True if the user has the practitioner role (or is an admin)."""
    return user.get("role") == "practitioner" or _is_admin(user)


async def get_admin_user(current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def require_practitioner(current_user: dict = Depends(get_current_user)):
    """Dependency: allows only users with role='practitioner' (or admins)."""
    if not _is_practitioner(current_user):
        raise HTTPException(status_code=403, detail="Practitioner access required")
    return current_user


async def require_pro(current_user: dict = Depends(get_current_user)):
    """Gate Pro-only endpoints. Checks both the flag and the expiry timestamp."""
    if not current_user.get("is_pro", False):
        raise HTTPException(status_code=403, detail="Pro subscription required")
    # Belt-and-suspenders: verify expiry even though get_current_user auto-downgrades.
    # Guards against edge cases where the downgrade hasn't propagated yet (e.g. cached user).
    expires_at = current_user.get("pro_expires_at")
    if expires_at and datetime.utcnow() > expires_at:
        raise HTTPException(status_code=403, detail="Pro subscription required")
    return current_user


@router.post("/register", response_model=Token)
async def register(data: UserRegister):
    db = get_db()
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Extract the referrer's code before building the user document
    referrer_code_input = (data.referral_code or "").strip().upper()

    # Build the new user document (exclude referral_code — that field name
    # will be reused for the new user's OWN generated code below)
    user_dict = data.model_dump(exclude={"referral_code"})
    user_dict["password"] = hash_password(data.password)
    user_dict["created_at"] = datetime.utcnow()
    user_dict["is_pro"] = False
    user_dict["ai_uses_remaining"] = 10

    # Generate this user's own unique referral code
    user_dict["referral_code"] = await generate_referral_code(db)

    # Auto-calculate calorie goal from TDEE if profile complete
    if all([data.weight_kg, data.height_cm, data.age, data.gender]) and not data.calorie_goal:
        bmr = calculate_bmr(data.weight_kg, data.height_cm, data.age, data.gender)
        user_dict["calorie_goal"] = round(calculate_tdee(bmr, data.activity_level or "moderate"))

    # Resolve referral — silently ignore invalid codes
    referrer = None
    if referrer_code_input:
        referrer = await db.users.find_one({"referral_code": referrer_code_input})
        if referrer:
            now = datetime.utcnow()
            # Track who referred this user (used for Pro-day accounting)
            user_dict["referred_by"] = referrer["_id"]
            user_dict["is_pro"] = True
            user_dict["pro_expires_at"] = now + timedelta(days=7)
            user_dict["pro_source"] = "referral"
            # Practitioner link — only when the referrer has the practitioner role.
            # This is consent-based: the patient chose to use the code, granting
            # data-sharing access. Regular referrals do NOT grant data access.
            if referrer.get("role") == "practitioner":
                user_dict["practitioner_id"] = referrer["_id"]
                user_dict["practitioner_consent"] = True

    result = await db.users.insert_one(user_dict)
    user_dict["_id"] = result.inserted_id

    # Grant up to 7 Pro days to the referrer, capped at 10 total days from referrals.
    if referrer:
        MAX_REFERRAL_PRO_DAYS = 35
        already_earned = referrer.get("referral_pro_days_earned", 0)
        days_to_grant = min(7, MAX_REFERRAL_PRO_DAYS - already_earned)
        if days_to_grant > 0:
            await _extend_pro(db, referrer, days=days_to_grant)
            await db.users.update_one(
                {"_id": referrer["_id"]},
                {"$inc": {"referral_pro_days_earned": days_to_grant}},
            )

    token = create_access_token({"sub": str(result.inserted_id)})
    return Token(access_token=token, token_type="bearer", user=format_user(user_dict))


@router.post("/login", response_model=Token)
async def login(data: UserLogin):
    db = get_db()

    # ── Rate limit: 5 failed attempts per email per 15-minute window ──
    attempt_doc = await db.login_attempts.find_one({"email": data.email})
    if attempt_doc and attempt_doc.get("attempt_count", 0) >= 5:
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Try again in 15 minutes.",
        )

    user = await db.users.find_one({"email": data.email})
    if not user or not verify_password(data.password, user["password"]):
        # Record the failed attempt (upsert: set first_attempt_at only on insert)
        await db.login_attempts.update_one(
            {"email": data.email},
            {
                "$inc": {"attempt_count": 1},
                "$setOnInsert": {"first_attempt_at": datetime.utcnow()},
            },
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Successful login — clear failed-attempt counter
    await db.login_attempts.delete_one({"email": data.email})

    token = create_access_token({"sub": str(user["_id"])})
    return Token(access_token=token, token_type="bearer", user=format_user(user))


@router.get("/me", response_model=UserResponse)
async def me(current_user: dict = Depends(get_current_user)):
    return format_user(current_user)


@router.put("/me", response_model=UserResponse)
async def update_profile(data: UserUpdate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}

    if update_data:
        await db.users.update_one({"_id": current_user["_id"]}, {"$set": update_data})
        current_user.update(update_data)
        _evict_cached_user(str(current_user["_id"]))  # keep cache fresh after profile updates

    return format_user(current_user)


@router.put("/password")
async def change_password(data: PasswordChange, current_user: dict = Depends(get_current_user)):
    """Change password and invalidate all existing tokens by updating password_changed_at."""
    if not current_user.get("password"):
        raise HTTPException(status_code=400, detail="This account uses Google sign-in. Password cannot be changed.")
    if not verify_password(data.current_password, current_user["password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    db = get_db()
    now = datetime.utcnow()
    new_hash = hash_password(data.new_password)
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"password": new_hash, "password_changed_at": now}},
    )
    # Evict from in-memory cache so next request re-reads updated password_changed_at
    _evict_cached_user(str(current_user["_id"]))
    return {"message": "Password changed. Please log in again."}


class PushSubscriptionRequest(BaseModel):
    subscription: dict | None  # None = unsubscribe


@router.put("/push-subscription")
async def save_push_subscription(
    data: PushSubscriptionRequest,
    current_user: dict = Depends(get_current_user),
):
    """Store or clear the Web Push subscription for the current user."""
    db = get_db()
    if data.subscription:
        await db.users.update_one(
            {"_id": current_user["_id"]},
            {"$set": {"push_subscription": data.subscription}},
        )
    else:
        await db.users.update_one(
            {"_id": current_user["_id"]},
            {"$unset": {"push_subscription": ""}},
        )
    return {"ok": True}


class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID token


@router.post("/google", response_model=Token)
async def google_login(data: GoogleAuthRequest):
    """Verify a Google ID token and sign in or create a Qelvi account."""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    if not client_id or client_id == "your-google-client-id-here":
        raise HTTPException(status_code=503, detail="Google OAuth is not configured on this server")

    try:
        id_info = id_token.verify_oauth2_token(
            data.credential,
            google_requests.Request(),
            client_id,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    email: str = id_info.get("email", "")
    name: str = id_info.get("name", email.split("@")[0])
    google_sub: str = id_info.get("sub", "")

    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")

    db = get_db()
    user = await db.users.find_one({"email": email})

    if user is None:
        # Create a new account — no password (Google-only)
        new_user: dict = {
            "email": email,
            "name": name,
            "password": None,
            "google_sub": google_sub,
            "created_at": datetime.utcnow(),
            "dietary_preferences": [],
            "activity_level": "moderate",
            "referral_code": await generate_referral_code(db),
        }
        result = await db.users.insert_one(new_user)
        new_user["_id"] = result.inserted_id
        user = new_user
    elif user.get("google_sub") is None:
        # Existing email/password account — link Google sub
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"google_sub": google_sub}})
        user["google_sub"] = google_sub

    token = create_access_token({"sub": str(user["_id"])})
    return Token(access_token=token, token_type="bearer", user=format_user(user))
