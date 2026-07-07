import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def scan():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    print("--- Auditoría de Colecciones ---")
    cols = await db.list_collection_names()
    for c in cols:
        count = await db[c].count_documents({})
        print(f"Colección: {c} - Documentos: {count}")

    print("\n--- Buscando Inconsistencias en Inspecciones ---")
    insps = await db.inspections.find({}).to_list(1000)
    recs = await db.vehicle_records.find({}).to_list(1000)

    linked_ids = []
    for r in recs:
        if r.get("inspection_id"): linked_ids.append(r["inspection_id"])
        if r.get("inspection_ids"): linked_ids.extend(r["inspection_ids"])

    orphans = [i for i in insps if i['id'] not in linked_ids]
    print(f"Inspecciones totales: {len(insps)}")
    print(f"Inspecciones vinculadas: {len(linked_ids)}")
    print(f"Inspecciones HUÉRFANAS encontradas: {len(orphans)}")

    for o in orphans:
        print(f"  -> ID: {o['id']} | Placa: {o.get('placas_unidad')} | Fecha: {o.get('created_at')}")

if __name__ == "__main__":
    asyncio.run(scan())
