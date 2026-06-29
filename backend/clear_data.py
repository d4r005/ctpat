import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

async def clear_database():
    load_dotenv()
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")

    if not mongo_url or not db_name:
        print("❌ Error: MONGO_URL o DB_NAME no encontrados en .env")
        return

    print(f"🧹 Conectando a {db_name}...")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    collections = ["vehicle_records", "inspections", "shipping_tickets", "notifications"]

    for coll in collections:
        count = await db[coll].count_documents({})
        await db[coll].delete_many({})
        print(f"   🗑️ {coll}: {count} documentos eliminados.")

    print("\n✨ Base de datos limpia.")

if __name__ == "__main__":
    asyncio.run(clear_database())
