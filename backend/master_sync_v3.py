import os
import asyncio
import requests
import uuid
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone

load_dotenv(Path(__file__).parent / '.env')

TOKEN = 'ya29.a0AT3oNZ_ZZQN015DDFo3_wQ6zCTVx_AY1y9Hb1-0HHAMJVw8vLck4o24xwMK4XwEUo9QX-0eblHVZ-d7Q7YCZ2BCr1K0LnHUp3HXQAbU3bcYMg1THQYgnBlTvxy53BsUNhSUEWIHvzbLy2ZJcllktNWTzMc5Tf8JJkO_nAoYVa5qaSWPdkpqSXf4sBn3_BtWapOJjn50aCgYKAf0SARUSFQHGX2MiE0slJS6rEBz7DdkQIecnYg0206'
SPREADSHEET_ID = '1o1l0iH74CykHu4p7Ybaa08HSNeRaesy_OOG4DpkGoPE'
ADMIN_ID = '565aff66-9ec7-4483-b5f2-533d018cf25c'

def fetch_sheet(sheet):
    url = f'https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/{sheet}?valueRenderOption=UNFORMATTED_VALUE'
    headers = {'Authorization': f'Bearer {TOKEN}'}
    res = requests.get(url, headers=headers)
    if res.status_code != 200: return []
    return res.json().get('values', [])

async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    # 1. Leer Caseta para crear Mapa de Verdad (Placas -> Chofer/Guardia)
    print("Mapeando datos de Caseta...")
    caseta_data = fetch_sheet('Entradas_Salidas')
    truth_map = {} # plates -> {chofer, guardia}

    if caseta_data:
        h = caseta_data[0]
        for r in caseta_data[1:]:
            row = dict(zip(h, r))
            p = str(row.get('Placas', '')).strip().upper()
            if p:
                truth_map[p] = {
                    "chofer": str(row.get('Chofer', '')).strip(),
                    "guardia": str(row.get('Guardia', '')).strip()
                }

    # 2. Restaurar Caseta (MongoDB)
    print("Sincronizando Caseta...")
    await db.vehicle_records.delete_many({})
    records = {}
    if caseta_data:
        h = caseta_data[0]
        # Unique headers for Guardia dup
        unique_h = []
        seen = {}
        for c in h:
            if c in seen: unique_h.append(f"{c}_2")
            else: unique_h.append(c); seen[c]=True

        for r in caseta_data[1:]:
            row = dict(zip(unique_h, r))
            rid = str(row.get('ID_Registro', '')).strip()
            if not rid or rid == 'None': rid = str(uuid.uuid4())

            placas = str(row.get('Placas', '')).strip().upper()
            proceso = str(row.get('Proceso', '')).upper()

            if rid not in records:
                records[rid] = {
                    "id": rid, "user_id": ADMIN_ID, "status": "entrada",
                    "entry": {
                        "placas_unidad": placas,
                        "chofer_nombre": str(row.get('Chofer', '')),
                        "compania_transporte": str(row.get('Compañía', '')),
                        "numero_tractor": str(row.get('Tractor', '')),
                        "numero_caja": str(row.get('Caja', '')),
                        "sello_entrada": str(row.get('Sello', '')),
                        "destino": str(row.get('Destino', '')),
                        "guardia_caseta_nombre": str(row.get('Guardia', '')),
                        "fecha_entrada": str(row.get('Fecha', ''))
                    },
                    "exit": None, "inspection_id": None, "created_at": str(row.get('Fecha', ''))
                }
            if proceso == 'SALIDA':
                records[rid]["status"] = "salida"
                records[rid]["exit"] = {
                    "fecha_salida": str(row.get('Fecha', '')),
                    "guardia_salida_nombre": str(row.get('Guardia', '')),
                    "destino": str(row.get('Destino', '')),
                    "numero_caja_salida": str(row.get('Caja', ''))
                }
        if records: await db.vehicle_records.insert_many(list(records.values()))

    # 3. Restaurar Inspecciones con Auto-Completado
    print("Sincronizando Inspecciones...")
    await db.inspections.delete_many({})
    insp_rows = fetch_sheet('Inspecciones_19_Puntos')
    if insp_rows:
        h = insp_rows[0]
        insps = []
        for r in insp_rows[1:]:
            row = dict(zip(h, r))
            p = str(row.get('Placas', '')).strip().upper()
            iid = str(row.get('ID_Inspeccion', '')).strip()
            if not iid or iid == 'None': iid = str(uuid.uuid4())

            # Completar Inspector si está vacío usando Caseta
            inspector = str(row.get('Inspector', '')).strip()
            if (not inspector or inspector == 'Caseta') and p in truth_map:
                inspector = truth_map[p]['chofer'] # A veces el chofer es quien entrega

            insps.append({
                "id": iid, "user_id": ADMIN_ID, "inspection_type": "19_puntos",
                "placas_unidad": p, "inspector_nombre": inspector or "Admin",
                "status_general": str(row.get('Estado', 'bueno')).lower(),
                "approval_status": str(row.get('Aprobación', 'aprobada')).lower(),
                "created_at": str(row.get('Fecha', '')), "points": []
            })
        if insps: await db.inspections.insert_many(insps)

    # 4. Restaurar Tickets con Auto-Completado
    print("Sincronizando Tickets...")
    await db.shipping_tickets.delete_many({})
    tick_rows = fetch_sheet('Tickets_Embarque')
    if tick_rows:
        h = tick_rows[0]
        tickets = []
        for r in tick_rows[1:]:
            row = dict(zip(h, r))
            p = str(row.get('Placas', '')).strip().upper()
            tid = str(row.get('ID_Ticket', '')).strip()
            if not tid or tid == 'None': tid = str(uuid.uuid4())

            chofer = str(row.get('Chofer/Operador', '')).strip()
            if not chofer and p in truth_map: chofer = truth_map[p]['chofer']

            tickets.append({
                "id": tid, "user_id": ADMIN_ID, "placas_unidad": p,
                "operador": chofer, "cliente": str(row.get('Cliente', '')),
                "almacenista": str(row.get('Almacenista', '')),
                "created_at": str(row.get('Fecha', ''))
            })
        if tickets: await db.shipping_tickets.insert_many(tickets)

    # 5. VINCULAR
    print("Vinculando trazabilidad...")
    all_recs = await db.vehicle_records.find({}).to_list(1000)
    for rec in all_recs:
        p = rec['entry'].get('placas_unidad', '').strip().upper()
        insp = await db.inspections.find_one({"placas_unidad": p}, sort=[("created_at", -1)])
        if insp:
            await db.vehicle_records.update_one({"id": rec["id"]}, {"$set": {"inspection_id": insp["id"]}})
            if rec["status"] == "entrada": await db.vehicle_records.update_one({"id": rec["id"]}, {"$set": {"status": "inspeccionado"}})

    print("Sincronización terminada.")

if __name__ == "__main__":
    asyncio.run(main())
