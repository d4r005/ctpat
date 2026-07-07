import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def cross_check():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    # IDs en tablas principales
    main_tickets = [t['id'] for t in await db.shipping_tickets.find({}, {"id": 1}).to_list(1000)]
    main_insps = [i['id'] for i in await db.inspections.find({}, {"id": 1}).to_list(1000)]
    main_records = [r['id'] for r in await db.vehicle_records.find({}, {"id": 1}).to_list(1000)]

    # Buscar en bitacoras "embarque" que no estén en shipping_tickets
    bit_embarques = await db.bitacoras.find({"tipo": "embarque"}).to_list(1000)
    extra_tickets = []
    for b in bit_embarques:
        bid = b.get("id") or b.get("datos", {}).get("id")
        if bid and bid not in main_tickets:
            extra_tickets.append(b)

    print(f"Tickets en tabla principal: {len(main_tickets)}")
    print(f"Tickets EXTRA encontrados en bitácora: {len(extra_tickets)}")

    for t in extra_tickets[:5]:
        datos = t.get("datos", {})
        print(f"  -> Ticket Extra: {t.get('titulo')} | Placa: {datos.get('placas_unidad')}")

if __name__ == "__main__":
    asyncio.run(cross_check())
