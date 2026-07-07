import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def list_dbs():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    dbs = await client.list_database_names()
    print("--- Bases de Datos en el Cluster ---")
    for db in dbs:
        print(f"Base de Datos: {db}")

if __name__ == "__main__":
    asyncio.run(list_dbs())
