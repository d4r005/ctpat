import asyncio
import os
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

async def trigger_test():
    load_dotenv()
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")

    if not mongo_url or not db_name:
        print("❌ Error: MONGO_URL o DB_NAME no encontrados en .env")
        return

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    # Buscar el registro más reciente que tenga salida (para asegurar que tiene datos de reporte)
    rec = await db.vehicle_records.find_one({"status": "salida"}, sort=[("created_at", -1)])

    if not rec:
        # Si no hay ninguno con salida, buscar el último registro cualquiera
        rec = await db.vehicle_records.find_one({}, sort=[("created_at", -1)])

    if not rec:
        print("❌ No se encontraron registros en la base de datos para probar.")
        return

    record_id = rec["id"]
    plates = rec.get("entry", {}).get("placas_unidad", "S/P")
    print(f"🔍 Probando re-envío de reporte para: {plates} (ID: {record_id})")

    # Intentar disparar el reporte a través de la función que acabamos de desplegar
    # Nota: Como estamos en local, importamos del server local
    try:
        from server import send_report_email
        print("🚀 Disparando send_report_email asíncronamente...")
        success, msg = await send_report_email(record_id)
        if success:
            print(f"✅ Éxito: {msg}")
        else:
            print(f"❌ Error: {msg}")
    except Exception as e:
        print(f"❌ Error al ejecutar la función: {e}")

if __name__ == "__main__":
    asyncio.run(trigger_test())
