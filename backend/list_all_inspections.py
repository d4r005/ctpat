import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def main():
    load_dotenv(Path(__file__).parent / '.env')
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    inspections = await db.inspections.find({}, {"id": 1, "placas_unidad": 1, "compania_transportista": 1}).sort("created_at", -1).to_list(20)
    for i in inspections:
        print(f"ID: {i['id']} | Placas: {i.get('placas_unidad')} | Company: {i.get('compania_transportista')}")

if __name__ == "__main__":
    asyncio.run(main())
