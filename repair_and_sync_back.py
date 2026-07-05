import asyncio
import os
import re
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import requests

# Cargar variables de entorno
load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "ctpat")
SHEET_ID = "1o1l0iH74CykHu4p7Ybaa08HSNeRaesy_OOG4DpkGoPE"

async def get_drive_token():
    return os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN", "")

async def get_sheet_col_a(token, hoja):
    try:
        url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/'{hoja}'!A2:A5000"
        r = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=10)
        vals = r.json().get("values", [])
        return [v[0] for v in vals if v]
    except Exception as e:
        print(f"Error obteniendo Col A de {hoja}: {e}")
        return []

async def append_to_sheet(token, hoja, row):
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/'{hoja}'!A1:append"
    params = {"valueInputOption": "RAW", "insertDataOption": "INSERT_ROWS"}
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"majorDimension": "ROWS", "values": [row]}
    r = requests.post(url, params=params, headers=headers, json=payload, timeout=10)
    return r.json()

async def run_repair():
    print(f"🚀 Iniciando AUDITORÍA de sincronización...")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    token = await get_drive_token()

    if not token:
        print("❌ Error: No hay token de Google Drive disponible en el entorno.")
        return

    # 1. Obtener registros existentes en el Sheet (para no duplicar)
    print("📊 Consultando registros actuales en Google Sheets...")
    existing_keys = set(await get_sheet_col_a(token, "Entradas_Salidas"))

    # 2. Obtener todos los registros de Mongo
    records = await db.vehicle_records.find({}, {"_id": 0}).to_list(5000)
    print(f"🔍 Encontrados {len(records)} registros en base de datos.")

    missing_count = 0

    for rec in records:
        rec_id = rec.get("id")
        entry = rec.get("entry", {})
        ex = rec.get("exit")

        # Verificar ENTRADA
        key_entrada = f"{rec_id}:entrada"
        if key_entrada not in existing_keys:
            print(f"➕ Sincronizando ENTRADA faltante: {entry.get('placas_unidad')} ({rec_id})")
            row = [
                str(key_entrada),
                str(rec.get("created_at") or ""),
                "ENTRADA",
                str(entry.get("placas_unidad") or ""),
                str(entry.get("chofer_nombre") or ""),
                str(entry.get("compania_transporte") or ""),
                str(entry.get("numero_tractor") or ""),
                str(entry.get("numero_caja") or ""),
                str(entry.get("sello_entrada") or ""),
                str(entry.get("destino") or ""),
                str(entry.get("guardia_caseta_nombre") or ""),
                str(entry.get("cortina_asignada") or ""),
                str(entry.get("licencia_conductor") or ""),
                str(entry.get("condicion_carga") or ""),
            ]
            await append_to_sheet(token, "Entradas_Salidas", row)
            missing_count += 1

        # Verificar SALIDA
        if ex:
            key_salida = f"{rec_id}:salida"
            if key_salida not in existing_keys:
                print(f"➕ Sincronizando SALIDA faltante: {entry.get('placas_unidad')} ({rec_id})")
                row = [
                    str(key_salida),
                    str(ex.get("fecha_salida") or rec.get("created_at") or ""),
                    "SALIDA",
                    str(ex.get("placas_unidad_salida") or entry.get("placas_unidad") or ""),
                    str(entry.get("chofer_nombre") or ""),
                    str(entry.get("compania_transporte") or ""),
                    str(ex.get("numero_tractor_salida") or entry.get("numero_tractor") or ""),
                    str(ex.get("numero_caja_salida") or entry.get("numero_caja") or ""),
                    str(ex.get("sello_salida") or ""),
                    str(ex.get("destino") or entry.get("destino") or ""),
                    str(ex.get("guardia_salida_nombre") or ""),
                    str(ex.get("cortina_salida") or ""),
                    "",
                    str(ex.get("condicion_salida") or ""),
                ]
                await append_to_sheet(token, "Entradas_Salidas", row)
                missing_count += 1

    print(f"✅ Auditoría finalizada. Se recuperaron {missing_count} filas faltantes/corregidas.")
    print("💡 Nota: Al sincronizarse correctamente en el Sheet, el script de Google disparará automáticamente la creación de carpetas y el envío de fotos a Drive en unos momentos.")

if __name__ == "__main__":
    asyncio.run(run_repair())
