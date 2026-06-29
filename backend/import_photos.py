import os
import asyncio
import requests
import base64
import io
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from PIL import Image

load_dotenv(Path(__file__).parent / '.env')

TOKEN = 'ya29.a0AT3oNZ9Kztc8W4N424Nu95GY0pXlaQCqY0N9z239N3RZi9HMkLVmHN8IiYg9BYRbqT9QBqLd5XeNkHcCbGLlHVzGGfTk716_9UqwFb5sFdv7z9dIfpbpVe1D40PLNxPbD4JM7H5wEuxdWskB1cwwPo5vZhXW0ZD3OFJtS68VBxIBc0LZJHEBQ3_RvQY-qplIwgl3qhkaCgYKAdoSARUSFQHGX2MielU0Cpbi1RJC9wXfLV1sCg0206'
JUNIO_FOLDER_ID = '1GN_3-y9fMHVKdAsGFz9i-KiAU-37feg6'

def get_b64_from_drive(file_id):
    url = f'https://www.googleapis.com/drive/v3/files/{file_id}?alt=media'
    headers = {'Authorization': f'Bearer {TOKEN}'}
    res = requests.get(url, headers=headers)
    if res.status_code == 200:
        # Compress it a bit to avoid massive mongo docs
        img = Image.open(io.BytesIO(res.content))
        if img.mode in ("RGBA", "P"): img = img.convert("RGB")
        img.thumbnail((800, 800))
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=70)
        return f"data:image/jpeg;base64,{base64.b64encode(buffer.getvalue()).decode()}"
    return None

async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    headers = {'Authorization': f'Bearer {TOKEN}'}
    url = f'https://www.googleapis.com/drive/v3/files?q=\'{JUNIO_FOLDER_ID}\' in parents and trashed=false&fields=files(id, name)'
    folders = requests.get(url, headers=headers).json().get('files', [])

    print(f"Found {len(folders)} folders in Junio.")

    for f in folders:
        # Name pattern: "PLATE DATE"
        parts = f['name'].split(' ')
        if not parts: continue
        plates = parts[0].strip().upper()

        print(f"Processing folder: {f['name']} (Plates: {plates})")

        # Get files in this folder
        f_url = f"https://www.googleapis.com/drive/v3/files?q='{f['id']}' in parents and trashed=false&fields=files(id, name)"
        files = requests.get(f_url, headers=headers).json().get('files', [])

        photo_map = {}
        for file in files:
            name = file['name'].lower()
            if 'foto_frente' in name: photo_map['frente'] = file['id']
            elif 'foto_atras' in name: photo_map['atras'] = file['id']
            elif 'foto_id' in name: photo_map['id_chofer'] = file['id']
            elif 'foto_sello_vvtt' in name: photo_map['sello_vvtt'] = file['id']
            elif 'foto_inicio' in name: photo_map['inicio'] = file['id']
            elif 'foto_media' in name: photo_map['media'] = file['id']
            elif 'foto_final' in name: photo_map['final'] = file['id']

        # Update Vehicle Records
        if any(k in photo_map for k in ['frente', 'atras', 'id_chofer', 'sello_vvtt']):
            record = await db.vehicle_records.find_one({"entry.placas_unidad": plates}, sort=[("created_at", -1)])
            if record:
                updates = {}
                if 'frente' in photo_map: updates["entry.foto_frente_unidad"] = get_b64_from_drive(photo_map['frente'])
                if 'atras' in photo_map: updates["entry.foto_atras_caja"] = get_b64_from_drive(photo_map['atras'])
                if 'id_chofer' in photo_map: updates["entry.foto_id_chofer"] = get_b64_from_drive(photo_map['id_chofer'])
                if 'sello_vvtt' in photo_map: updates["exit.sello_vvtt_foto"] = get_b64_from_drive(photo_map['sello_vvtt'])

                if updates:
                    await db.vehicle_records.update_one({"id": record["id"]}, {"$set": updates})
                    print(f"  Updated photos for record {record['id']}")

        # Update Shipping Tickets
        if any(k in photo_map for k in ['inicio', 'media', 'final']):
            ticket = await db.shipping_tickets.find_one({"placas_unidad": plates}, sort=[("created_at", -1)])
            if ticket:
                updates = {}
                if 'inicio' in photo_map: updates["foto_inicio_carga"] = get_b64_from_drive(photo_map['inicio'])
                if 'media' in photo_map: updates["foto_media_carga"] = get_b64_from_drive(photo_map['media'])
                if 'final' in photo_map: updates["foto_final_carga"] = get_b64_from_drive(photo_map['final'])

                if updates:
                    await db.shipping_tickets.update_one({"id": ticket["id"]}, {"$set": updates})
                    print(f"  Updated photos for ticket {ticket['id']}")

    print("Photo import finished.")

if __name__ == "__main__":
    asyncio.run(main())
