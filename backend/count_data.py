import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def main():
    load_dotenv(Path(__file__).parent / '.env')
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    n_inspections = await db.inspections.count_documents({})
    n_records = await db.vehicle_records.count_documents({})
    n_tickets = await db.shipping_tickets.count_documents({})

    print(f"Inspections: {n_inspections}")
    print(f"Vehicle Records: {n_records}")
    print(f"Shipping Tickets: {n_tickets}")

if __name__ == "__main__":
    asyncio.run(main())
