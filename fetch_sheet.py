import requests
import csv
import io

TOKEN = 'ya29.a0AT3oNZ_ZZQN015DDFo3_wQ6zCTVx_AY1y9Hb1-0HHAMJVw8vLck4o24xwMK4XwEUo9QX-0eblHVZ-d7Q7YCZ2BCr1K0LnHUp3HXQAbU3bcYMg1THQYgnBlTvxy53BsUNhSUEWIHvzbLy2ZJcllktNWTzMc5Tf8JJkO_nAoYVa5qaSWPdkpqSXf4sBn3_BtWapOJjn50aCgYKAf0SARUSFQHGX2MiE0slJS6rEBz7DdkQIecnYg0206'
SPREADSHEET_ID = '1o1l0iH74CykHu4p7Ybaa08HSNeRaesy_OOG4DpkGoPE'

def fetch():
    url = f'https://www.googleapis.com/drive/v3/files/{SPREADSHEET_ID}/export?mimeType=text/csv'
    headers = {'Authorization': f'Bearer {TOKEN}'}

    r = requests.get(url, headers=headers)
    if r.status_code == 200:
        print("¡Conexión exitosa con Google Sheets!")
        reader = csv.DictReader(io.StringIO(r.text))
        rows = list(reader)
        print(f"Encontradas {len(rows)} filas en la hoja de cálculo.")
        for row in rows[:5]:
            print(f"  Row: {row.get('Placas')} | {row.get('Fecha')}")
    else:
        print(f"Error al conectar: {r.status_code} - {r.text}")

if __name__ == "__main__":
    fetch()
