import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def check():
    load_dotenv(Path(__file__).parent / '.env')
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    docs = await db.vehicle_records.find({}).to_list(100)
    required = ['id', 'user_id', 'status', 'entry', 'created_at']

    for i, d in enumerate(docs):
        missing = [f for f in required if f not in d]
        if missing:
            print(f"Record {i} (Plates: {d.get('entry', {}).get('placas_unidad')}) missing fields: {missing}")
            # print(d)

        # Check inside entry
        entry = d.get('entry', {})
        req_entry = ['placas_unidad', 'chofer_nombre', 'guardia_caseta_nombre']
        missing_entry = [f for f in req_entry if f not in entry]
        if missing_entry:
             print(f"Record {i} entry missing fields: {missing_entry}")

    print(f"Validated {len(docs)} records.")

if __name__ == "__main__":
    asyncio.run(check())
