import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def check():
    load_dotenv(Path(__file__).parent / '.env')
    mongo_url = os.environ.get('MONGO_URL')

    client = AsyncIOMotorClient(mongo_url)
    db = client['ctpat']

    count = await db.vehicle_records.count_documents({})
    print(f"Total vehicle_records in 'ctpat': {count}")

    if count > 0:
        sample = await db.vehicle_records.find_one({})
        print(f"Sample record ID: {sample.get('id')}")

if __name__ == "__main__":
    asyncio.run(check())
