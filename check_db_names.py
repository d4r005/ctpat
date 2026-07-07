import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def check():
    load_dotenv(Path(__file__).parent / '.env')
    mongo_url = os.environ.get('MONGO_URL')
    client = AsyncIOMotorClient(mongo_url)

    dbs = await client.list_database_names()
    for name in dbs:
        print(f"DB Name: {repr(name)}")

if __name__ == "__main__":
    asyncio.run(check())
