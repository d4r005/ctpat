import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def check():
    load_dotenv(Path(__file__).parent / '.env')
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    db = client['naf_inspection']

    print("--- Shipping Tickets in DB ---")
    cursor = db.shipping_tickets.find({}, {"_id": 1, "id": 1, "record_id": 1, "placas_unidad": 1, "created_at": 1})
    async for doc in cursor:
        print(f"ID: {doc.get('id')} | RecID: {doc.get('record_id')} | Plate: {doc.get('placas_unidad')} | Created: {doc.get('created_at')} | _id: {doc['_id']}")

if __name__ == "__main__":
    asyncio.run(check())
