from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from bson import ObjectId
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.database import get_db
from app.models.schemas import UserRegister, UserLogin, UserUpdate, UserResponse, Token
from app.services.auth import (
    verify_password, hash_password, create_access_token,
    decode_token, calculate_bmr, calculate_tdee
)
import os
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def format_user(user: dict) -> UserResponse:
    bmr = None
    tdee = None
    if all([user.get("weight_kg"), user.get("height_cm"), user.get("age"), user.get("gender")]):
        bmr = calculate_bmr(user["weight_kg"], user["height_cm"], user["age"], user["gender"])
        tdee = calculate_tdee(bmr, user.get("activity_level", "moderate"))
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
        is_admin=user.get("is_admin", False),
        is_pro=user.get("is_pro", False),
        ai_uses_remaining=user.get("ai_uses_remaining", 10),
    )


async def get_current_user(token: str = Depends(oauth2_scheme)):
    db = get_db()
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_admin_user(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.post("/register", response_model=Token)
async def register(data: UserRegister):
    db = get_db()
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_dict = data.model_dump()
    user_dict["password"] = hash_password(data.password)
    user_dict["created_at"] = datetime.utcnow()
    user_dict["is_pro"] = False
    user_dict["ai_uses_remaining"] = 10
    
    # Auto-calculate calorie goal from TDEE if profile complete
    if all([data.weight_kg, data.height_cm, data.age, data.gender]) and not data.calorie_goal:
        bmr = calculate_bmr(data.weight_kg, data.height_cm, data.age, data.gender)
        user_dict["calorie_goal"] = round(calculate_tdee(bmr, data.activity_level or "moderate"))

    result = await db.users.insert_one(user_dict)
    user_dict["_id"] = result.inserted_id

    token = create_access_token({"sub": str(result.inserted_id)})
    return Token(access_token=token, token_type="bearer", user=format_user(user_dict))


@router.post("/login", response_model=Token)
async def login(data: UserLogin):
    db = get_db()
    user = await db.users.find_one({"email": data.email})
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
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

    return format_user(current_user)


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
