import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def find_broken():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client["naf_inspection"]

    insps = [i['id'] for i in await db.inspections.find({}, {"id": 1}).to_list(1000)]
    recs = await db.vehicle_records.find({}).to_list(1000)

    broken_ids = set()
    for r in recs:
        iids = r.get("inspection_ids", [])
        if r.get("inspection_id"): iids.append(r["inspection_id"])

        for iid in iids:
            if iid not in insps:
                broken_ids.add(iid)

    print(f"IDs de inspección vinculados pero NO existentes: {len(broken_ids)}")
    for bid in list(broken_ids)[:10]:
        print(f"  -> ID Roto: {bid}")

    # Buscar estos IDs en evidence_backups
    backups = await db.evidence_backups.find({"id": {"$in": list(broken_ids)}}).to_list(100)
    print(f"\nEncontrados {len(backups)} de estos IDs en evidence_backups.")

if __name__ == "__main__":
    asyncio.run(find_broken())
