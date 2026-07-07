import requests
import json
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

def test_webhook():
    url = os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")
    if not url:
        print("❌ Error: No se encontró GOOGLE_SHEET_WEBHOOK_URL en el .env")
        return

    print(f"Probando Webhook en: {url}...")

    payload = {
        "webhook_type": "test_connection",
        "message": "Validando enlace desde SRIUC Core",
        "timestamp": "2026-07-03T14:30:00Z"
    }

    try:
        r = requests.post(url, json=payload, timeout=15)
        print(f"Respuesta Status: {r.status_code}")
        print(f"Respuesta Body: {r.text}")

        if r.status_code == 200:
            print("✅ ¡Conexión exitosa! El script de Google Apps Script recibió los datos.")
        else:
            print("⚠️ El servidor respondió pero con un error. Revisa que el script esté publicado como 'Cualquier persona'.")

    except Exception as e:
        print(f"❌ Error de conexión: {e}")

if __name__ == "__main__":
    test_webhook()
