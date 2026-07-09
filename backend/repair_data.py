import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime

async def repair():
    load_dotenv(Path(__file__).parent / '.env')
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    db = client['naf_inspection']

    print("--- Iniciando Reparación de Datos ---")

    # 1. Encontrar registros activos duplicados
    cursor = db.vehicle_records.aggregate([
        { "$match": { "status": { "$ne": "salida" } } },
        { "$group": {
            "_id": "$entry.placas_unidad",
            "count": { "$sum": 1 },
            "records": { "$push": { "id": "$id", "status": "$status", "created_at": "$created_at", "has_ticket": "$has_shipping_ticket", "insp_id": "$inspection_id" } }
        }},
        { "$match": { "count": { "$gt": 1 } } }
    ])

    async for group in cursor:
        plate = group["_id"]
        records = group["records"]
        print(f"\nProcesando placa duplicada: {plate} ({len(records)} registros activos)")

        # Ordenar por "avance": tiene ticket > tiene inspeccion > mas reciente
        def score(r):
            s = 0
            if r.get("has_ticket"): s += 10
            if r.get("insp_id"): s += 5
            return s

        records.sort(key=lambda x: (score(x), x["created_at"]), reverse=True)

        to_keep = records[0]
        to_close = records[1:]

        print(f"  MANTENER: {to_keep['id']} (Creado: {to_keep['created_at']}, Status: {to_keep['status']})")
        for r in to_close:
            print(f"  CERRAR: {r['id']} (Creado: {r['created_at']})")
            await db.vehicle_records.update_one(
                {"id": r["id"]},
                {"$set": {
                    "status": "salida",
                    "exit": {
                        "fecha_salida": datetime.now().isoformat(),
                        "guardia_salida_nombre": "SISTEMA (Auto-cierre duplicado)",
                        "condicion_salida": "Cerrado por duplicidad"
                    }
                }}
            )

    # 2. Cerrar registros MUY antiguos (más de 48 horas) que sigan activos
    # A veces se olvidan de dar salida.
    print("\n--- Cerrando registros huérfanos de más de 48 horas ---")
    cutoff = (datetime.now()).replace(day=datetime.now().day - 2).isoformat()
    old_records = await db.vehicle_records.find({
        "status": { "$ne": "salida" },
        "created_at": { "$lt": cutoff }
    }).to_list(100)

    for r in old_records:
        print(f"  CERRANDO ANTIGUO: {r['id']} | Placa: {r.get('entry',{}).get('placas_unidad')} | Creado: {r['created_at']}")
        await db.vehicle_records.update_one(
            {"id": r["id"]},
            {"$set": {
                "status": "salida",
                "exit": {
                    "fecha_salida": datetime.now().isoformat(),
                    "guardia_salida_nombre": "SISTEMA (Limpieza automática)",
                    "condicion_salida": "Salida automática por tiempo excedido"
                }
            }}
        )

    print("\n--- Reparación completada ---")

if __name__ == "__main__":
    asyncio.run(repair())
