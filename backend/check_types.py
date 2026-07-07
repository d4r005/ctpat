import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def check():
    load_dotenv(Path(__file__).parent / '.env')
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    doc = await db.vehicle_records.find_one({})
    if doc:
        print(f"Record created_at type: {type(doc.get('created_at'))}")
        print(f"Record created_at value: {doc.get('created_at')}")

    insp = await db.inspections.find_one({})
    if insp:
        print(f"Inspection created_at type: {type(insp.get('created_at'))}")
        print(f"Inspection created_at value: {insp.get('created_at')}")

if __name__ == "__main__":
    asyncio.run(check())
