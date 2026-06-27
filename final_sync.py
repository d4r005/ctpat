import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

async def run_final_sync():
    from server import db, sync_to_google_sheets, _trigger_automatic_report

    print("🚀 Iniciando Sincronización Final v2 (Fotos + Carpetas + PDFs)...")
    records = await db.vehicle_records.find().to_list(length=1000)

    for rec in records:
        placas = rec.get("entry", {}).get("placas_unidad", "S/P")
        print(f"📦 Procesando Unidad: {placas}")

        # 1. Sincronizar Entrada
        await sync_to_google_sheets("entrada", rec)
        await asyncio.sleep(1) # Pequeña pausa para no saturar el script de Google

        # 2. Sincronizar Inspección
        if rec.get("inspection_id"):
            insp = await db.inspections.find_one({"id": rec["inspection_id"]})
            if insp:
                await sync_to_google_sheets("inspeccion", insp)
                await asyncio.sleep(1)

        # 3. Sincronizar Ticket (Embarque)
        if rec.get("shipping_ticket_id"):
            ticket = await db.shipping_tickets.find_one({"id": rec["shipping_ticket_id"]})
            if ticket:
                await sync_to_google_sheets("embarque", ticket)
                await asyncio.sleep(1)

        # 4. Sincronizar Salida
        if rec.get("exit"):
            await sync_to_google_sheets("salida", rec)
            await asyncio.sleep(1)

        # 5. Generar y Enviar REPORTE CONSOLIDADO (PDF a Drive)
        try:
            # Esto dispara la función que genera el HTML y lo envía al Webhook para crear el PDF
            await _trigger_automatic_report(rec["id"])
            print(f"   ✅ {placas}: Datos y PDF enviados correctamente.")
        except Exception as e:
            print(f"   ❌ Error en PDF para {placas}: {e}")

    print("\n✨ Sincronización Masiva Finalizada. Revisa tu Google Drive y Sheets.")

if __name__ == "__main__":
    asyncio.run(run_final_sync())
