import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def check():
    load_dotenv(Path(__file__).parent / '.env')
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    print(f"Connecting to {db_name}...")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    count = await db.vehicle_records.count_documents({})
    print(f"Total vehicle_records: {count}")

    if count > 0:
        sample = await db.vehicle_records.find_one({})
        print(f"Sample record ID: {sample.get('id')}")
        print(f"Sample status: {sample.get('status')}")

    count_ins = await db.inspections.count_documents({})
    print(f"Total inspections: {count_ins}")

    dbs = await client.list_database_names()
    print(f"All Databases: {dbs}")

if __name__ == "__main__":
    asyncio.run(check())
