import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def get_types():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    pipeline = [
        {"$group": {"_id": "$tipo", "count": {"$sum": 1}}}
    ]
    results = await db.bitacoras.aggregate(pipeline).to_list(100)
    for r in results:
        print(f"Tipo: {r['_id']} - Cantidad: {r['count']}")

if __name__ == "__main__":
    asyncio.run(get_types())
