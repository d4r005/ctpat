import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def find_insps():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    # Buscar registros que parezcan inspecciones en bitacoras
    docs = await db.bitacoras.find({"titulo": {"$regex": "Inspección", "$options": "i"}}).to_list(100)
    print(f"Encontrados {len(docs)} posibles registros de inspección en Bitácoras.")

    for d in docs:
        print(f"  -> {d['titulo']} | Fecha: {d['fecha']}")

if __name__ == "__main__":
    asyncio.run(find_insps())
