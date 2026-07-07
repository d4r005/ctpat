import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

async def check():
    load_dotenv()
    mongo_url = os.environ.get('MONGO_URL')
    db_name = 'sisp_production'
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    res = await db.inspections.find_one({"placas_unidad": "86BH2B"})
    print(f"Inspection: {res}")

if __name__ == "__main__":
    asyncio.run(check())
