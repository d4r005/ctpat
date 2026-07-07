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

    docs = await db.vehicle_records.find({}).to_list(100)
    mandatory = ['id', 'user_id', 'status', 'created_at']
    for i, d in enumerate(docs):
        missing = [f for f in mandatory if f not in d]
        if missing:
            print(f"Record {i} is missing: {missing}")

if __name__ == "__main__":
    asyncio.run(check())
