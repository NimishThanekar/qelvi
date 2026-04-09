from fastapi import APIRouter, Depends
from app.database import get_db
from app.routers.auth import get_current_user, generate_referral_code

router = APIRouter(prefix="/referral", tags=["referral"])


@router.get("/stats")
async def referral_stats(current_user: dict = Depends(get_current_user)):
    """
    Return the current user's referral stats.

    referral_count  — number of users who signed up using this user's referral code.
    total_pro_days_earned — referral_count × 30 days.
    is_practitioner — whether this user has the practitioner role.
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

    return {
        "referral_code": referral_code,
        "referral_count": referral_count,
        "total_pro_days_earned": current_user.get("referral_pro_days_earned", 0),
        "is_practitioner": current_user.get("is_practitioner", False),
    }
