import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def extract():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db_sisp = client["sisp_production"]
    db_actual = client["naf_inspection"]

    # Inspecciones que ya existen en la base actual
    current_insp_plates = [i.get('placas_unidad') for i in await db_actual.inspections.find({}, {"placas_unidad": 1}).to_list(1000)]

    # Buscar en la bitácora de SISP registros de tipo 'embarque' o 'registro_diario'
    # que contengan datos de inspección pero cuyas placas no estén en la base actual.
    cursor = db_sisp.bitacoras.find({"tipo": {"$in": ["embarque", "registro_diario"]}})
    found_potential = []

    async for b in cursor:
        datos = b.get("datos", {})
        placas = datos.get("placas_unidad") or datos.get("placas")
        if placas and placas not in current_insp_plates:
            found_potential.append({"placas": placas, "titulo": b.get("titulo"), "fecha": b.get("fecha")})

    print(f"Encontrados {len(found_potential)} posibles registros históricos/huérfanos en SISP.")
    for p in found_potential:
        print(f"  -> Unidad: {p['placas']} | Evento: {p['titulo']} | Fecha: {p['fecha']}")

if __name__ == "__main__":
    asyncio.run(extract())
