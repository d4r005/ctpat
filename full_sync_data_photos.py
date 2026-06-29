import os
import asyncio
import requests
import base64
import io
import uuid
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from PIL import Image
from datetime import datetime, timezone

load_dotenv(Path(__file__).parent / '.env')

TOKEN = 'ya29.a0AT3oNZ_ZZQN015DDFo3_wQ6zCTVx_AY1y9Hb1-0HHAMJVw8vLck4o24xwMK4XwEUo9QX-0eblHVZ-d7Q7YCZ2BCr1K0LnHUp3HXQAbU3bcYMg1THQYgnBlTvxy53BsUNhSUEWIHvzbLy2ZJcllktNWTzMc5Tf8JJkO_nAoYVa5qaSWPdkpqSXf4sBn3_BtWapOJjn50aCgYKAf0SARUSFQHGX2MiE0slJS6rEBz7DdkQIecnYg0206'
SPREADSHEET_ID = '1o1l0iH74CykHu4p7Ybaa08HSNeRaesy_OOG4DpkGoPE'
JUNIO_FOLDER_ID = '1GN_3-y9fMHVKdAsGFz9i-KiAU-37feg6'
ADMIN_ID = '565aff66-9ec7-4483-b5f2-533d018cf25c'

def get_b64_from_drive(file_id):
    url = f'https://www.googleapis.com/drive/v3/files/{file_id}?alt=media'
    headers = {'Authorization': f'Bearer {TOKEN}'}
    res = requests.get(url, headers=headers)
    if res.status_code == 200:
        try:
            img = Image.open(io.BytesIO(res.content))
            if img.mode in ("RGBA", "P"): img = img.convert("RGB")
            img.thumbnail((600, 600))
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=60, optimize=True)
            return f"data:image/jpeg;base64,{base64.b64encode(buffer.getvalue()).decode()}"
        except: return None
    return None

def fetch_sheet(sheet):
    url = f'https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/{sheet}?valueRenderOption=UNFORMATTED_VALUE'
    headers = {'Authorization': f'Bearer {TOKEN}'}
    res = requests.get(url, headers=headers)
    return res.json().get('values', [])

