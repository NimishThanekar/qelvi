"""
One-time migration: back-fill missing fields on existing user documents.

Fields added:
  - referral_code       (unique 6-char code, generated if absent)
  - country             (default "IN")
  - festival_mode       (default "awareness")
  - role                (default "user")
  - referral_pro_days_earned  (default 0; set to 7 for users who already
                         have a confirmed referral recorded in referred_by)

Run from backend/:
    python migrate_users.py
"""

import asyncio
import secrets
import string
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "calorie_tracker")

_CHARS = string.ascii_uppercase + string.digits


async def generate_referral_code(db) -> str:
    for _ in range(15):
        code = "".join(secrets.choice(_CHARS) for _ in range(6))
        if not await db.users.find_one({"referral_code": code}):
            return code
    return "".join(secrets.choice(_CHARS) for _ in range(8))


async def main():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]

    users = await db.users.find({}).to_list(length=None)
    print(f"Found {len(users)} users\n")

    updated = 0

    for user in users:
        uid = user["_id"]
        patch = {}

        # 1. referral_code
        if not user.get("referral_code"):
            patch["referral_code"] = await generate_referral_code(db)

        # 2. country
        if not user.get("country"):
            patch["country"] = "IN"

        # 3. festival_mode
        if not user.get("festival_mode"):
            patch["festival_mode"] = "awareness"

        # 4. role
        if not user.get("role"):
            patch["role"] = "user"

        # 5. referral_pro_days_earned
        #    If this user is recorded as the referrer of at least one other user
        #    AND the field doesn't exist yet, seed it from the actual referral count
        #    (capped at 35) so the cap logic stays accurate going forward.
        if "referral_pro_days_earned" not in user:
            referral_count = await db.users.count_documents({"referred_by": uid})
            earned = min(referral_count * 7, 35)
            patch["referral_pro_days_earned"] = earned

        if patch:
            await db.users.update_one({"_id": uid}, {"$set": patch})
            name = user.get("name", user.get("email", str(uid)))
            print(f"  [updated] {name}: {list(patch.keys())}")
            updated += 1
        else:
            name = user.get("name", user.get("email", str(uid)))
            print(f"  [skip] {name}: nothing to update")

    print(f"\nDone. {updated}/{len(users)} users updated.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
