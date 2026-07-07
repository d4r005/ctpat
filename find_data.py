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
    for db_name in dbs:
        if db_name in ['admin', 'local', 'sample_mflix']: continue
        db = client[db_name]
        colls = await db.list_collection_names()
        for c in colls:
            count = await db[c].count_documents({})
            if count > 0:
                print(f"DB: {db_name} | Coll: {c} | Count: {count}")

if __name__ == "__main__":
    asyncio.run(check())
