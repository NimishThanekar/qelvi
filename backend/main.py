from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import connect_db, close_db
from app.routers import auth, food, logs, groups, custom_foods, ai, notifications, subscription, festivals, referral, practitioner

app = FastAPI(title="Calorie Tracker API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
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
