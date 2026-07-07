import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def check():
    load_dotenv(Path(__file__).parent / '.env')
    mongo_url = os.environ.get('MONGO_URL')
    db_name = 'sisp_production'
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    users = await db.users.find({}, {"password_hash": 0}).to_list(100)
    for u in users:
        print(u)

if __name__ == "__main__":
    asyncio.run(check())
