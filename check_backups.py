import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def check():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    docs = await db.evidence_backups.find({}).to_list(100)
    print(f"Encontrados {len(docs)} respaldos de evidencia.")

    for d in docs:
        payload = d.get("payload", {})
        tipo = d.get("type") or payload.get("type")
        placas = payload.get("placas_unidad") or payload.get("placas")
        print(f"  -> Tipo: {tipo} | Placas: {placas} | ID: {d.get('id')}")

if __name__ == "__main__":
    asyncio.run(check())
