import os
import asyncio
import re
import uuid
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def trigger():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client["naf_inspection"]

    print("Iniciando RECONSTRUCCIÓN MAESTRA...")

    # 1. Obtener toda la data
    all_insps = await db.inspections.find({}, {"_id": 0}).to_list(5000)
    all_tickets = await db.shipping_tickets.find({}, {"_id": 0}).to_list(5000)
    all_records = await db.vehicle_records.find({}, {"_id": 0}).to_list(5000)

    existing_plates = {re.sub(r'[^A-Z0-9]', '', r.get("entry", {}).get("placas_unidad", "")).upper() for r in all_records}
    created_count = 0
    missing_plates_data = {}

    # Buscar en inspecciones
    for insp in all_insps:
        p = insp.get("placas_unidad", "").strip().upper()
        norm = re.sub(r'[^A-Z0-9]', '', p)
        if norm and norm not in existing_plates:
            if norm not in missing_plates_data:
                missing_plates_data[norm] = {"p": p, "date": insp.get("created_at"), "company": insp.get("compania_transportista"), "box": insp.get("numero_trailer"), "sello": insp.get("numero_precinto"), "driver": insp.get("inspector_nombre")}

    # Buscar en tickets
    for tick in all_tickets:
        p = tick.get("placas_unidad", "").strip().upper()
        norm = re.sub(r'[^A-Z0-9]', '', p)
        if norm and norm not in existing_plates:
            if norm not in missing_plates_data:
                missing_plates_data[norm] = {"p": p, "date": tick.get("created_at"), "company": tick.get("linea_transporte"), "box": tick.get("numero_caja"), "sello": tick.get("numero_sello"), "driver": tick.get("operador")}

    # Crear registros faltantes
    for norm, data in missing_plates_data.items():
        rid = str(uuid.uuid4())
        new_record = {
            "id": rid,
            "user_id": "admin",
            "status": "inspeccionado",
            "created_at": data["date"],
            "entry": {
                "tipo_unidad": "sencillo",
                "placas_unidad": data["p"],
                "chofer_nombre": data["driver"] or "HISTÓRICO",
                "compania_transporte": data["company"] or "",
                "numero_tractor": "",
                "numero_caja": data["box"] or "",
                "sello_entrada": data["sello"] or "",
                "guardia_caseta_nombre": "RECONSTRUIDO",
                "fecha_entrada": data["date"]
            }
        }
        await db.vehicle_records.insert_one(new_record)
        created_count += 1
        print(f"  [CREADO] Registro para placa {data['p']}")

    print(f"\nReparación finalizada. {created_count} registros reconstruidos.")

if __name__ == "__main__":
    asyncio.run(trigger())
