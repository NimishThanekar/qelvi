"""
migrate_foods_v2.py — Upsert new food items into MongoDB.

Unlike migrate_foods.py (which drops and recreates the collection),
this script uses upsert so existing 416 items are preserved.

Run from the backend/ directory:
    python migrate_foods_v2.py
"""

import asyncio
import hashlib
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from food_data_v2 import FOOD_DATA_V2

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "calorie_tracker")


def make_id(item: str, category: str) -> str:
    """Stable MD5 ID — same algorithm as migrate_foods.py."""
    key = f"{item.strip().lower()}{category.strip().lower()}"
    return hashlib.md5(key.encode()).hexdigest()[:12]


async def main():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    collection = db["foods"]

    # Ensure text index exists (idempotent)
    await collection.create_index(
        [("item", "text"), ("category", "text")],
        name="food_text_search",
        default_language="english",
    )

    inserted = 0
    updated = 0
    skipped = 0

    for food in FOOD_DATA_V2:
        doc_id = make_id(food["item"], food["category"])
        doc = {"_id": doc_id, **food}

        existing = await collection.find_one({"_id": doc_id})
        if existing:
            # Only update if calorie data differs
            if existing.get("kcal_per_100g") != doc["kcal_per_100g"]:
                await collection.replace_one({"_id": doc_id}, doc)
                updated += 1
            else:
                skipped += 1
        else:
            await collection.insert_one(doc)
            inserted += 1

    total = await collection.count_documents({})
    print(f"\n✅ Migration complete")
    print(f"   Inserted : {inserted}")
    print(f"   Updated  : {updated}")
    print(f"   Skipped  : {skipped} (already identical)")
    print(f"   Total in DB: {total}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
