from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, date
from app.database import get_db
from app.models.schemas import GroupCreate
from app.routers.auth import get_current_user
import random
import string

router = APIRouter(prefix="/groups", tags=["groups"])


def _generate_code(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


@router.post("/create")
async def create_group(data: GroupCreate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    existing = await db.groups.count_documents({"member_ids": current_user["_id"]})
    if existing >= 5:
        raise HTTPException(status_code=400, detail="You can only be in up to 5 groups")

    code = _generate_code()
    while await db.groups.find_one({"code": code}):
        code = _generate_code()

    doc = {
        "name": data.name,
        "code": code,
        "created_by": current_user["_id"],
        "member_ids": [current_user["_id"]],
        "created_at": datetime.utcnow(),
    }
    result = await db.groups.insert_one(doc)
    return {"id": str(result.inserted_id), "name": data.name, "code": code}


@router.post("/join/{code}")
async def join_group(code: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    group = await db.groups.find_one({"code": code.upper()})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found — check the code")
    if len(group["member_ids"]) >= 5:
        raise HTTPException(status_code=400, detail="Group is full (max 5 members)")
    if current_user["_id"] in group["member_ids"]:
        raise HTTPException(status_code=400, detail="Already a member of this group")

    await db.groups.update_one(
        {"_id": group["_id"]},
        {"$push": {"member_ids": current_user["_id"]}},
    )
    return {"message": "Joined", "group_id": str(group["_id"])}


@router.post("/checkin/{group_id}")
async def checkin(group_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group id")

    group = await db.groups.find_one({"_id": oid})
    if not group or current_user["_id"] not in group["member_ids"]:
        raise HTTPException(status_code=404, detail="Group not found or not a member")

    today = date.today().isoformat()
    await db.group_checkins.update_one(
        {"group_id": oid, "user_id": current_user["_id"], "date": today},
        {"$set": {"checked_in_at": datetime.utcnow()}},
        upsert=True,
    )
    return {"message": "Checked in", "date": today}


@router.get("/my")
async def get_my_groups(current_user: dict = Depends(get_current_user)):
    db = get_db()
    today = date.today().isoformat()

    groups = await db.groups.find({"member_ids": current_user["_id"]}).to_list(10)
    result = []

    for group in groups:
        members = []
        for mid in group["member_ids"]:
            user = await db.users.find_one({"_id": mid}, {"name": 1})
            if user:
                checkin = await db.group_checkins.find_one({
                    "group_id": group["_id"],
                    "user_id": mid,
                    "date": today,
                })
                members.append({
                    "user_id": str(mid),
                    "name": user.get("name", "Unknown"),
                    "checked_in_today": checkin is not None,
                    "is_me": str(mid) == str(current_user["_id"]),
                })

        result.append({
            "id": str(group["_id"]),
            "name": group["name"],
            "code": group["code"],
            "members": members,
        })

    return result
