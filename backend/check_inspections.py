import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def main():
    load_dotenv(Path(__file__).parent / '.env')
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    insps = await db.inspections.find({}).to_list(100)
    print(f"Found {len(insps)} inspections.")
    for i in insps:
        missing = []
        if 'numero_trailer' not in i: missing.append('numero_trailer')
        if 'inspector_firma' not in i: missing.append('inspector_firma')
        if 'points' not in i: missing.append('points')
        print(f"ID: {i.get('id')} - Placas: {i.get('placas_unidad')} - Missing: {missing}")

if __name__ == "__main__":
    asyncio.run(main())
