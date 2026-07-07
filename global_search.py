import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def global_search():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    dbs = await client.list_database_names()

    found_total = 0
    for db_name in dbs:
        if db_name in ["admin", "local", "config"]: continue
        db = client[db_name]
        cols = await db.list_collection_names()
        for col_name in cols:
            # Buscar documentos que tengan campos típicos de una inspección
            count = await db[col_name].count_documents({"$or": [{"points": {"$exists": True}}, {"inspection_type": {"$exists": True}}]})
            if count > 0:
                print(f"Base: {db_name} | Col: {col_name} | Inspecciones: {count}")
                found_total += count

    print(f"\nBúsqueda global terminada. Total de inspecciones encontradas: {found_total}")

if __name__ == "__main__":
    asyncio.run(global_search())
