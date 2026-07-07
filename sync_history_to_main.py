import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import uuid

load_dotenv(Path(__file__).parent / '.env')

async def sync():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    db_sisp = client["sisp_production"]

    print("Iniciando sincronización de historial desde SISP a SRIUC...")

    # 1. Traer Tickets que no existan
    sisp_tickets = await db_sisp.shipping_tickets.find({}).to_list(1000)
    current_ticket_ids = {t['id'] for t in await db.shipping_tickets.find({}, {"id": 1}).to_list(1000)}

    tickets_added = 0
    for t in sisp_tickets:
        if t['id'] not in current_ticket_ids:
            await db.shipping_tickets.insert_one(t)
            tickets_added += 1

    # 2. Traer Vehicle Records que no existan
    sisp_records = await db_sisp.vehicle_records.find({}).to_list(1000)
    current_record_ids = {r['id'] for r in await db.vehicle_records.find({}, {"id": 1}).to_list(1000)}

    records_added = 0
    for r in sisp_records:
        if r['id'] not in current_record_ids:
            await db.vehicle_records.insert_one(r)
            records_added += 1

    print(f"Sincronización completada:")
    print(f"  -> Tickets recuperados: {tickets_added}")
    print(f"  -> Registros de Caseta recuperados: {records_added}")
    print("\nEjecutando vinculación final...")

if __name__ == "__main__":
    asyncio.run(sync())
