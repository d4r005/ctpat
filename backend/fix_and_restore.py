import os
import asyncio
import requests
import uuid
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime

load_dotenv(Path(__file__).parent / '.env')

TOKEN = 'ya29.a0AT3oNZ9Kztc8W4N424Nu95GY0pXlaQCqY0N9z239N3RZi9HMkLVmHN8IiYg9BYRbqT9QBqLd5XeNkHcCbGLlHVzGGfTk716_9UqwFb5sFdv7z9dIfpbpVe1D40PLNxPbD4JM7H5wEuxdWskB1cwwPo5vZhXW0ZD3OFJtS68VBxIBc0LZJHEBQ3_RvQY-qplIwgl3qhkaCgYKAdoSARUSFQHGX2MielU0Cpbi1RJC9wXfLV1sCg0206'
SPREADSHEET_ID = '1o1l0iH74CykHu4p7Ybaa08HSNeRaesy_OOG4DpkGoPE'
ADMIN_ID = '565aff66-9ec7-4483-b5f2-533d018cf25c'

def fetch_sheet_data(sheet_name):
    url = f'https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/{sheet_name}?valueRenderOption=UNFORMATTED_VALUE'
    headers = {'Authorization': f'Bearer {TOKEN}'}
    r = requests.get(url, headers=headers)
    if r.status_code != 200:
        print(f"Error fetching {sheet_name}: {r.text}")
        return []
    return r.json().get('values', [])

async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    print("--- Limpiando datos previos con errores ---")
    await db.vehicle_records.delete_many({})
    await db.inspections.delete_many({})
    await db.shipping_tickets.delete_many({})

    # 1. Entradas y Salidas
    print("--- Restaurando Caseta ---")
    rows = fetch_sheet_data('Entradas_Salidas')
    records_map = {}
    if rows:
        header = rows[0]
        for r in rows[1:]:
            row = dict(zip(header, r))
            rec_id = str(row.get('ID_Registro'))
            if not rec_id: continue

            placas = str(row.get('Placas', '')).strip().upper()
            proceso = str(row.get('Proceso', '')).lower()

            if rec_id not in records_map:
                records_map[rec_id] = {
                    "id": rec_id,
                    "user_id": ADMIN_ID,
                    "status": "entrada",
                    "entry": {
                        "sucursal": "Escobedo",
                        "direccion": "Av. Expansion #350",
                        "licencia_conductor": str(row.get('Licencia', '')),
                        "placas_unidad": placas,
                        "chofer_nombre": str(row.get('Chofer', '')),
                        "compania_transporte": str(row.get('Compañía', '')),
                        "numero_tractor": str(row.get('Tractor', '')),
                        "numero_caja": str(row.get('Caja', '')),
                        "sello_entrada": str(row.get('Sello', '')),
                        "destino": str(row.get('Destino', '')),
                        "guardia_caseta_nombre": str(row.get('Guardia', '')),
                        "condicion_carga": str(row.get('Condición_Carga', '')),
                        "fecha_entrada": str(row.get('Fecha'))
                    },
                    "exit": None,
                    "inspection_id": None,
                    "created_at": str(row.get('Fecha'))
                }

            if proceso == 'salida':
                records_map[rec_id]["status"] = "salida"
                records_map[rec_id]["exit"] = {
                    "fecha_salida": str(row.get('Fecha')),
                    "guardia_salida_nombre": str(row.get('Guardia', '')),
                    "destino": str(row.get('Destino', '')),
                    "numero_caja_salida": str(row.get('Caja', ''))
                }

        if records_map:
            await db.vehicle_records.insert_many(list(records_map.values()))
            print(f"OK: {len(records_map)} registros de caseta.")

    # 2. Inspecciones 19 Puntos
    print("--- Restaurando Inspecciones 19 ---")
    rows = fetch_sheet_data('Inspecciones_19_Puntos')
    if rows:
        header = rows[0]
        insps = []
        for r in rows[1:]:
            row = dict(zip(header, r))
            insp_id = str(row.get('ID_Inspeccion'))
            if not insp_id: continue

            placas = str(row.get('Placas', '')).strip().upper()
            points = []
            for idx, col in enumerate(header):
                if idx >= 8 and '. ' in col:
                    num = int(col.split('. ')[0])
                    name = col.split('. ')[1]
                    val = str(row.get(col, '')).lower()
                    points.append({"number": num, "name": name, "estado": val or "bueno", "comentarios": ""})

            insps.append({
                "id": insp_id,
                "user_id": ADMIN_ID,
                "inspection_type": "19_puntos",
                "placas_unidad": placas,
                "compania_transportista": "",
                "numero_trailer": "",
                "points": points,
                "inspector_nombre": str(row.get('Inspector', 'Admin')),
                "status_general": str(row.get('Estado', 'bueno')).lower(),
                "approval_status": str(row.get('Aprobación', 'pendiente')).lower(),
                "approved_by_name": str(row.get('Supervisor', '')),
                "created_at": str(row.get('Fecha')),
                "fecha_hora": str(row.get('Fecha'))
            })
        if insps:
            await db.inspections.insert_many(insps)
            print(f"OK: {len(insps)} inspecciones 19.")

    # 3. Tickets
    print("--- Restaurando Tickets ---")
    rows = fetch_sheet_data('Tickets_Embarque')
    if rows:
        header = rows[0]
        tickets = []
        for r in rows[1:]:
            row = dict(zip(header, r))
            tid = str(row.get('ID_Ticket'))
            if not tid: continue

            tickets.append({
                "id": tid,
                "user_id": ADMIN_ID,
                "almacenista": str(row.get('Almacenista', '')),
                "cliente": str(row.get('Cliente', '')),
                "operador": str(row.get('Chofer/Operador', '')),
                "linea_transporte": str(row.get('Línea Transporte', '')),
                "placas_unidad": str(row.get('Placas', '')).strip().upper(),
                "numero_caja": str(row.get('Caja', '')),
                "numero_pallets": str(row.get('Pallets', '')),
                "numero_sello": str(row.get('Sello Final', '')),
                "nombre_guardia": str(row.get('Guardia', '')),
                "observaciones": str(row.get('Observaciones', '')),
                "area": str(row.get('Área', '')),
                "fecha": str(row.get('Fecha')),
                "created_at": str(row.get('Fecha'))
            })
        if tickets:
            await db.shipping_tickets.insert_many(tickets)
            print(f"OK: {len(tickets)} tickets.")

    # 4. Vincular todo
    print("--- Re-vinculando trazabilidad ---")
    all_recs = await db.vehicle_records.find({}).to_list(1000)
    for rec in all_recs:
        p = rec['entry'].get('placas_unidad', '').strip().upper()
        if not p: continue

        insp = await db.inspections.find_one({"placas_unidad": p}, sort=[("created_at", -1)])
        if insp:
            await db.vehicle_records.update_one({"id": rec["id"]}, {"$set": {"inspection_id": insp["id"], "status": "inspeccionado" if rec["status"]=="entrada" else "salida"}})

    print("Restauración finalizada exitosamente.")

if __name__ == "__main__":
    asyncio.run(main())
