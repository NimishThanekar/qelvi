import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from app.database import connect_db, close_db
from app.routers import auth, food, logs, groups, custom_foods, ai, notifications, subscription, festivals, referral, practitioner

app = FastAPI(title="Calorie Tracker API", version="1.0.0")

# Explicit CORS allowlist — no wildcard
_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://biological-kellen-qelvi-a4aab6c6.koyeb.app"
]
_PRODUCTION_ORIGIN = os.getenv("PRODUCTION_ORIGIN", "")
if _PRODUCTION_ORIGIN:
    _ALLOWED_ORIGINS.append(_PRODUCTION_ORIGIN)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


@app.on_event("startup")
async def startup():
    # ── Refuse to boot with a weak / default SECRET_KEY ──────────────
    secret_key = os.getenv("SECRET_KEY", "")
    _WEAK_KEYS = {"secret", "your-secret-key", "changeme", "your-secret-key-min-32-chars", ""}
    if len(secret_key) < 32 or secret_key in _WEAK_KEYS:
        raise RuntimeError(
            "FATAL: SECRET_KEY is missing, too short, or is a known default. "
            "Set a strong random value of at least 32 characters in your .env file."
        )

    await connect_db()
    from app.database import get_db as _get_db
    db = _get_db()
    # ai_cache: 30-day TTL + unique hash index
    await db.ai_cache.create_index("created_at", expireAfterSeconds=2592000, name="ai_cache_ttl")
    await db.ai_cache.create_index("text_hash", unique=True, name="ai_cache_hash")
    # referral: unique code lookup + referred_by for count queries
    await db.users.create_index("referral_code", unique=True, sparse=True, name="users_referral_code")
    await db.users.create_index("referred_by", name="users_referred_by")
    # practitioner portal: fast patient list lookup
    await db.users.create_index("practitioner_id", sparse=True, name="users_practitioner_id")
    # login_attempts: 15-minute TTL auto-cleanup
    await db.login_attempts.create_index(
        "first_attempt_at",
        expireAfterSeconds=900,
        name="login_attempts_ttl",
    )
    await db.login_attempts.create_index("email", name="login_attempts_email")
    # registration_attempts: 1-hour TTL auto-cleanup
    await db.registration_attempts.create_index(
        "first_attempt_at",
        expireAfterSeconds=3600,
        name="registration_attempts_ttl",
    )
    await db.registration_attempts.create_index("ip", name="registration_attempts_ip")
    # password_resets: 15-minute TTL auto-cleanup + email lookup
    await db.password_resets.create_index(
        "expires_at",
        expireAfterSeconds=0,
        name="password_resets_ttl",
    )
    await db.password_resets.create_index("email", unique=True, name="password_resets_email")
    # practitioner_access_log: 90-day TTL audit trail
    await db.practitioner_access_log.create_index(
        "timestamp",
        expireAfterSeconds=7776000,  # 90 days
        name="practitioner_access_log_ttl",
    )
    await db.practitioner_access_log.create_index(
        [("practitioner_id", 1), ("timestamp", -1)],
        name="practitioner_access_log_lookup",
    )
    # practitioner_rate_limits: 2-hour TTL (covers any 1-hour window)
    await db.practitioner_rate_limits.create_index(
        "first_request_at",
        expireAfterSeconds=7200,
        name="practitioner_rate_limits_ttl",
    )
    await db.practitioner_rate_limits.create_index(
        [("practitioner_id", 1), ("hour_key", 1)],
        name="practitioner_rate_limits_lookup",
    )
    # ai_daily_totals: global AI cost circuit breaker
    await db.ai_daily_totals.create_index("date", unique=True, name="ai_daily_totals_date")
    await db.ai_daily_totals.create_index(
        "created_at",
        expireAfterSeconds=172800,  # 2 days
        name="ai_daily_totals_ttl",
    )


@app.on_event("shutdown")
async def shutdown():
    await close_db()


app.include_router(auth.router)
app.include_router(food.router)
app.include_router(logs.router)
app.include_router(groups.router)
app.include_router(custom_foods.router)
app.include_router(ai.router)
app.include_router(notifications.router)
app.include_router(subscription.router)
app.include_router(festivals.router)
app.include_router(referral.router)
app.include_router(practitioner.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
