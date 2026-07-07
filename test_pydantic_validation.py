import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

# Copying models from server.py (simplified)
class EscoltaInfo(BaseModel):
    nombre: str = ""
    gafete: str = ""

class VehicleEntry(BaseModel):
    tipo_unidad: str = "sencillo"
    placas_unidad: str
    chofer_nombre: str
    guardia_caseta_nombre: str
    # other fields as optional for brevity in testing
    compania_transporte: str = ""

class VehicleRecord(BaseModel):
    id: str
    user_id: str
    status: str
    entry: VehicleEntry
    created_at: str

async def check():
    load_dotenv(Path(__file__).parent / '.env')
    mongo_url = os.environ.get('MONGO_URL')
    db_name = 'naf_inspection'
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    docs = await db.vehicle_records.find({}).to_list(100)
    for i, d in enumerate(docs):
        try:
            # We need to simulate how FastAPI/Pydantic parses it
            # Remove _id which is not in the model
            doc_copy = dict(d)
            if '_id' in doc_copy: del doc_copy['_id']
            VehicleRecord(**doc_copy)
        except Exception as e:
            print(f"Record {i} (ID: {d.get('id')}) failed validation: {e}")

if __name__ == "__main__":
    asyncio.run(check())
