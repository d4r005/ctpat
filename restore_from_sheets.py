import os
import asyncio
import re
import requests
import uuid
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path

# Cargar variables de entorno
load_dotenv()

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = 'naf_inspection'
SHEET_ID = "1o1l0iH74CykHu4p7Ybaa08HSNeRaesy_OOG4DpkGoPE"
DEFAULT_USER_ID = "f6677ddf-03de-4b97-aa82-4a21032fc1b9" # Dario Robles (Admin)

async def get_drive_token(db):
    token_doc = await db.system_tokens.find_one({"key": "googledrive_access_token"})
    if token_doc:
        return token_doc["value"]
    return os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN", "")

def get_sheet_values(token, range_name):
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{range_name}"
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(url, headers=headers, timeout=15)
    if r.status_code != 200:
        print(f"Error fetching {range_name}: {r.status_code} - {r.text}")
        return []
    return r.json().get("values", [])

async def restore_caseta(db, token):
    print("--- Restaurando Caseta ---")
    rows = get_sheet_values(token, "'Entradas_Salidas'!A2:N5000")
    if not rows: return

    records_map = {} # uuid -> record_doc

    for row in rows:
        if not row: continue
        key = row[0]
        if ':' not in key: continue

        rid, kind = key.split(':', 1)

        if rid not in records_map:
            # Intentar buscar en Mongo por si ya existe
            existing = await db.vehicle_records.find_one({"id": rid})
            if existing:
                records_map[rid] = existing
            else:
                records_map[rid] = {
                    "id": rid,
                    "user_id": DEFAULT_USER_ID,
                    "status": "entrada",
                    "created_at": row[1] if len(row) > 1 else "",
                    "entry": {},
                    "exit": None,
                    "inspection_ids": [],
                    "has_shipping_ticket": False
                }

        rec = records_map[rid]

        if kind == "entrada":
            entry = rec["entry"]
            if len(row) > 3: entry["placas_unidad"] = row[3]
            if len(row) > 4: entry["chofer_nombre"] = row[4]
            if len(row) > 5: entry["compania_transporte"] = row[5]
            if len(row) > 6: entry["numero_tractor"] = row[6]
            if len(row) > 7: entry["numero_caja"] = row[7]
            if len(row) > 8: entry["sello_entrada"] = row[8]
            if len(row) > 9: entry["destino"] = row[9]
            if len(row) > 10: entry["guardia_caseta_nombre"] = row[10]
            if len(row) > 11: entry["cortina_asignada"] = row[11]
            if len(row) > 12: entry["licencia_conductor"] = row[12]
            if len(row) > 13: entry["condicion_carga"] = row[13]
            entry["fecha_entrada"] = row[1]

        elif kind == "salida":
            if not rec.get("exit"):
                rec["exit"] = {}
            ex = rec["exit"]
            if len(row) > 3: ex["placas_unidad_salida"] = row[3]
            # Chofer E, Compania F, Tractor G, Caja H, Sello I, Destino J, Guardia K, Cortina L, Licencia M, Condicion N
            if len(row) > 6: ex["numero_tractor_salida"] = row[6]
            if len(row) > 7: ex["numero_caja_salida"] = row[7]
            if len(row) > 8: ex["sello_salida"] = row[8]
            if len(row) > 9: ex["destino"] = row[9]
            if len(row) > 10: ex["guardia_salida_nombre"] = row[10]
            if len(row) > 11: ex["cortina_salida"] = row[11]
            if len(row) > 13: ex["condicion_salida"] = row[13]
            ex["fecha_salida"] = row[1]
            rec["status"] = "salida"

    restored = 0
    for rid, doc in records_map.items():
        # Validar campos mínimos
        if not doc.get("entry") or not doc["entry"].get("placas_unidad"):
            continue

        exists = await db.vehicle_records.find_one({"id": rid})
        if not exists:
            await db.vehicle_records.insert_one(doc)
            restored += 1
        else:
            # Actualizar por si acaso
            await db.vehicle_records.replace_one({"id": rid}, doc)

    print(f"Caseta: {restored} registros restaurados/actualizados.")

