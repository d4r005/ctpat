import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

async def sync_tickets():
    from server import db, sync_to_google_sheets, logger

    print("🚀 Sincronizando todos los Tickets de Embarque con Google Sheets...")
    # Obtener todos los tickets
    tickets = await db.shipping_tickets.find().to_list(1000)

    count = 0
    for t in tickets:
        placas = t.get("placas_unidad", "S/P")
        print(f"📦 Enviando Ticket: {placas}...")
        try:
            # Forzar el envío al webhook para llenar la hoja Tickets_Embarque
            await sync_to_google_sheets("embarque", t)
            count += 1
            print(f"   ✅ OK")
        except Exception as e:
            print(f"   ❌ Error: {e}")

    print(f"\n✨ Proceso finalizado. {count} tickets sincronizados.")

if __name__ == "__main__":
    asyncio.run(sync_tickets())
