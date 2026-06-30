import asyncio
import os
import requests
import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

async def run_test():
    load_dotenv()
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    api_url = "https://d4r005-sriuc.hf.space"

    # Credenciales para autenticación (usar una cuenta existente)
    email = "d.trujillo@brancoindustries.com"
    password = "123" # O la contraseña que tengas configurada

    if not mongo_url or not db_name:
        print("❌ Error: Configuración de MongoDB no encontrada.")
        return

    print("🚀 Iniciando PRUEBA DE FLUJO AUTOMÁTICO...")

    # 0. Autenticación para obtener Token
    print("🔑 Autenticando...")
    try:
        login_res = requests.post(f"{api_url}/api/auth/login", json={"email": email, "password": password})
        if login_res.status_code != 200:
            print(f"❌ Error de login: {login_res.text}")
            return
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
    except Exception as e:
        print(f"❌ Fallo de conexión para login: {e}")
        return

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    # 1. Crear un registro de entrada
    rec_id = str(uuid.uuid4())
    placas = f"TEST-{datetime.now().strftime('%H%M%S')}"

    entry_doc = {
        "id": rec_id,
        "user_id": "test_system",
        "status": "entrada",
        "entry": {
            "placas_unidad": placas,
            "chofer_nombre": "PRUEBA AUTOMATICA",
            "compania_transporte": "TEST LOGISTICS",
            "numero_tractor": "T-001",
            "numero_caja": "C-001",
            "condicion_carga": "DESCARGA (Prueba)",
            "guardia_caseta_nombre": "SISTEMA",
            "fecha_entrada": datetime.now(timezone.utc).isoformat()
        },
        "inspection_ids": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    print(f"📦 1. Creando Entrada en BD: {placas}")
    await db.vehicle_records.insert_one(entry_doc)

    # 2. Crear Inspección en BD
    insp_id = str(uuid.uuid4())
    insp_doc = {
        "id": insp_id,
        "record_id": rec_id,
        "placas_unidad": placas,
        "inspector_nombre": "INSPECTOR ROBOT",
        "status_general": "bueno",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "points": [{"number": i, "name": f"Punto {i}", "estado": "bueno"} for i in range(1, 10)]
    }
    print(f"🔍 2. Vinculando Inspección: {insp_id}")
    await db.inspections.insert_one(insp_doc)
    await db.vehicle_records.update_one({"id": rec_id}, {"$set": {"inspection_id": insp_id, "status": "inspeccionado"}, "$addToSet": {"inspection_ids": insp_id}})

    # 3. Disparar Salida vía API
    print(f"🏁 3. Disparando Salida en API ({api_url})...")
    exit_payload = {
        "guardia_salida_nombre": "SISTEMA CIERRE",
        "destino": "BODEGA PRUEBAS",
        "condicion_salida": "VACIO",
        "firma_guardia": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
    }

    try:
        response = requests.patch(
            f"{api_url}/api/vehicle-records/{rec_id}/exit",
            json=exit_payload,
            headers=headers,
            timeout=20
        )

        if response.status_code == 200:
            print(f"✅ Salida exitosa. El servidor ya está procesando el correo en background.")
            print(f"📧 Revisa d.trujillo@brancoindustries.com para la unidad {placas}")
        else:
            print(f"❌ Error en API: {response.status_code} - {response.text}")

    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(run_test())
