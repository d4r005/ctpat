import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def extract():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    docs = await db.bitacoras.find({"tipo": {"$in": ["inspeccion", "entrada", "salida"]}}).to_list(100)
    print(f"Encontrados {len(docs)} eventos relevantes en bitácoras.")

    for d in docs[:10]:
        datos = d.get("datos", {})
        placas = datos.get("placas_unidad") or datos.get("placas")
        print(f"  [{d['tipo']}] Titulo: {d['titulo']} | Placas: {placas}")

if __name__ == "__main__":
    asyncio.run(extract())
