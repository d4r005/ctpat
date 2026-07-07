import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def full_rescue():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db_sisp = client["sisp_production"]
    db_actual = client["naf_inspection"]

    # Buscar registros en bitácora de SISP que tengan 'datos' complejos
    cursor = db_sisp.bitacoras.find({"tipo": {"$in": ["embarque", "registro_diario"]}})
    rescued_count = 0

    async for b in cursor:
        datos = b.get("datos", {})
        # Si tiene puntos de inspección o firmas, es una inspección
        if "points" in datos or "inspector_firma" in datos or "inspector_nombre" in datos:
            # Verificar si ya existe en la actual
            exists = await db_actual.inspections.find_one({"id": datos.get("id")})
            if not exists:
                # Restaurar en la tabla de inspecciones
                await db_actual.inspections.insert_one(datos)
                rescued_count += 1
                print(f"  [RESCATADA] Inspección Placa: {datos.get('placas_unidad')} | ID: {datos.get('id')}")

    print(f"\nRescate finalizado. Se restauraron {rescued_count} inspecciones en la base de datos actual.")

if __name__ == "__main__":
    asyncio.run(full_rescue())