async def restore_inspections(db, token, hoja, is_19):
    print(f"--- Restaurando {hoja} ---")
    rows = get_sheet_values(token, f"'{hoja}'!A2:AD5000")
    if not rows: return

    restored = 0
    for row in rows:
        if not row: continue
        iid = row[0]
        if not iid: continue

        exists = await db.inspections.find_one({"id": iid})
        if exists: continue

        pts = []
        limit = 19 if is_19 else 9
        for n in range(1, limit + 1):
            idx = 10 + n # Col L is 11 (pt 1)
            estado = row[idx] if len(row) > idx else "-"
            pts.append({
                "number": n,
                "name": f"Punto {n}", # No tenemos el nombre real en el sheet
                "estado": estado,
                "comentarios": "",
                "photo": ""
            })

        doc = {
            "id": iid,
            "record_id": row[1] if len(row) > 1 else None,
            "shipping_ticket_id": row[2] if len(row) > 2 else None,
            "created_at": row[3] if len(row) > 3 else "",
            "inspection_type": "19_puntos" if is_19 else "9_puntos",
            "placas_unidad": row[5] if len(row) > 5 else "",
            "inspector_nombre": row[6] if len(row) > 6 else "",
            "status_general": row[7] if len(row) > 7 else "bueno",
            "approval_status": row[9] if len(row) > 9 else "pendiente",
            "approved_by_name": row[10] if len(row) > 10 else "",
            "points": pts,
            "user_id": DEFAULT_USER_ID,
            "inspector_firma": ""
        }
        await db.inspections.insert_one(doc)
        restored += 1

        # Vincular con record si existe
        if doc["record_id"]:
            await db.vehicle_records.update_one(
                {"id": doc["record_id"]},
                {"$addToSet": {"inspection_ids": iid}, "$set": {"status": "inspeccionado"}}
            )

    print(f"{hoja}: {restored} inspecciones restauradas.")

async def restore_tickets(db, token):
    print("--- Restaurando Tickets ---")
    rows = get_sheet_values(token, "'Tickets_Embarque'!A2:P5000")
    if not rows: return

    restored = 0
    for row in rows:
        if not row: continue
        tid = row[0]
        if not tid: continue

        exists = await db.shipping_tickets.find_one({"id": tid})
        if exists: continue

        doc = {
            "id": tid,
            "record_id": row[1] if len(row) > 1 else None,
            "inspection_id": row[2] if len(row) > 2 else None,
            "created_at": row[3] if len(row) > 3 else "",
            "placas_unidad": row[5] if len(row) > 5 else "",
            "cliente": row[6] if len(row) > 6 else "",
            "almacenista": row[7] if len(row) > 7 else "",
            "operador": row[8] if len(row) > 8 else "",
            "linea_transporte": row[9] if len(row) > 9 else "",
            "numero_caja": row[10] if len(row) > 10 else "",
            "numero_pallets": row[11] if len(row) > 11 else "",
            "numero_sello": row[12] if len(row) > 12 else "",
            "nombre_guardia": row[13] if len(row) > 13 else "",
            "observaciones": row[14] if len(row) > 14 else "",
            "area": row[15] if len(row) > 15 else "",
            "user_id": DEFAULT_USER_ID
        }
        await db.shipping_tickets.insert_one(doc)
        restored += 1

        # Vincular con record si existe
        if doc["record_id"]:
            await db.vehicle_records.update_one(
                {"id": doc["record_id"]},
                {"$set": {"shipping_ticket_id": tid, "has_shipping_ticket": True}}
            )

    print(f"Tickets: {restored} tickets restaurados.")

async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    token = await get_drive_token(db)
    if not token:
        print("❌ No se encontró token de Drive.")
        return

    await restore_caseta(db, token)
    await restore_inspections(db, token, "Inspecciones_19_Puntos", True)
    await restore_inspections(db, token, "Inspecciones_9_Puntos", False)
    await restore_tickets(db, token)

    print("\n✅ Restauración finalizada.")

if __name__ == "__main__":
    asyncio.run(main())
