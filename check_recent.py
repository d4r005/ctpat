import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def check():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client["naf_inspection"]

    print("Últimos 10 registros de Caseta:")
    recs = await db.vehicle_records.find().sort("created_at", -1).limit(10).to_list(10)
    for r in recs:
        print(f"  ID: {r['id']} | Placa: {r.get('entry', {}).get('placas_unidad')} | Fecha: {r.get('created_at')}")

    print("\nÚltimas 10 Inspecciones:")
    insps = await db.inspections.find().sort("created_at", -1).limit(10).to_list(10)
    for i in insps:
        print(f"  ID: {i['id']} | Placa: {i.get('placas_unidad')} | Fecha: {i.get('created_at')}")

if __name__ == "__main__":
    asyncio.run(check())
