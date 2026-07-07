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
        try:
            res = await db.inspections.find_one({"placas_unidad": "INS-001"})
            if res:
                print(f"FOUND INS-001 in DB: {db_name}")
        except: pass

if __name__ == "__main__":
    asyncio.run(check())
