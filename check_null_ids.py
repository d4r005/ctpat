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
        if 'inspection_id' in d and d['inspection_id'] is None:
            print(f"Record {d.get('id')} has inspection_id: None")
        if 'shipping_ticket_id' in d and d['shipping_ticket_id'] is None:
            print(f"Record {d.get('id')} has shipping_ticket_id: None")

if __name__ == "__main__":
    asyncio.run(check())
