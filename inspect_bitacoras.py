import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def inspect():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    print("--- Muestra de Bitácoras ---")
    docs = await db.bitacoras.find({}).limit(5).to_list(5)
    for d in docs:
        print(f"Tipo/Keys: {list(d.keys())}")
        if 'placas' in d: print(f"  Placas: {d['placas']}")
        if 'placas_unidad' in d: print(f"  Placas Unidad: {d['placas_unidad']}")
        if 'evento' in d: print(f"  Evento: {d['evento']}")

if __name__ == "__main__":
    asyncio.run(inspect())
