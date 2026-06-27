import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()

async def repair():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    print("🚀 Iniciando REPARACIÓN DE TRAZABILIDAD MASIVA...")

    records = await db.vehicle_records.find().to_list(1000)

    for rec in records:
        rec_id = rec["id"]
        placas = rec["entry"].get("placas_unidad", "").strip()
        if not placas: continue

        print(f"📦 Procesando: {placas}")

        # 1. Buscar Inspección (dentro de las 48h de la entrada)
        # Usamos un rango amplio para recuperar historial
        insp = await db.inspections.find_one({
            "placas_unidad": placas,
            "created_at": {"$gte": rec["created_at"]}
        }, sort=[("created_at", 1)])

        # Si no hay posterior, buscar la más cercana anterior (por si se hizo antes del registro oficial)
        if not insp:
             insp = await db.inspections.find_one({
                "placas_unidad": placas
            }, sort=[("created_at", -1)])

        # 2. Buscar Ticket de Embarque
        ticket = await db.shipping_tickets.find_one({
            "placas_unidad": placas,
            "created_at": {"$gte": rec["created_at"]}
        }, sort=[("created_at", 1)])

        if not ticket:
             ticket = await db.shipping_tickets.find_one({
                "placas_unidad": placas
            }, sort=[("created_at", -1)])

        # 3. Determinar Status Correcto
        new_status = rec["status"]
        if rec.get("exit"):
            new_status = "salida"
        elif insp:
            new_status = "inspeccionado"

        update_data = {
            "inspection_id": insp["id"] if insp else rec.get("inspection_id"),
            "shipping_ticket_id": ticket["id"] if ticket else rec.get("shipping_ticket_id"),
            "has_shipping_ticket": True if ticket else False,
            "status": new_status
        }

        await db.vehicle_records.update_one({"id": rec_id}, {"$set": update_data})
        print(f"   ✅ {placas} reparado. Status: {new_status} | Insp: {'SI' if insp else 'NO'} | Ticket: {'SI' if ticket else 'NO'}")

    print("\n✨ Trazabilidad Reparada Correctamente.")

if __name__ == "__main__":
    asyncio.run(repair())
