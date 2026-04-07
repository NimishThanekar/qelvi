from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, date, timedelta
from app.database import get_db
from app.models.schemas import (
    GroupCreate, CheckinRequest, GroupSettingsUpdate,
    SetAnchorRequest, RegenerateCodeRequest,
)
from app.routers.auth import get_current_user, require_pro
import random
import string

router = APIRouter(prefix="/groups", tags=["groups"])


def _generate_code(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


async def _missed_days(db, group_id: ObjectId, user_id: ObjectId, created_at: datetime) -> int:
    """Count consecutive missed days before today (max 7)."""
    creation_date = created_at.date() if hasattr(created_at, "date") else date.today()
    missed = 0
    check = date.today() - timedelta(days=1)
    for _ in range(7):
        if check < creation_date:
            break
        rec = await db.group_checkins.find_one({
            "group_id": group_id, "user_id": user_id, "date": check.isoformat()
        })
        if rec:
            break
        missed += 1
        check -= timedelta(days=1)
    return missed


# ── GET /my must be declared BEFORE /{group_id}/... routes ───────────────────
@router.get("/my")
async def get_my_groups(current_user: dict = Depends(get_current_user)):
    db = get_db()
    today = date.today().isoformat()
    me_str = str(current_user["_id"])

    groups = await db.groups.find({"member_ids": current_user["_id"]}).to_list(10)
    result = []

    for group in groups:
        anchor_pairs: dict = group.get("anchor_pairs", {})
        members = []

        for mid in group["member_ids"]:
            user = await db.users.find_one({"_id": mid}, {"name": 1})
            if not user:
                continue

            checkin = await db.group_checkins.find_one({
                "group_id": group["_id"], "user_id": mid, "date": today,
            })

            missed = 0
            if not checkin:
                missed = await _missed_days(
                    db, group["_id"], mid,
                    group.get("created_at", datetime.utcnow())
                )

            mid_str = str(mid)
            anchor_uid = anchor_pairs.get(mid_str)

            anchor_missing = False
            if anchor_uid:
                try:
                    a_oid = ObjectId(anchor_uid)
                    a_missed = await _missed_days(
                        db, group["_id"], a_oid,
                        group.get("created_at", datetime.utcnow())
                    )
                    anchor_missing = a_missed >= 2
                except Exception:
                    pass

            members.append({
                "user_id": mid_str,
                "name": user.get("name", "Unknown"),
                "checked_in_today": checkin is not None,
                "is_me": mid_str == me_str,
                "mood": checkin.get("mood") if checkin else None,
                "missed_days": missed,
                "anchor_user_id": anchor_uid,
                "anchor_missing": anchor_missing,
            })

        # Mask expired codes
        code_expires_at = group.get("code_expires_at")
        if code_expires_at:
            try:
                if datetime.fromisoformat(code_expires_at) < datetime.utcnow():
                    code_expires_at = "expired"
            except Exception:
                pass

        result.append({
            "id": str(group["_id"]),
            "name": group["name"],
            "code": group["code"],
            "members": members,
            "reset_time": group.get("reset_time", "23:00"),
            "reset_timezone": group.get("reset_timezone", "Asia/Kolkata"),
            "code_expires_at": code_expires_at,
            "is_creator": str(group.get("created_by")) == me_str,
            "anchor_pairs": anchor_pairs,
        })

    return result


# ── CRUD ──────────────────────────────────────────────────────────────────────
@router.post("/create")
async def create_group(data: GroupCreate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    existing_count = await db.groups.count_documents({"member_ids": current_user["_id"]})
    is_pro = current_user.get("is_pro", False)
    if not is_pro and existing_count >= 1:
        raise HTTPException(403, "Free users can have 1 buddy. Upgrade to Pro for unlimited.")
    if is_pro and existing_count >= 5:
        raise HTTPException(400, "You can only be in up to 5 groups")

    code = _generate_code()
    while await db.groups.find_one({"code": code}):
        code = _generate_code()

    doc = {
        "name": data.name,
        "code": code,
        "created_by": current_user["_id"],
        "member_ids": [current_user["_id"]],
        "created_at": datetime.utcnow(),
        "reset_time": "23:00",
        "reset_timezone": "Asia/Kolkata",
        "code_expires_at": None,
        "anchor_pairs": {},
    }
    result = await db.groups.insert_one(doc)
    return {"id": str(result.inserted_id), "name": data.name, "code": code}


@router.post("/join/{code}")
async def join_group(code: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    # Enforce buddy limit before even looking up the group
    existing_count = await db.groups.count_documents({"member_ids": current_user["_id"]})
    is_pro = current_user.get("is_pro", False)
    if not is_pro and existing_count >= 1:
        raise HTTPException(403, "Free users can have 1 buddy. Upgrade to Pro for unlimited.")

    group = await db.groups.find_one({"code": code.upper()})
    if not group:
        raise HTTPException(404, "Group not found — check the code")

    expires_at = group.get("code_expires_at")
    if expires_at and expires_at != "expired":
        try:
            if datetime.fromisoformat(expires_at) < datetime.utcnow():
                raise HTTPException(400, "Invite code has expired")
        except ValueError:
            pass

    if len(group["member_ids"]) >= 5:
        raise HTTPException(400, "Group is full (max 5 members)")
    if current_user["_id"] in group["member_ids"]:
        raise HTTPException(400, "Already a member of this group")

    await db.groups.update_one(
        {"_id": group["_id"]}, {"$push": {"member_ids": current_user["_id"]}}
    )
    return {"message": "Joined", "group_id": str(group["_id"])}


@router.post("/checkin/{group_id}")
async def checkin(
    group_id: str,
    data: CheckinRequest = CheckinRequest(),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(400, "Invalid group id")

    group = await db.groups.find_one({"_id": oid})
    if not group or current_user["_id"] not in group["member_ids"]:
        raise HTTPException(404, "Group not found or not a member")

    today = date.today().isoformat()
    fields: dict = {"checked_in_at": datetime.utcnow()}
    if data.mood:
        fields["mood"] = data.mood

    await db.group_checkins.update_one(
        {"group_id": oid, "user_id": current_user["_id"], "date": today},
        {"$set": fields},
        upsert=True,
    )
    return {"message": "Checked in", "date": today}


@router.post("/checkin/{group_id}/mood")
async def set_mood(
    group_id: str,
    data: CheckinRequest,
    current_user: dict = Depends(get_current_user),
):
    """Set or update mood on today's existing check-in."""
    db = get_db()
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(400, "Invalid group id")

    today = date.today().isoformat()
    res = await db.group_checkins.update_one(
        {"group_id": oid, "user_id": current_user["_id"], "date": today},
        {"$set": {"mood": data.mood}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "No check-in for today — check in first")
    return {"message": "Mood updated"}


# ── Per-group management (must come after /my and /checkin/...) ───────────────
@router.get("/{group_id}/recap")
async def weekly_recap(group_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(400, "Invalid group id")

    group = await db.groups.find_one({"_id": oid})
    if not group or current_user["_id"] not in group["member_ids"]:
        raise HTTPException(404, "Not found")

    today = date.today()
    week_start = today - timedelta(days=today.weekday())          # Monday
    last_week_start = week_start - timedelta(days=7)

    this_dates = [(week_start + timedelta(days=i)).isoformat()
                  for i in range((today - week_start).days + 1)]
    last_dates = [(last_week_start + timedelta(days=i)).isoformat() for i in range(7)]

    n = len(group["member_ids"])

    this_count = await db.group_checkins.count_documents(
        {"group_id": oid, "date": {"$in": this_dates}}
    )
    last_count = await db.group_checkins.count_documents(
        {"group_id": oid, "date": {"$in": last_dates}}
    )

    # Best consecutive-day streak this week (any member checked in)
    streak = best_streak = 0
    for d in this_dates:
        cnt = await db.group_checkins.count_documents({"group_id": oid, "date": d})
        if cnt > 0:
            streak += 1
            best_streak = max(best_streak, streak)
        else:
            streak = 0

    total_this = n * len(this_dates)
    total_last = n * 7
    vs = 0
    if total_this > 0 and total_last > 0:
        vs = round((this_count / total_this - last_count / total_last) * 100)

    return {
        "group_id": group_id,
        "group_name": group["name"],
        "checkin_days": this_count,
        "total_possible": total_this,
        "best_streak": best_streak,
        "vs_last_week": vs,
    }


@router.put("/{group_id}/settings")
async def update_settings(
    group_id: str,
    data: GroupSettingsUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(400, "Invalid group id")

    group = await db.groups.find_one({"_id": oid})
    if not group:
        raise HTTPException(404, "Not found")
    if group.get("created_by") != current_user["_id"]:
        raise HTTPException(403, "Only the creator can change settings")

    update: dict = {}
    if data.reset_time:
        update["reset_time"] = data.reset_time
    if data.reset_timezone:
        update["reset_timezone"] = data.reset_timezone
    if update:
        await db.groups.update_one({"_id": oid}, {"$set": update})
    return {"message": "Settings updated"}


@router.post("/{group_id}/anchor")
async def set_anchor(
    group_id: str,
    data: SetAnchorRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(400, "Invalid group id")

    group = await db.groups.find_one({"_id": oid})
    if not group or current_user["_id"] not in group["member_ids"]:
        raise HTTPException(404, "Not found or not a member")

    me = str(current_user["_id"])
    pairs: dict = dict(group.get("anchor_pairs", {}))

    # Remove existing pairing for me
    old = pairs.pop(me, None)
    if old:
        pairs.pop(old, None)

    # Set new bidirectional pairing
    if data.anchor_user_id:
        pairs[me] = data.anchor_user_id
        pairs[data.anchor_user_id] = me

    await db.groups.update_one({"_id": oid}, {"$set": {"anchor_pairs": pairs}})
    return {"message": "Anchor updated"}


@router.post("/{group_id}/regenerate-code")
async def regenerate_code(
    group_id: str,
    data: RegenerateCodeRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(400, "Invalid group id")

    group = await db.groups.find_one({"_id": oid})
    if not group:
        raise HTTPException(404, "Not found")
    if group.get("created_by") != current_user["_id"]:
        raise HTTPException(403, "Only the creator can regenerate the code")

    new_code = _generate_code()
    while await db.groups.find_one({"code": new_code}):
        new_code = _generate_code()

    expires_at = None
    if data.expires_in == "24h":
        expires_at = (datetime.utcnow() + timedelta(hours=24)).isoformat()
    elif data.expires_in == "7d":
        expires_at = (datetime.utcnow() + timedelta(days=7)).isoformat()

    await db.groups.update_one(
        {"_id": oid}, {"$set": {"code": new_code, "code_expires_at": expires_at}}
    )
    return {"code": new_code, "code_expires_at": expires_at}
