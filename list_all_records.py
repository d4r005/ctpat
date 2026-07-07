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

    async for d in db.vehicle_records.find({}):
        print(f"ID: {d.get('id')} | Plates: {d.get('entry', {}).get('placas_unidad')} | Status: {d.get('status')} | Created: {d.get('created_at')}")

if __name__ == "__main__":
    asyncio.run(check())
