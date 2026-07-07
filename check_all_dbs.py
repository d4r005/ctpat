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
    print(f"All Databases: {dbs}")

    for db_name in dbs:
        if db_name in ['admin', 'local', 'sample_mflix']:
            continue
        db = client[db_name]
        try:
            vr_count = await db.vehicle_records.count_documents({})
            insp_count = await db.inspections.count_documents({})
            users_count = await db.users.count_documents({})
            print(f"DB: {db_name} | vehicle_records: {vr_count} | inspections: {insp_count} | users: {users_count}")
        except Exception as e:
            print(f"DB: {db_name} | Error: {e}")

if __name__ == "__main__":
    asyncio.run(check())
