from fastapi import APIRouter, Depends
from app.database import get_db
from app.routers.auth import get_current_user, generate_referral_code

router = APIRouter(prefix="/referral", tags=["referral"])

MAX_REFERRAL_PRO_DAYS = 365  # single user earns at most 365 Pro days via referrals


@router.get("/stats")
async def referral_stats(current_user: dict = Depends(get_current_user)):
    """
    Return the current user's referral stats.

    referral_count      — total users who signed up with this user's referral code.
    pending_count       — referred users who haven't logged 3 meals yet.
    activated_count     — referred users whose referral has been activated (3+ meals).
    total_pro_days_earned — Pro days earned through referrals so far.
    referral_cap_reached  — True when the user has hit the 365-day cap.
    is_practitioner     — whether this user has the practitioner role.
    """
    db = get_db()
    user_id = current_user["_id"]

    # Back-fill referral code for existing users who predate the referral feature.
    referral_code = current_user.get("referral_code") or ""
    if not referral_code:
        referral_code = await generate_referral_code(db)
        await db.users.update_one(
            {"_id": user_id},
            {"$set": {"referral_code": referral_code}},
        )

    referral_count = await db.users.count_documents({"referred_by": user_id})
    pending_count = await db.users.count_documents(
        {"referred_by": user_id, "referral_status": "pending"}
    )
    activated_count = await db.users.count_documents(
        {"referred_by": user_id, "referral_status": "activated"}
    )

    earned_days = current_user.get("referral_pro_days_earned", 0)
    referral_cap_reached = earned_days >= MAX_REFERRAL_PRO_DAYS

    return {
        "referral_code": referral_code,
        "referral_count": referral_count,
        "pending_count": pending_count,
        "activated_count": activated_count,
        "total_pro_days_earned": earned_days,
        "referral_cap_reached": referral_cap_reached,
        "is_practitioner": current_user.get("role") == "practitioner",
    }
