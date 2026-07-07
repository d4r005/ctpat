import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def check():
    load_dotenv(Path(__file__).parent / '.env')
    mongo_url = os.environ.get('MONGO_URL')
    client = AsyncIOMotorClient(mongo_url)
    db = client['SRIUC']

    collections = await db.list_collection_names()
    print(f"Collections in SRIUC: {collections}")

    for coll in collections:
        count = await db[coll].count_documents({})
        print(f"Collection: {coll} | Count: {count}")

if __name__ == "__main__":
    asyncio.run(check())
