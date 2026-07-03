import os
import asyncio
import base64
import io
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from PIL import Image, ImageOps

# Cargar configuración
load_dotenv(Path(__file__).parent / '.env')

def fix_image(b64: str) -> str:
    if not b64 or not b64.startswith("data:image"):
        return b64
    try:
        header, data = b64.split(",", 1)
        content = base64.b64decode(data)
        img = Image.open(io.BytesIO(content))

        # Corregir orientación EXIF
        img = ImageOps.exif_transpose(img)

        # Convertir a RGB y optimizar
        if img.mode in ("RGBA", "P"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "RGBA":
                bg.paste(img, mask=img.split()[3])
            else:
                bg.paste(img)
            img = bg
        else:
            img = img.convert("RGB")

        img.thumbnail((1200, 1200))
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=85)
        return f"data:image/jpeg;base64,{base64.b64encode(out.getvalue()).decode()}"
    except Exception as e:
        print(f"Error procesando imagen: {e}")
        return b64

async def fix_database():
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    if not mongo_url or not db_name:
        print("Error: MONGO_URL o DB_NAME no configurados en .env")
        return

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print(f"Conectado a {db_name}. Iniciando reparación de fotos...")

    # 1. Reparar Vehicle Records (Caseta Entry/Exit)
    print("Procesando vehicle_records...")
    cursor = db.vehicle_records.find({})
    async for rec in cursor:
        updated = False
        entry = rec.get("entry") or {}
        exit_data = rec.get("exit") or {}

        # Campos de entrada
        photo_fields = [
            "foto_frente_unidad", "foto_atras_caja", "foto_id_chofer",
            "foto_sello_vvtt", "foto_sello", "foto_carga_1", "foto_carga_2",
            "foto_carga_3", "foto_interior_1", "foto_interior_2", "foto_interior_3"
        ]

        for field in photo_fields:
            if entry.get(field) and entry[field].startswith("data:image"):
                old_val = entry[field]
                new_val = fix_image(old_val)
                if new_val != old_val:
                    entry[field] = new_val
                    updated = True

        # Campos de salida
        if exit_data.get("sello_vvtt_foto") and exit_data["sello_vvtt_foto"].startswith("data:image"):
            old_val = exit_data["sello_vvtt_foto"]
            new_val = fix_image(old_val)
            if new_val != old_val:
                exit_data["sello_vvtt_foto"] = new_val
                updated = True

        if updated:
            await db.vehicle_records.update_one({"id": rec["id"]}, {"$set": {"entry": entry, "exit": exit_data}})
            print(f"  [OK] Registro Caseta: {rec.get('id')} - {entry.get('placas_unidad')}")

    # 2. Reparar Inspecciones (Puntos con fotos base64)
    print("\nProcesando inspections...")
    cursor = db.inspections.find({})
    async for insp in cursor:
        updated = False
        points = insp.get("points", [])

        for pt in points:
            if pt.get("photo") and pt["photo"].startswith("data:image"):
                old_val = pt["photo"]
                new_val = fix_image(old_val)
                if new_val != old_val:
                    pt["photo"] = new_val
                    updated = True

        if updated:
            await db.inspections.update_one({"id": insp["id"]}, {"$set": {"points": points}})
            print(f"  [OK] Inspección: {insp.get('id')} - {insp.get('placas_unidad')}")

    print("\nReparación completa.")

if __name__ == "__main__":
    asyncio.run(fix_database())
