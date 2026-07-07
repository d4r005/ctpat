import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def check():
    load_dotenv(Path(__file__).parent / '.env')
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    insps = await db.inspections.find({}).to_list(1000)
    for i, d in enumerate(insps):
        if 'id' not in d:
            print(f"Inspection {i} missing 'id' field!")

    tickets = await db.shipping_tickets.find({}).to_list(1000)
    for i, d in enumerate(tickets):
        if 'id' not in d:
            print(f"Ticket {i} missing 'id' field!")

    print("Check complete.")

if __name__ == "__main__":
    asyncio.run(check())
