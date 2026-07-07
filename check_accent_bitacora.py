import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def check():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db_sisp = client["sisp_production"]

    docs = await db_sisp["bitácoras"].find({}).to_list(100)
    print(f"Encontrados {len(docs)} documentos en 'bitácoras' (con acento).")
    for d in docs[:10]:
        print(f"  Tipo: {d.get('tipo')} | Titulo: {d.get('titulo')}")

if __name__ == "__main__":
    asyncio.run(check())
