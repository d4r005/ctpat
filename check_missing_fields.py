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
    for i, d in enumerate(docs):
        entry = d.get('entry', {})
        if 'guardia_caseta_nombre' not in entry:
            print(f"Record {i} (ID: {d.get('id')}) is missing 'guardia_caseta_nombre'")

if __name__ == "__main__":
    asyncio.run(check())
