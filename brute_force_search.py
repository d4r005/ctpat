import os
import asyncio
import re
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def search():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    target_plates = ["75LA2J", "13AF8S", "45LAH1"]

    # Obtener todas las DBs
    dbs = await client.list_database_names()

    print(f"Iniciando búsqueda BRUTA de unidades: {target_plates}\n")

    for db_name in dbs:
        if db_name in ["admin", "local", "config"]: continue
        db = client[db_name]

        cols = await db.list_collection_names()
        for col_name in cols:
            col = db[col_name]
            for plate in target_plates:
                # Regex muy flexible: busca los caracteres en orden aunque haya basura enmedio
                p_norm = re.sub(r'[^A-Z0-9]', '', plate.upper())
                fuzzy_regex = ".*".join(list(p_norm))

                # Buscar en TODO el documento convirtiéndolo a string (pesado pero infalible)
                # MongoDB no permite buscar en todo el doc como string directo,
                # así que buscaremos en campos comunes y listaremos una muestra

                cursor = col.find({
                    "$or": [
                        {"placas_unidad": {"$regex": fuzzy_regex, "$options": "i"}},
                        {"placas": {"$regex": fuzzy_regex, "$options": "i"}},
                        {"entry.placas_unidad": {"$regex": fuzzy_regex, "$options": "i"}},
                        {"titulo": {"$regex": fuzzy_regex, "$options": "i"}},
                        {"datos.placas_unidad": {"$regex": fuzzy_regex, "$options": "i"}},
                        {"payload.placas_unidad": {"$regex": fuzzy_regex, "$options": "i"}},
                        {"placa": {"$regex": fuzzy_regex, "$options": "i"}}
                    ]
                })

                async for doc in cursor:
                    print(f"  [ENCONTRADO] Placa {plate} en {db_name}.{col_name}")
                    print(f"    -> ID: {doc.get('id') or doc.get('_id')} | Fecha: {doc.get('created_at') or doc.get('fecha')}")

if __name__ == "__main__":
    asyncio.run(search())
