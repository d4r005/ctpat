import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def find():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db_sisp = client["sisp_production"]
    db_actual = client["naf_inspection"]

    # IDs de inspecciones que ya tenemos
    existing_ids = [i['id'] for i in await db_actual.inspections.find({}, {"id": 1}).to_list(1000)]

    # Buscar en bitácora eventos que parezcan una inspección
    cursor = db_sisp.bitacoras.find({"titulo": {"$regex": "Inspección", "$options": "i"}})
    orphans = []
    async for b in cursor:
        bid = b.get("id") or b.get("datos", {}).get("id")
        if bid not in existing_ids:
            orphans.append(b)

    print(f"Inspecciones huérfanas encontradas en Bitácora SISP: {len(orphans)}")
    for o in orphans:
        print(f"  -> {o['titulo']} | ID: {o.get('id')} | Fecha: {o.get('fecha')}")

if __name__ == "__main__":
    asyncio.run(find())
