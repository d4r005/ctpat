import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def analyze():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db_sisp = client["sisp_production"]

    docs = await db_sisp["bitácoras"].find({"tipo": "registro_diario"}).to_list(100)
    print(f"Analizando {len(docs)} registros diarios en Bitácoras (con acento)...")

    for d in docs:
        datos = d.get("datos", {})
        # Buscar huellas de una inspección CTPAT
        if "points" in datos or "inspection_type" in datos:
            placas = datos.get("placas_unidad") or "S/N"
            print(f"  [HALLAZGO] Inspección encontrada: Placa {placas} | ID: {datos.get('id')}")

if __name__ == "__main__":
    asyncio.run(analyze())
