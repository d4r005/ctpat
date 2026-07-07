import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def check():
    load_dotenv(Path(__file__).parent / '.env')
    mongo_url = os.environ.get('MONGO_URL')
    db_name = 'naf_inspection'
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    bitacora_plates = set()
    async for d in db.bitacoras.find({}):
        p = d.get('datos', {}).get('placas')
        if p: bitacora_plates.add(p)

    vr_plates = set()
    async for d in db.vehicle_records.find({}):
        p = d.get('entry', {}).get('placas_unidad')
        if p: vr_plates.add(p)

    print(f"Plates in bitacoras: {bitacora_plates}")
    print(f"Plates in vehicle_records: {vr_plates}")
    print(f"Intersection: {bitacora_plates.intersection(vr_plates)}")

if __name__ == "__main__":
    asyncio.run(check())
