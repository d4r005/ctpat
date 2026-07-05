import os
import asyncio
import re
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path

# Cargar variables de entorno si existen
load_dotenv()

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'ctpat')
SHEET_ID = os.environ.get('SHEET_ID', '1o1l0iH74CykHu4p7Ybaa08HSNeRaesy_OOG4DpkGoPE') # Tomado de repair_and_sync_back.py

UNITS_TO_CHECK = [
    {"placas": "961A3T", "fecha": "3/7/2026", "chofer": "JOSE LUIS ELIZONDO"},
    {"placas": "70LA3X", "fecha": "2/7/2026", "chofer": "HECTOR GARCIA SANTIAGO"},
    {"placas": "67AU5H", "fecha": "2/7/2026", "chofer": "JOSE ALEJANDRO MTZ VEGA"},
    {"placas": "70LA3X", "fecha": "2/7/2026", "chofer": "HECTOR GOMI SANTIAGO"},
    {"placas": "75BA3Z", "fecha": "1/7/2026", "chofer": "DANIEL TORRES"},
    {"placas": "76LA2K", "fecha": "1/7/2026", "chofer": "SEBASTIAN MARES"},
    {"placas": "62LAZJ", "fecha": "1/7/2026", "chofer": "EMETERIO PASTRANA"},
    {"placas": "58LA5B", "fecha": "1/7/2026", "chofer": "FELIPE ZUÑIGA"},
    {"placas": "33BH8N", "fecha": "1/7/2026", "chofer": "EUSEBIO RAMIREZ"},
    {"placas": "36AY3A", "fecha": "26/6/2026", "chofer": "MAGDALENO VALENTIN"},
    {"placas": "27BL3L", "fecha": "26/6/2026", "chofer": "YAEL RODRIGUEZ MENDOZA"},
    {"placas": "36BB3B", "fecha": "26/6/2026", "chofer": "RICARDO PRESAS"},
    {"placas": "5BLA5B", "fecha": "26/6/2026", "chofer": "FELIPE ZÚÑIGA"},
    {"placas": "43LA8G", "fecha": "26/6/2026", "chofer": "URIEL DOMÍNGUEZ"},
    {"placas": "69AB6A", "fecha": "26/6/2026", "chofer": "HIPOLITO BELTRAN"},
    {"placas": "17AF8S", "fecha": "26/6/2026", "chofer": "ERASMO AGUILAR"},
    {"placas": "694064", "fecha": "26/6/2026", "chofer": "JOSE RODRIGUEZ"},
    {"placas": "76BCSN", "fecha": "26/6/2026", "chofer": "CARLOS HERNANDEZ"},
]

def _canon_plate(plates: str) -> str:
    pl = re.sub(r'[^A-Z0-9]', '', (plates or '').upper())
    # Colapsar visualmente ambiguos para la busqueda
    _PLATE_OCR_CANON = {'Z': '2', 'O': '0', 'I': '1', 'S': '5', 'B': '8', 'G': '6'}
    return "".join(_PLATE_OCR_CANON.get(ch, ch) for ch in pl)

async def get_tokens(db):
    tokens = {}
    async for doc in db.system_tokens.find({}):
        tokens[doc['key']] = doc['value']
    return tokens

async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    tokens = await get_tokens(db)
    drive_token = tokens.get('googledrive_access_token')
    if not drive_token:
        print("❌ No se encontró GOOGLEDRIVE_ACCESS_TOKEN en MongoDB.")
        # Fallback al hardcoded de repair_and_sync_back.py por si acaso
        drive_token = 'ya29.a0AT3oNZ_ZZQN015DDFo3_wQ6zCTVx_AY1y9Hb1-0HHAMJVw8vLck4o24xwMK4XwEUo9QX-0eblHVZ-d7Q7YCZ2BCr1K0LnHUp3HXQAbU3bcYMg1THQYgnBlTvxy53BsUNhSUEWIHvzbLy2ZJcllktNWTzMc5Tf8JJkO_nAoYVa5qaSWPdkpqSXf4sBn3_BtWapOJjn50aCgYKAf0SARUSFQHGX2MiE0slJS6rEBz7DdkQIecnYg0206'

    headers = {"Authorization": f"Bearer {drive_token}"}

    print(f"--- Iniciando Verificación de {len(UNITS_TO_CHECK)} unidades ---\n")

    for unit in UNITS_TO_CHECK:
        placas = unit['placas']
        chofer = unit['chofer']
        fecha_str = unit['fecha']

        print(f"🔍 Verificando: {placas} | {chofer} | {fecha_str}")

        # 1. Buscar en Mongo
        # La fecha en Mongo suele ser ISO, pero a veces guardamos created_at como string DD/MM/YYYY en algunos scripts
        # Vamos a buscar por placas y chofer principalmente
        regex_placas = re.compile(f".*{_canon_plate(placas)}.*", re.IGNORECASE)

        # Buscar el record de caseta
        record = await db.vehicle_records.find_one({
            "entry.placas_unidad": {"$regex": placas, "$options": "i"},
            "entry.chofer_nombre": {"$regex": chofer.split()[0], "$options": "i"} # Primer nombre para ser flexible
        })

        if not record:
            # Intentar solo por placas si no se encuentra
            record = await db.vehicle_records.find_one({
                "entry.placas_unidad": {"$regex": placas, "$options": "i"}
            })

        if not record:
            print(f"  ❌ NO encontrado en MongoDB (vehicle_records)")
            continue

        print(f"  ✅ Encontrado en MongoDB: ID {record['id']} | Status: {record['status']}")

        # 2. Verificar evidencia (Drive links)
        entry = record.get('entry', {})
        exit = record.get('exit', {}) or {}

        photos = [
            entry.get('foto_frente_unidad'),
            entry.get('foto_atras_caja'),
            entry.get('foto_id_chofer'),
            exit.get('sello_vvtt_foto')
        ]

        drive_photos = [p for p in photos if p and 'drive.google.com' in p]
        if drive_photos:
            print(f"  ✅ Evidencia encontrada: {len(drive_photos)} fotos en Drive.")
        else:
            # Si no hay links de Drive, tal vez están en base64 o no existen
            b64_photos = [p for p in photos if p and p.startswith('data:image')]
            if b64_photos:
                print(f"  ⚠️ Evidencia en Base64 ({len(b64_photos)} fotos). Debería subirse a Drive.")
            else:
                print(f"  ❌ Sin evidencia fotográfica en el registro.")

        # 3. Verificar en Google Sheets
        # Esto es más lento porque hay que consultar el API de Sheets
        # Pero podemos intentar ver si el record_id está en la hoja 'Entradas_Salidas'
        try:
            url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/Entradas_Salidas!A:A"
            res = requests.get(url, headers=headers)
            if res.status_code == 200:
                col_a = res.json().get('values', [])
                flat_col_a = [item[0] for item in col_a if item]
                key_entrada = f"{record['id']}:entrada"
                if key_entrada in flat_col_a:
                    print(f"  ✅ Sincronizado en Google Sheets (Entradas_Salidas).")
                else:
                    print(f"  ❌ NO sincronizado en Google Sheets.")
                    # Aquí podríamos disparar la sincronización si tuviéramos el código del backend a mano
            else:
                print(f"  ❌ Error al consultar Google Sheets: {res.status_code}")
        except Exception as e:
            print(f"  ❌ Error consultando Sheets: {e}")

        print("-" * 30)

if __name__ == "__main__":
    asyncio.run(main())
