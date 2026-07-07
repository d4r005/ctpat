import os
import asyncio
import uuid
import re
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone

# Cargar configuración
load_dotenv(Path(__file__).parent / '.env')

async def repair_and_link():
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    if not mongo_url or not db_name:
        print("Error: MONGO_URL o DB_NAME no configurados")
        return

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print(f"Conectado a {db_name}. Iniciando reparación de vínculos...")

    # 1. Obtener todas las inspecciones y registros
    all_insps = await db.inspections.find({}, {"_id": 0}).to_list(5000)
    all_records = await db.vehicle_records.find({}, {"_id": 0}).to_list(5000)

    # Mapeo de IDs de inspección ya vinculados
    linked_insp_ids = set()
    for r in all_records:
        if r.get("inspection_id"): linked_insp_ids.add(r["inspection_id"])
        if r.get("inspection_ids"):
            for iid in r["inspection_ids"]: linked_insp_ids.add(iid)

    orphans = [i for i in all_insps if i["id"] not in linked_insp_ids]
    print(f"Encontradas {len(orphans)} inspecciones huérfanas.")

    created_count = 0
    for insp in orphans:
        # Crear un registro de caseta sintético para esta inspección
        rid = str(uuid.uuid4())
        p = insp.get("placas_unidad", "").strip().upper()

        new_record = {
            "id": rid,
            "user_id": insp.get("user_id", "admin"),
            "status": "inspeccionado",
            "created_at": insp.get("created_at") or datetime.now(timezone.utc).isoformat(),
            "inspection_id": insp["id"],
            "inspection_ids": [insp["id"]],
            "entry": {
                "tipo_unidad": "sencillo",
                "placas_unidad": p,
                "chofer_nombre": insp.get("inspector_nombre", "HISTÓRICO"),
                "compania_transporte": insp.get("compania_transportista", ""),
                "numero_tractor": "",
                "numero_caja": insp.get("numero_trailer", ""),
                "sello_entrada": insp.get("numero_precinto", ""),
                "guardia_caseta_nombre": "RECONSTRUIDO",
                "fecha_entrada": insp.get("fecha_hora") or insp.get("created_at")
            },
            "exit": None,
            "shipping_ticket_id": None
        }
        await db.vehicle_records.insert_one(new_record)
        created_count += 1
        print(f"  [OK] Registro creado para placa {p}")

    print(f"\nProceso finalizado. Se crearon {created_count} registros vinculados.")

if __name__ == "__main__":
    asyncio.run(repair_and_link())
