import os
import requests
from dotenv import load_dotenv

load_dotenv()

SHEET_ID = "1o1l0iH74CykHu4p7Ybaa08HSNeRaesy_OOG4DpkGoPE"
TOKEN = os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN")

def update_headers(hoja, headers):
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/'{hoja}'!A1"
    body = {
        "range": f"'{hoja}'!A1",
        "majorDimension": "ROWS",
        "values": [headers]
    }
    resp = requests.put(
        url,
        params={"valueInputOption": "RAW"},
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        json=body,
        timeout=15
    )
    if resp.status_code == 200:
        print(f"✅ Cabeceras actualizadas en: {hoja}")
    else:
        print(f"❌ Error en {hoja}: {resp.status_code} - {resp.text}")

if __name__ == "__main__":
    if not TOKEN:
        print("❌ Error: GOOGLEDRIVE_ACCESS_TOKEN no encontrado en .env")
    else:
        # 1. Entradas y Salidas
        update_headers("Entradas_Salidas", [
            "ID_Registro", "ID_Inspeccion", "ID_Embarque", "Fecha", "Proceso",
            "Placas", "Chofer", "Compañia", "Tractor", "Caja", "Sello",
            "Destino", "Guardia", "Cortina", "Licencia", "Condicion"
        ])

        # 2. Inspecciones 19 Puntos
        update_headers("Inspecciones_19_Puntos", [
            "ID_Inspeccion", "ID_Registro", "ID_Embarque", "Fecha", "Proceso",
            "Placas", "Inspector", "Status_General", "Fallas", "Approval_Status", "Approved_By",
            "P1","P2","P3","P4","P5","P6","P7","P8","P9","P10","P11","P12","P13","P14","P15","P16","P17","P18","P19"
        ])

        # 3. Inspecciones 9 Puntos
        update_headers("Inspecciones_9_Puntos", [
            "ID_Inspeccion", "ID_Registro", "ID_Embarque", "Fecha", "Proceso",
            "Placas", "Inspector", "Status_General", "Fallas", "Approval_Status", "Approved_By",
            "P1","P2","P3","P4","P5","P6","P7","P8","P9"
        ])

        # 4. Tickets Embarque
        update_headers("Tickets_Embarque", [
            "ID_Embarque", "ID_Registro", "ID_Inspeccion", "Fecha", "Proceso",
            "Placas", "Cliente", "Almacenista", "Operador", "Linea_Transporte",
            "Caja", "Pallets", "Sello", "Guardia", "Observaciones", "Area"
        ])
