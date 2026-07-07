import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def scan():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    target_dbs = ["SRIUC", "ctpat", "inspeccion_naf", "naf", "sisp_production", "sriuc_data"]

    for db_name in target_dbs:
        db = client[db_name]
        try:
            print(f"\n--- Escaneando DB: {db_name} ---")
            cols = await db.list_collection_names()
            for c in cols:
                count = await db[c].count_documents({})
                if count > 0:
                    print(f"  Col: {c} | Docs: {count}")
        except:
            pass

if __name__ == "__main__":
    asyncio.run(scan())
