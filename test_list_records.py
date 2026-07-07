import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import re

# Simplified models and logic from server.py
def _canon_plate(s): return re.sub(r"[^A-Z0-9]", "", (s or "").upper())

async def test():
    load_dotenv(Path(__file__).parent / '.env')
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME', 'naf_inspection')
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    filt = {}
    MINIMAL_RECORD_PROJECTION = {
        "entry.foto_frente_unidad": 0,
        "entry.foto_atras_caja": 0,
        "entry.foto_atras_caja_2": 0,
        "entry.foto_id_chofer": 0,
        "entry.firma_operador": 0,
        "exit.sello_vvtt_foto": 0,
        "exit.sello_vvtt_foto_2": 0,
        "exit.firma_guardia": 0,
    }

    docs = await db.vehicle_records.find(filt, MINIMAL_RECORD_PROJECTION).sort("created_at", -1).to_list(2000)
    print(f"Docs found: {len(docs)}")

    all_insps = await db.inspections.find({}, {"_id": 0, "id": 1, "placas_unidad": 1, "record_id": 1}).to_list(5000)
    print(f"Inspections found: {len(all_insps)}")

    # ... rest of the logic ...
    # Let's just see if docs are found.
    if len(docs) > 0:
        print(f"First doc: {docs[0].get('id')} - {docs[0].get('entry', {}).get('placas_unidad')}")

if __name__ == "__main__":
    asyncio.run(test())
