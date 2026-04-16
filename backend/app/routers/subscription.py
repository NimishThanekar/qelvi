import hmac
import hashlib
import os
from datetime import datetime, timedelta
from typing import Optional
import razorpay
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

# Hardcoded coupon codes — distribute selectively per segment.
# Keys are intentionally opaque: they reveal no discount amount or segment.
# Each code is single-use per user (enforced via coupons_used on user doc).
COUPONS: dict[str, dict] = {
    "QV7K2X": {"pct": 20, "plans": ["monthly", "annual"]},  # AI-maxed users
    "WN3M8P": {"pct": 10, "plans": ["monthly", "annual"]},  # Inactive 5+ days win-back
    "RF5J9L": {"pct": 15, "plans": ["monthly", "annual"]},  # Referral reward
    "LY2Q6T": {"pct": 20, "plans": ["monthly", "annual"]},  # Long-time free users
    "RP4X1Z": {"pct": 15, "plans": ["monthly", "annual"]},  # Expired Pro renewal
}


def _razorpay_client() -> razorpay.Client:
    key_id = os.getenv("RAZORPAY_KEY_ID", "")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "")
    if not key_id or not key_secret:
        raise HTTPException(status_code=503, detail="Payment gateway not configured")
    return razorpay.Client(auth=(key_id, key_secret))


def _apply_coupon(plan_type: str, coupon_code: Optional[str], user: dict) -> tuple[int, Optional[str]]:
    """Returns (final_amount_paise, normalized_code_or_None).
    Raises 400 if the code is invalid, wrong plan, or already used by this user.
    """
    base = PLANS[plan_type]["amount"]
    if not coupon_code:
        return base, None
    code = coupon_code.upper().strip()
    coupon = COUPONS.get(code)
    if not coupon or plan_type not in coupon["plans"]:
        raise HTTPException(status_code=400, detail="Invalid or inapplicable coupon code.")
    if code in user.get("coupons_used", []):
        raise HTTPException(status_code=400, detail="You've already used this coupon.")
    discount = int(base * coupon["pct"] / 100)
    return base - discount, code


# ── Schemas ──────────────────────────────────────────────────────────────────

class ValidateCouponRequest(BaseModel):
    code: str
    plan_type: str


class CreateOrderRequest(BaseModel):
    plan_type: str
    coupon_code: Optional[str] = None


class VerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan_type: str
    coupon_code: Optional[str] = None


class CancelRequest(BaseModel):
    reason: str  # "too_expensive" | "not_using" | "missing_features" | "other"


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/validate-coupon")
async def validate_coupon(
    data: ValidateCouponRequest,
    current_user: dict = Depends(get_current_user),
):
    if data.plan_type not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan_type.")

    code = data.code.upper().strip()
    coupon = COUPONS.get(code)

    if not coupon:
        raise HTTPException(status_code=400, detail="Invalid coupon code.")

    if data.plan_type not in coupon["plans"]:
        raise HTTPException(status_code=400, detail=f"This coupon doesn't apply to the {data.plan_type} plan.")

    # One-time use per user
    if code in current_user.get("coupons_used", []):
        raise HTTPException(status_code=400, detail="You've already used this coupon.")

    base = PLANS[data.plan_type]["amount"]
    discount_paise = int(base * coupon["pct"] / 100)
    final_paise = base - discount_paise

    return {
        "valid": True,
        "discount_pct": coupon["pct"],
        "discount_amount": discount_paise // 100,   # in INR for display
        "original_amount": base // 100,
        "final_amount": final_paise // 100,
        "message": f"{coupon['pct']}% off applied",
    }


