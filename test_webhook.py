import requests
import os
from dotenv import load_dotenv

load_dotenv()
webhook_url = os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")

payload = {
    "proceso": "TEST",
    "timestamp": "2026-06-26T00:00:00",
    "placas_carpeta": "TEST-123",
    "mes_carpeta": "Junio",
    "carpeta_final": "TEST-123 26.06.2026",
    "reporte_html": "<h1>Test PDF</h1><p>Si ves esto, el PDF funciona.</p>",
    "foto_test": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
}

print(f"Enviando prueba a: {webhook_url}")
try:
    resp = requests.post(webhook_url, json=payload, timeout=30)
    print(f"Status: {resp.status_code}")
    print(f"Body: {resp.text}")
except Exception as e:
    print(f"Error: {e}")
