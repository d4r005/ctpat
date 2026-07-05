import os
import asyncio
import re
import requests
import uuid
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
from dotenv import load_dotenv

# Configuración - AJUSTA ESTO SI ES NECESARIO
load_dotenv()
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'ctpat')
# SPREADSHEET_ID de producción
SHEET_ID = os.environ.get('SHEET_ID', '1o1l0iH74CykHu4p7Ybaa08HSNeRaesy_OOG4DpkGoPE')

UNITS = [
    {"p": "961A3T", "d": "3/7/2026", "c": "JOSE LUIS ELIZONDO"},
    {"p": "70LA3X", "d": "2/7/2026", "c": "HECTOR GARCIA SANTIAGO"},
    {"p": "67AU5H", "d": "2/7/2026", "c": "JOSE ALEJANDRO MTZ VEGA"},
    {"p": "70LA3X", "d": "2/7/2026", "c": "HECTOR GOMI SANTIAGO"},
    {"p": "75BA3Z", "d": "1/7/2026", "c": "DANIEL TORRES"},
    {"p": "76LA2K", "d": "1/7/2026", "c": "SEBASTIAN MARES"},
    {"p": "62LAZJ", "d": "1/7/2026", "c": "EMETERIO PASTRANA"},
    {"p": "58LA5B", "d": "1/7/2026", "c": "FELIPE ZUÑIGA"},
    {"p": "33BH8N", "d": "1/7/2026", "c": "EUSEBIO RAMIREZ"},
    {"p": "36AY3A", "d": "26/6/2026", "c": "MAGDALENO VALENTIN"},
    {"p": "27BL3L", "d": "26/6/2026", "c": "YAEL RODRIGUEZ MENDOZA"},
    {"p": "36BB3B", "d": "26/6/2026", "c": "RICARDO PRESAS"},
    {"p": "5BLA5B", "d": "26/6/2026", "c": "FELIPE ZÚÑIGA"},
    {"p": "43LA8G", "d": "26/6/2026", "c": "URIEL DOMÍNGUEZ"},
    {"p": "69AB6A", "d": "26/6/2026", "c": "HIPOLITO BELTRAN"},
    {"p": "17AF8S", "d": "26/6/2026", "c": "ERASMO AGUILAR"},
    {"p": "694064", "d": "26/6/2026", "c": "JOSE RODRIGUEZ"},
    {"p": "76BCSN", "d": "26/6/2026", "c": "CARLOS HERNANDEZ"},
]

def _canon_plate(p):
    return re.sub(r'[^A-Z0-9]', '', (p or '').upper())

async def sync_to_sheets(token, tipo, data):
    # Implementación simplificada basada en server.py
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    hoja = ""
    row = []
    key = ""

    if tipo == "entrada":
        hoja = "Entradas_Salidas"
        entry = data.get("entry", {})
        key = f"{data['id']}:entrada"
        row = [key, data.get("created_at"), "ENTRADA", entry.get("placas_unidad"), entry.get("chofer_nombre"),
               entry.get("compania_transporte"), entry.get("numero_tractor"), entry.get("numero_caja"),
               entry.get("sello_entrada"), entry.get("destino"), entry.get("guardia_caseta_nombre")]

    # ... (omitir el resto por brevedad en este script de utilidad, o implementarlo si es necesario)

    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{hoja}!A:Z:append?valueInputOption=USER_ENTERED"
    res = requests.post(url, headers=headers, json={"values": [row]})
    return res.status_code == 200

async def main():
    print(f"🔗 Conectando a MongoDB: {MONGO_URL}...")
    try:
        client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        db = client[DB_NAME]
        # Verificar conexión
        await db.command("ping")
    except Exception as e:
        print(f"❌ Error conectando a MongoDB: {e}")
        print("Asegúrate de que MongoDB esté corriendo o que MONGO_URL sea correcto.")
        return

    # Obtener tokens de Drive/Sheets desde la DB (como hace el server)
    token_doc = await db.system_tokens.find_one({"key": "googledrive_access_token"})
    token = token_doc["value"] if token_doc else os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN")

    if not token:
        print("❌ Error: No se encontró GOOGLEDRIVE_ACCESS_TOKEN. Consíguelo del admin o del servidor.")
        return

    print("📊 Verificando unidades y sincronizando...")

    for u in UNITS:
        placas = u["p"]
        chofer = u["c"]
        print(f"\n🔎 Unidad: {placas} ({chofer})")

        # Buscar en vehicle_records
        record = await db.vehicle_records.find_one({
            "entry.placas_unidad": {"$regex": placas, "$options": "i"},
            "entry.chofer_nombre": {"$regex": chofer.split()[0], "$options": "i"}
        })

        if not record:
            print(f"  ⚠️ No se encontró registro en Mongo para {placas}. Buscando por placa solamente...")
            record = await db.vehicle_records.find_one({"entry.placas_unidad": {"$regex": placas, "$options": "i"}})

        if record:
            print(f"  ✅ Encontrado en Mongo (ID: {record['id']})")
            # Verificar si tiene evidencia
            has_drive = any("drive.google.com" in str(v) for v in record.get("entry", {}).values())
            print(f"  {'✅' if has_drive else '❌'} Evidencia en Drive: {'SÍ' if has_drive else 'NO'}")

            # Sincronizar (forzar re-append o usar logic del server)
            # Para este script, solo informaremos si está en Mongo pero no en Drive
        else:
            print(f"  ❌ NO encontrado en Mongo.")

if __name__ == "__main__":
    asyncio.run(main())