@router.post("/create-order")
async def create_order(
    data: CreateOrderRequest,
    current_user: dict = Depends(get_current_user),
):
    if data.plan_type not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan_type. Use 'monthly' or 'annual'.")

    client = _razorpay_client()
    final_amount, applied_code = _apply_coupon(data.plan_type, data.coupon_code, current_user)

    try:
        order = client.order.create({
            "amount": final_amount,
            "currency": "INR",
            "receipt": f"qelvi_{str(current_user['_id'])}_{data.plan_type}",
            "notes": {
                "user_id": str(current_user["_id"]),
                "plan_type": data.plan_type,
                **({"coupon": applied_code} if applied_code else {}),
            },
        })
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment gateway error: {str(e)}")

    return {
        "order_id": order["id"],
        "amount": final_amount,
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

    db = get_db()
    now = datetime.utcnow()
    expires_at = now + timedelta(days=PLANS[data.plan_type]["days"])

    update_fields: dict = {
        "is_pro": True,
        "pro_expires_at": expires_at,
        "pro_source": "razorpay",
        "plan_type": data.plan_type,
        "razorpay_payment_id": data.razorpay_payment_id,
    }

    update_op: dict = {"$set": update_fields}
    if data.coupon_code:
        normalized = data.coupon_code.upper().strip()
        if normalized in COUPONS:
            # $addToSet is idempotent — safe even if verify is called twice
            update_op["$addToSet"] = {"coupons_used": normalized}

    await db.users.update_one({"_id": current_user["_id"]}, update_op)

    current_user.update(update_fields)
    return format_user(current_user)


@router.get("/status")
async def get_status(current_user: dict = Depends(get_current_user)):
    expires_at = current_user.get("pro_expires_at")
    return {
        "is_pro": current_user.get("is_pro", False),
        "pro_expires_at": expires_at.isoformat() if expires_at else None,
        "plan_type": current_user.get("plan_type"),
    }


PLAN_AMOUNT_PAISE: dict[str, int] = {
    "annual": 99900,
    "monthly": 14900,
}
PLAN_DAYS: dict[str, int] = {
    "annual": 365,
    "monthly": 30,
}


@router.post("/cancel")
async def cancel_subscription(
    data: CancelRequest,
    current_user: dict = Depends(get_current_user),
):
    if not current_user.get("is_pro"):
        raise HTTPException(status_code=400, detail="No active Pro subscription to cancel.")

    plan_type = current_user.get("plan_type", "")
    if plan_type == "monthly":
        expires_at = current_user.get("pro_expires_at")
        expires_str = expires_at.strftime("%d %B %Y").lstrip("0") if expires_at else "soon"
        raise HTTPException(
            status_code=400,
            detail=f"Monthly plans are non-refundable and do not auto-renew. Your plan will expire on {expires_str}.",
        )

    payment_id = current_user.get("razorpay_payment_id")
    if not payment_id:
        raise HTTPException(status_code=500, detail="Payment record not found. Please contact support.")

    valid_reasons = {"too_expensive", "not_using", "missing_features", "other"}
    if data.reason not in valid_reasons:
        raise HTTPException(status_code=400, detail="Invalid cancellation reason.")

    now = datetime.utcnow()
    pro_expires_at = current_user.get("pro_expires_at")
    remaining_days = max(0, (pro_expires_at - now).days) if pro_expires_at else 0
    total_days = PLAN_DAYS.get(plan_type, 365)
    amount_paise = PLAN_AMOUNT_PAISE.get(plan_type, 99900)

    refund_paise = int((remaining_days / total_days) * amount_paise * 0.95)
    refund_inr = round(refund_paise / 100, 2)

    if refund_paise >= 100:
        try:
            client = _razorpay_client()
            client.payment.refund(payment_id, {"amount": refund_paise})
        except Exception:
            raise HTTPException(
                status_code=502,
                detail="Refund could not be processed. Please contact support.",
            )

    db = get_db()
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {
            "is_pro": False,
            "pro_expires_at": now,
            "cancellation_reason": data.reason,
        }},
    )

    if refund_paise >= 100:
        message = f"Subscription cancelled. ₹{refund_inr} refund initiated — arrives in 5–7 business days."
    else:
        message = "Subscription cancelled. No refund applicable (remaining value under ₹1)."

    return {"refund_amount": refund_inr, "message": message}
