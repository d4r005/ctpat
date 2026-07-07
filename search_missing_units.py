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
    dbs_to_search = ["naf_inspection", "sisp_production", "ctpat"]

    print(f"Buscando unidades: {target_plates}\n")

    for db_name in dbs_to_search:
        db = client[db_name]
        print(f"--- Escaneando Base de Datos: {db_name} ---")

        cols = await db.list_collection_names()
        for col in cols:
            # Buscar en cualquier campo que contenga la placa
            # Usamos regex para ser flexibles con espacios o guiones
            for plate in target_plates:
                # Normalizar placa para búsqueda
                p_norm = re.sub(r'[^A-Z0-9]', '', plate.upper())
                regex = f".*{p_norm}.*"

                count = await db[col].count_documents({
                    "$or": [
                        {"placas_unidad": {"$regex": regex, "$options": "i"}},
                        {"placas": {"$regex": regex, "$options": "i"}},
                        {"entry.placas_unidad": {"$regex": regex, "$options": "i"}},
                        {"titulo": {"$regex": regex, "$options": "i"}},
                        {"datos.placas_unidad": {"$regex": regex, "$options": "i"}},
                        {"payload.placas_unidad": {"$regex": regex, "$options": "i"}}
                    ]
                })

                if count > 0:
                    print(f"  [HALLAZGO] Placa {plate} encontrada en colección '{col}' ({count} docs)")
                    # Mostrar una muestra del primer documento para saber qué es
                    doc = await db[col].find_one({
                        "$or": [
                            {"placas_unidad": {"$regex": regex, "$options": "i"}},
                            {"placas": {"$regex": regex, "$options": "i"}},
                            {"entry.placas_unidad": {"$regex": regex, "$options": "i"}},
                            {"titulo": {"$regex": regex, "$options": "i"}},
                            {"datos.placas_unidad": {"$regex": regex, "$options": "i"}},
                            {"payload.placas_unidad": {"$regex": regex, "$options": "i"}}
                        ]
                    })
                    print(f"    -> Detalle: {doc.get('titulo') or doc.get('id') or 'Sin título'} | Fecha: {doc.get('created_at') or doc.get('fecha')}")

if __name__ == "__main__":
    asyncio.run(search())
