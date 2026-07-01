"""
Script de una sola vez: normaliza TODAS las placas existentes en la base de datos
(vehicle_records.entry.placas_unidad/placas_caja/escolta.placas,
 vehicle_records.exit.escolta.placas,
 inspections.placas_unidad,
 shipping_tickets.placas_unidad)

Regla: solo A-Z y 0-9 (mayusculas), se elimina cualquier otro caracter
(espacios, guiones, puntos, minusculas, acentos, etc.)
"""
import asyncio
import os
import re
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "ctpat")


def sanitize_plate(value):
    if not value or not isinstance(value, str):
        return value
    return re.sub(r"[^A-Z0-9]", "", value.upper())


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    print(f"Conectado a DB: {DB_NAME}")
    total_changed = 0

    # 1. vehicle_records
    cursor = db.vehicle_records.find({})
    records = await cursor.to_list(10000)
    print(f"vehicle_records encontrados: {len(records)}")
    for rec in records:
        update = {}
        entry = rec.get("entry") or {}
        exitd = rec.get("exit") or {}

        pu = sanitize_plate(entry.get("placas_unidad", ""))
        if pu != entry.get("placas_unidad", ""):
            update["entry.placas_unidad"] = pu

        pc = sanitize_plate(entry.get("placas_caja", ""))
        if pc != entry.get("placas_caja", ""):
            update["entry.placas_caja"] = pc

        esc_entry = entry.get("escolta") or {}
        if esc_entry.get("placas"):
            pe = sanitize_plate(esc_entry.get("placas", ""))
            if pe != esc_entry.get("placas", ""):
                update["entry.escolta.placas"] = pe

        esc_exit = exitd.get("escolta") or {}
        if esc_exit.get("placas"):
            pex = sanitize_plate(esc_exit.get("placas", ""))
            if pex != esc_exit.get("placas", ""):
                update["exit.escolta.placas"] = pex

        if update:
            print(f"  [vehicle_records:{rec.get('id')}] {update}")
            await db.vehicle_records.update_one({"id": rec["id"]}, {"$set": update})
            total_changed += 1

    # 2. inspections
    cursor = db.inspections.find({})
    insps = await cursor.to_list(10000)
    print(f"inspections encontradas: {len(insps)}")
    for insp in insps:
        pu = sanitize_plate(insp.get("placas_unidad", ""))
        if pu != insp.get("placas_unidad", ""):
            print(f"  [inspections:{insp.get('id')}] placas_unidad -> {pu}")
            await db.inspections.update_one({"id": insp["id"]}, {"$set": {"placas_unidad": pu}})
            total_changed += 1

    # 3. shipping_tickets
    cursor = db.shipping_tickets.find({})
    tickets = await cursor.to_list(10000)
    print(f"shipping_tickets encontrados: {len(tickets)}")
    for tk in tickets:
        pu = sanitize_plate(tk.get("placas_unidad", ""))
        if pu != tk.get("placas_unidad", ""):
            print(f"  [shipping_tickets:{tk.get('id')}] placas_unidad -> {pu}")
            await db.shipping_tickets.update_one({"id": tk["id"]}, {"$set": {"placas_unidad": pu}})
            total_changed += 1

    print(f"\nTOTAL de documentos corregidos: {total_changed}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
