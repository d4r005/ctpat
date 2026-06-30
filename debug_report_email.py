import asyncio
import os
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Configurar logging para ver detalles
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DEBUG-EMAIL")

async def debug_send():
    load_dotenv()
    from server import send_report_email, db

    # 1. Buscar un registro que tenga datos reales (fotos)
    print("🔍 Buscando registro con fotos para prueba real...")
    rec = await db.vehicle_records.find_one({"status": "salida", "entry.foto_frente_unidad": {"$ne": ""}})

    if not rec:
        # Intentar con cualquier registro
        rec = await db.vehicle_records.find_one({})

    if not rec:
        print("❌ No hay registros en la BD.")
        return

    rid = rec["id"]
    plates = rec.get("entry", {}).get("placas_unidad", "S/P")
    print(f"📦 Registro encontrado: {plates} (ID: {rid})")

    # 2. Ejecutar envío con logs habilitados
    print(f"🚀 Iniciando proceso de envío para {plates}...")
    try:
        success, msg = await send_report_email(rid)
        if success:
            print(f"✅ EXITO: {msg}")
            print(f"📧 Revisa d.trujillo@brancoindustries.com. El reporte de {plates} debería llegar con fotos.")
        else:
            print(f"❌ FALLO: {msg}")
    except Exception as e:
        print(f"💥 ERROR CRITICO: {e}")

if __name__ == "__main__":
    asyncio.run(debug_send())
