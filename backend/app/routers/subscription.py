import hmac
import hashlib
import os
from datetime import datetime, timedelta
from typing import Optional

import razorpay
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import get_db
from app.models.schemas import UserResponse
from app.routers.auth import get_current_user, format_user

router = APIRouter(prefix="/subscription", tags=["subscription"])

# Pricing in paise (1 INR = 100 paise)
PLANS: dict[str, dict] = {
    "monthly": {"amount": 14900, "days": 30},
    "annual":  {"amount": 99900, "days": 365},
}


def _razorpay_client() -> razorpay.Client:
    key_id = os.getenv("RAZORPAY_KEY_ID", "")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "")
    if not key_id or not key_secret:
        raise HTTPException(status_code=503, detail="Payment gateway not configured")
    return razorpay.Client(auth=(key_id, key_secret))


# ── Schemas ──────────────────────────────────────────────────────────────────

class CreateOrderRequest(BaseModel):
    plan_type: str  # "monthly" | "annual"


class VerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan_type: str


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/create-order")
async def create_order(
    data: CreateOrderRequest,
    current_user: dict = Depends(get_current_user),
):
    if data.plan_type not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan_type. Use 'monthly' or 'annual'.")

    client = _razorpay_client()
    plan = PLANS[data.plan_type]

    order = client.order.create({
        "amount": plan["amount"],
        "currency": "INR",
        "receipt": f"qelvi_{str(current_user['_id'])}_{data.plan_type}",
        "notes": {
            "user_id": str(current_user["_id"]),
            "plan_type": data.plan_type,
        },
    })

    return {
        "order_id": order["id"],
        "amount": plan["amount"],
        "currency": "INR",
        "key_id": os.getenv("RAZORPAY_KEY_ID"),
    }


@router.post("/verify", response_model=UserResponse)
async def verify_payment(
    data: VerifyRequest,
    current_user: dict = Depends(get_current_user),
):
    if data.plan_type not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan_type.")

    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "")
    if not key_secret:
        raise HTTPException(status_code=503, detail="Payment gateway not configured")

    # Verify Razorpay signature: HMAC-SHA256(order_id + "|" + payment_id, secret)
    message = f"{data.razorpay_order_id}|{data.razorpay_payment_id}"
    expected = hmac.new(
        key_secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, data.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment verification failed")

    # Activate Pro
    db = get_db()
    now = datetime.utcnow()
    expires_at = now + timedelta(days=PLANS[data.plan_type]["days"])

    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {
            "is_pro": True,
            "pro_expires_at": expires_at,
            "pro_source": "razorpay",
            "plan_type": data.plan_type,
        }},
    )

    current_user["is_pro"] = True
    current_user["pro_expires_at"] = expires_at
    current_user["pro_source"] = "razorpay"
    current_user["plan_type"] = data.plan_type

    return format_user(current_user)


@router.get("/status")
async def get_status(current_user: dict = Depends(get_current_user)):
    expires_at = current_user.get("pro_expires_at")
    return {
        "is_pro": current_user.get("is_pro", False),
        "pro_expires_at": expires_at.isoformat() if expires_at else None,
        "plan_type": current_user.get("plan_type"),
    }
