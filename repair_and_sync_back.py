import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import requests

load_dotenv(Path(__file__).parent / '.env')

TOKEN = 'ya29.a0AT3oNZ_ZZQN015DDFo3_wQ6zCTVx_AY1y9Hb1-0HHAMJVw8vLck4o24xwMK4XwEUo9QX-0eblHVZ-d7Q7YCZ2BCr1K0LnHUp3HXQAbU3bcYMg1THQYgnBlTvxy53BsUNhSUEWIHvzbLy2ZJcllktNWTzMc5Tf8JJkO_nAoYVa5qaSWPdkpqSXf4sBn3_BtWapOJjn50aCgYKAf0SARUSFQHGX2MiE0slJS6rEBz7DdkQIecnYg0206'
SPREADSHEET_ID = '1o1l0iH74CykHu4p7Ybaa08HSNeRaesy_OOG4DpkGoPE'

async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    # 1. Reparar documentos en Mongo para que pasen la validación del modelo
    print("Reparando documentos en MongoDB...")
    insps = await db.inspections.find({}).to_list(200)
    for i in insps:
        updates = {}
        if 'numero_trailer' not in i: updates['numero_trailer'] = "N/A"
        if 'inspector_firma' not in i: updates['inspector_firma'] = ""
        if 'inspector_nombre' not in i: updates['inspector_nombre'] = "Admin"
        if 'points' not in i: updates['points'] = []

        if updates:
            await db.inspections.update_one({"id": i["id"]}, {"$set": updates})
            print(f"  Reparada inspección {i['id']} ({i.get('placas_unidad')})")

    # 2. Sincronizar de vuelta a Google Sheets para asegurar IDs
    print("Sincronizando IDs de vuelta a Google Sheets...")
    # (Ya lo hicimos en el paso anterior, pero lo repetimos por seguridad para los nuevos campos reparados)
    # Buscaremos la fila en el sheet por placas y fecha, y escribiremos el ID.

    url_base = f'https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/'
    headers = {'Authorization': f'Bearer {TOKEN}'}

    sheet_name = 'Inspecciones_19_Puntos'
    data = requests.get(url_base + f'{sheet_name}!A1:Z200', headers=headers).json().get('values', [])
    if data:
        header = data[0]
        id_idx = header.index('ID_Inspeccion')
        placa_idx = header.index('Placas')
        fecha_idx = header.index('Fecha')

        updates = []
        for idx, row in enumerate(data[1:], start=2):
            placa = row[placa_idx].strip().upper() if len(row) > placa_idx else ""
            fecha = row[fecha_idx].strip() if len(row) > fecha_idx else ""

            # Buscar en Mongo
            doc = await db.inspections.find_one({"placas_unidad": placa, "created_at": fecha})
            if doc:
                updates.append({
                    "range": f"{sheet_name}!{chr(65+id_idx)}{idx}",
                    "values": [[doc['id']]]
                })

        if updates:
            requests.post(f"{url_base}:batchUpdate", headers=headers, json={
                "valueInputOption": "USER_ENTERED",
                "data": updates
            })
            print(f"Actualizados {len(updates)} IDs en Google Sheets.")

    print("Proceso finalizado.")

if __name__ == "__main__":
    asyncio.run(main())
