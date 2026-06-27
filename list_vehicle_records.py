import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

async def list_records():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    records = await db.vehicle_records.find({}, {"_id": 0, "entry": 1, "status": 1, "id": 1, "inspection_id": 1, "shipping_ticket_id": 1}).to_list(100)
    for r in records:
        print(f"ID: {r['id']} | Placas: {r['entry'].get('placas_unidad')} | Status: {r['status']} | Insp: {r.get('inspection_id')} | Ticket: {r.get('shipping_ticket_id')}")

if __name__ == "__main__":
    asyncio.run(list_records())
