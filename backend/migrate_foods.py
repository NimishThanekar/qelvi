"""
One-time migration script: loads Final_FoodDataset.xlsx into MongoDB foods collection.
Run once from the backend directory:
    python migrate_foods.py
"""
import asyncio
import hashlib
import os
import pandas as pd
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "calorie_tracker")
DATASET_PATH = os.path.join(os.path.dirname(__file__), "Final_FoodDataset.xlsx")


async def migrate():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    collection = db["foods"]

    df = pd.read_excel(DATASET_PATH)
    df = df.fillna(0)

    docs = []
    for _, row in df.iterrows():
        food_id = hashlib.md5(f"{row['Item']}{row['Category']}".encode()).hexdigest()[:12]
        docs.append({
            "_id": food_id,
            "id": food_id,
            "item": str(row["Item"]),
            "category": str(row["Category"]),
            "cuisine": str(row["Cuisine"]),
            "kcal_per_100g": float(row["kcal_per_100g"]),
            "scoop_g": float(row["scoop_g"]) if row["scoop_g"] else None,
            "bowl_g": float(row["bowl_g"]) if row["bowl_g"] else None,
            "restaurant_g": float(row["restaurant_g"]) if row["restaurant_g"] else None,
            "kcal_per_scoop": float(row["kcal_per_scoop"]) if row["kcal_per_scoop"] else None,
            "kcal_per_bowl": float(row["kcal_per_bowl"]) if row["kcal_per_bowl"] else None,
            "kcal_per_restaurant_serving": float(row["kcal_per_restaurant_serving"]) if row["kcal_per_restaurant_serving"] else None,
        })

    # Drop and re-insert for a clean migration
    await collection.drop()
    result = await collection.insert_many(docs)
    print(f"Migrated {len(result.inserted_ids)} food items to MongoDB")

    # Index for fast text search on item name
    await collection.create_index("item")
    await collection.create_index("category")
    await collection.create_index("cuisine")
    print("Indexes created on item, category, cuisine")

    client.close()


if __name__ == "__main__":
    asyncio.run(migrate())
