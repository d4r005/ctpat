import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def main():
    load_dotenv(Path(__file__).parent / '.env')
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    print("--- VEHICLE RECORDS ---")
    records = await db.vehicle_records.find({"entry.placas_unidad": {"$regex": "76BCSN", "$options": "i"}}).to_list(10)
    for r in records:
        print(f"ID: {r['id']} | Placas: {r['entry']['placas_unidad']} | Status: {r['status']} | InspectionID: {r.get('inspection_id')}")

    print("\n--- INSPECTIONS ---")
    inspections = await db.inspections.find({"placas_unidad": {"$regex": "76BCSN", "$options": "i"}}).to_list(10)
    for i in inspections:
        print(f"ID: {i['id']} | Placas: {i['placas_unidad']} | CreatedAt: {i['created_at']}")

if __name__ == "__main__":
    asyncio.run(main())
