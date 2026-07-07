import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def check():
    load_dotenv(Path(__file__).parent / '.env')
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME', 'naf_inspection')
    print(f"Checking links in {db_name}...")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    insps = await db.inspections.find({}).to_list(100)
    recs = await db.vehicle_records.find({}).to_list(100)

    rec_ids = {r.get('id') for r in recs}
    print(f"Total vehicle_records: {len(recs)}")
    print(f"Total inspections: {len(insps)}")

    linked = 0
    unlinked = 0
    for i in insps:
        rid = i.get('record_id')
        if rid in rec_ids:
            linked += 1
        else:
            unlinked += 1
            print(f"Inspection {i.get('id')} has record_id {rid} which DOES NOT EXIST in vehicle_records")

    print(f"Linked: {linked}, Unlinked: {unlinked}")

if __name__ == "__main__":
    asyncio.run(check())
