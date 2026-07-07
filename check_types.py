import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def check():
    load_dotenv(Path(__file__).parent / '.env')
    mongo_url = os.environ.get('MONGO_URL')
    db_name = 'naf_inspection'
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    doc = await db.vehicle_records.find_one({})
    if doc:
        for k, v in doc.items():
            print(f"Field: {k} | Type: {type(v)}")

        entry = doc.get('entry', {})
        for k, v in entry.items():
            print(f"Entry Field: {k} | Type: {type(v)}")

if __name__ == "__main__":
    asyncio.run(check())
