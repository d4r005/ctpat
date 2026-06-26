import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import re

def normalize(s):
    if not s: return ""
    return re.sub(r'[^a-zA-Z0-9]', '', str(s)).upper()

async def main():
    load_dotenv(Path(__file__).parent / '.env')
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    print("--- Auditoría de Vínculos SRIUC ---")

    # 1. Buscar registros de caseta sin inspección
    records = await db.vehicle_records.find({"inspection_id": None}).to_list(1000)
    print(f"Buscando vínculos para {len(records)} registros de caseta huérfanos...")

    for r in records:
        plates = normalize(r["entry"].get("placas_unidad"))
        if not plates: continue

        # Buscar inspección con mismas placas creada después de la entrada
        insp = await db.inspections.find_one({
            "placas_unidad": {"$regex": f".*{plates}.*", "$options": "i"},
            "created_at": {"$gte": r["created_at"]}
        })

        if insp:
            await db.vehicle_records.update_one({"id": r["id"]}, {"$set": {"inspection_id": insp["id"], "status": "inspeccionado" if r["status"] == "entrada" else r["status"]}})
            print(f"[CONECTADO] Caseta {r['id']} -> Inspección {insp['id']} (Placas: {plates})")

    # 2. Buscar registros de caseta sin ticket de embarque
    records = await db.vehicle_records.find({"shipping_ticket_id": None}).to_list(1000)
    for r in records:
        plates = normalize(r["entry"].get("placas_unidad"))
        if not plates: continue

        ticket = await db.shipping_tickets.find_one({
            "placas_unidad": {"$regex": f".*{plates}.*", "$options": "i"},
            "created_at": {"$gte": r["created_at"]}
        })

        if ticket:
            await db.vehicle_records.update_one({"id": r["id"]}, {"$set": {"shipping_ticket_id": ticket["id"], "has_shipping_ticket": True}})
            print(f"[CONECTADO] Caseta {r['id']} -> Ticket {ticket['id']} (Placas: {plates})")

    print("--- Auditoría Finalizada ---")

if __name__ == "__main__":
    asyncio.run(main())
