import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

async def fix_reports():
    from server import db, _trigger_automatic_report, logger

    print("🔄 Iniciando Restauración de Evidencia (Firmas y Fotos) en Reportes...")
    records = await db.vehicle_records.find().to_list(length=1000)

    for rec in records:
        placas = rec.get("entry", {}).get("placas_unidad", "S/P")
        print(f"📦 Reparando Reporte para: {placas}...")

        try:
            # _trigger_automatic_report ya carga todo (firmas y fotos)
            # y lo envía al Webhook para generar el PDF en Drive.
            await _trigger_automatic_report(rec["id"])
            print(f"   ✅ {placas}: Reporte regenerado con evidencia completa.")
        except Exception as e:
            print(f"   ❌ Error reparando {placas}: {e}")

    print("\n✨ Restauración Finalizada. Revisa tus reportes en la App y en Drive.")

if __name__ == "__main__":
    asyncio.run(fix_reports())
