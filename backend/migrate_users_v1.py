"""
migrate_users_v1.py — Backfill missing Pro-tier fields on existing users.

Sets defaults for any user document that doesn't already have the field:
  - is_pro           → False
  - ai_uses_remaining → 10

Run from the backend/ directory:
    python migrate_users_v1.py
"""

import asyncio
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "calorie_tracker")


async def main():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]

    # Backfill is_pro where missing
    r1 = await db.users.update_many(
        {"is_pro": {"$exists": False}},
        {"$set": {"is_pro": False}},
    )

    # Backfill ai_uses_remaining where missing
    r2 = await db.users.update_many(
        {"ai_uses_remaining": {"$exists": False}},
        {"$set": {"ai_uses_remaining": 10}},
    )

    total = await db.users.count_documents({})
    print(f"\n✅ Migration complete")
    print(f"   is_pro backfilled         : {r1.modified_count} users")
    print(f"   ai_uses_remaining backfilled: {r2.modified_count} users")
    print(f"   Total users in DB         : {total}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
