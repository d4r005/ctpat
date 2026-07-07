import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def rescue():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db_actual = client["naf_inspection"]
    db_vieja = client["sisp_production"]

    insps_actual = [i['id'] for i in await db_actual.inspections.find({}, {"id": 1}).to_list(1000)]
    insps_vieja = await db_vieja.inspections.find({}).to_list(1000)

    missing = [i for i in insps_vieja if i['id'] not in insps_actual]

    print(f"Inspecciones en DB Actual: {len(insps_actual)}")
    print(f"Inspecciones en DB SISP: {len(insps_vieja)}")
    print(f"Inspecciones FALTANTES encontradas: {len(missing)}")

    if missing:
        # Intentar rescatar también bitácoras
        print("\nRescatando datos...")
        # (Aquí podríamos insertar, pero primero reportamos)
        for m in missing:
            print(f"  -> Rescatable: {m.get('placas_unidad')} | Fecha: {m.get('created_at')}")

if __name__ == "__main__":
    asyncio.run(rescue())