async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    print("1. Sincronizando datos de hojas (incluyendo correcciones manuales)...")

    rows = fetch_sheet('Entradas_Salidas')
    if rows:
        header = rows[0]
        h_seen = {}; h_unique = []
        for c in header:
            if c in h_seen: h_unique.append(f"{c}_2")
            else: h_unique.append(c); h_seen[c]=True

        for r in rows[1:]:
            row = dict(zip(h_unique, r))
            rid = str(row.get('ID_Registro', '')).strip()
            if not rid or rid == 'None': continue

            placas = str(row.get('Placas', '')).strip().upper()
            proceso = str(row.get('Proceso', '')).upper()

            entry_data = {
                "sucursal": "Escobedo", "direccion": "Av. Expansion #350",
                "placas_unidad": placas,
                "chofer_nombre": str(row.get('Chofer', '')),
                "compania_transporte": str(row.get('Compañía', '')),
                "numero_tractor": str(row.get('Tractor', '')),
                "numero_caja": str(row.get('Caja', '')),
                "sello_entrada": str(row.get('Sello', '')),
                "destino": str(row.get('Destino', '')),
                "guardia_caseta_nombre": str(row.get('Guardia', '')),
                "condicion_carga": str(row.get('Condición_Carga', '')),
                "fecha_entrada": str(row.get('Fecha', ''))
            }

            existing = await db.vehicle_records.find_one({"id": rid})
            if existing:
                upd = {"entry": entry_data}
                if proceso == 'SALIDA':
                    upd["status"] = "salida"
                    upd["exit"] = {
                        "fecha_salida": str(row.get('Fecha', '')),
                        "guardia_salida_nombre": str(row.get('Guardia', '')),
                        "destino": str(row.get('Destino', '')),
                        "numero_caja_salida": str(row.get('Caja', ''))
                    }
                await db.vehicle_records.update_one({"id": rid}, {"$set": upd})

    print("2. Importando fotos desde Drive...")
    headers = {'Authorization': f'Bearer {TOKEN}'}
    url = f'https://www.googleapis.com/drive/v3/files?q=\'{JUNIO_FOLDER_ID}\' in parents and trashed=false&fields=files(id, name)'
    folders = requests.get(url, headers=headers).json().get('files', [])

    for f in folders:
        plates = f['name'].split(' ')[0].strip().upper()
        print(f"  Carpeta: {f['name']} -> Placas: {plates}")

        f_url = f"https://www.googleapis.com/drive/v3/files?q='{f['id']}' in parents and trashed=false&fields=files(id, name)"
        files = requests.get(f_url, headers=headers).json().get('files', [])

        photo_ids = {}
        for file in files:
            n = file['name'].lower()
            if 'foto_frente' in n: photo_ids['frente'] = file['id']
            elif 'foto_atras' in n: photo_ids['atras'] = file['id']
            elif 'foto_id' in n: photo_ids['chofer'] = file['id']
            elif 'foto_sello_vvtt' in n: photo_ids['sello'] = file['id']
            elif 'foto_inicio' in n: photo_ids['t_inicio'] = file['id']
            elif 'foto_media' in n: photo_ids['t_media'] = file['id']
            elif 'foto_final' in n: photo_ids['t_final'] = file['id']

        if any(k in photo_ids for k in ['frente', 'atras', 'chofer', 'sello']):
            rec = await db.vehicle_records.find_one({"entry.placas_unidad": plates}, sort=[("created_at", -1)])
            if rec:
                upds = {}
                if 'frente' in photo_ids: upds["entry.foto_frente_unidad"] = get_b64_from_drive(photo_ids['frente'])
                if 'atras' in photo_ids: upds["entry.foto_atras_caja"] = get_b64_from_drive(photo_ids['atras'])
                if 'chofer' in photo_ids: upds["entry.foto_id_chofer"] = get_b64_from_drive(photo_ids['chofer'])

                # FIX: Solo actualizar foto_sello si existe el objeto exit
                if 'sello' in photo_ids and rec.get("exit"):
                    upds["exit.sello_vvtt_foto"] = get_b64_from_drive(photo_ids['sello'])

                if upds:
                    await db.vehicle_records.update_one({"id": rec["id"]}, {"$set": upds})

        if any(k in photo_ids for k in ['t_inicio', 't_media', 't_final']):
            tick = await db.shipping_tickets.find_one({"placas_unidad": plates}, sort=[("created_at", -1)])
            if tick:
                upds = {}
                if 't_inicio' in photo_ids: upds["foto_inicio_carga"] = get_b64_from_drive(photo_ids['t_inicio'])
                if 't_media' in photo_ids: upds["foto_media_carga"] = get_b64_from_drive(photo_ids['t_media'])
                if 't_final' in photo_ids: upds["foto_final_carga"] = get_b64_from_drive(photo_ids['t_final'])
                await db.shipping_tickets.update_one({"id": tick["id"]}, {"$set": upds})

    print("3. Finalizando vínculos...")
    recs = await db.vehicle_records.find({"inspection_id": None}).to_list(100)
    for r in recs:
        p = r['entry'].get('placas_unidad', '').strip().upper()
        insp = await db.inspections.find_one({"placas_unidad": p}, sort=[("created_at", -1)])
        if insp:
            await db.vehicle_records.update_one({"id": r["id"]}, {"$set": {"inspection_id": insp["id"]}})
            if r["status"] == "entrada":
                await db.vehicle_records.update_one({"id": r["id"]}, {"$set": {"status": "inspeccionado"}})

    print("Sincronización completa.")

if __name__ == "__main__":
    asyncio.run(main())
