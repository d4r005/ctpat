import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def main():
    load_dotenv(Path(__file__).parent / '.env')
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    target = "bf46e322-3d89-47a9-8223-ac1e5c66e114"
    insp = await db.inspections.find_one({"id": target})
    print(f"Inspection found: {insp is not None}")
    if insp:
        print(insp)

if __name__ == "__main__":
    asyncio.run(main())
