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

    docs = await db.notifications.find({}).sort('created_at', 1).to_list(10)
    for d in docs:
        print(f"Fecha: {d.get('created_at')} | Title: {d.get('title')}")

if __name__ == "__main__":
    asyncio.run(check())
