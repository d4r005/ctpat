import os
import asyncio
import re
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def find():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client["naf_inspection"]

    # 1. Obtener todas las placas con inspección
    insp_plates = {re.sub(r'[^A-Z0-9]', '', i.get("placas_unidad", "")).upper() for i in await db.inspections.find({}).to_list(1000)}

    # 2. Obtener todos los tickets
    tickets = await db.shipping_tickets.find({}).to_list(1000)

    print(f"Total Tickets: {len(tickets)}")
    print(f"Total Inspecciones: {len(insp_plates)}")

    missing_count = 0
    for t in tickets:
        p = t.get("placas_unidad", "").strip().upper()
        norm = re.sub(r'[^A-Z0-9]', '', p)
        if norm and norm not in insp_plates:
            missing_count += 1
            print(f"  [SIN INSPECCIÓN] Placa: {p} | Operador: {t.get('operador')} | Fecha: {t.get('created_at')}")

    print(f"\nSe encontraron {missing_count} tickets que NO tienen una inspección vinculada.")

if __name__ == "__main__":
    asyncio.run(find())
