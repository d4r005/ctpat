import os
import asyncio
import re
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

async def full_repair():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    print("--- REPARACIÓN PROFUNDA DE VÍNCULOS (SRIUC) ---")

    # 1. Obtener todos los documentos
    records = await db.vehicle_records.find().to_list(1000)
    inspections = await db.inspections.find().to_list(1000)
    tickets = await db.shipping_tickets.find().to_list(1000)

    print(f"Estado inicial: {len(records)} Casetas, {len(inspections)} Inspecciones, {len(tickets)} Tickets")

    def normalize(p):
        return re.sub(r'[^A-Z0-9]', '', str(p).upper()) if p else ""

    updates_count = 0

    for r in records:
        r_id = r['id']
        plates = normalize(r.get('entry', {}).get('placas_unidad'))
        if not plates: continue

        current_insp_ids = set(r.get('inspection_ids', []))
        if r.get('inspection_id'): current_insp_ids.add(r['inspection_id'])

        # Buscar inspecciones que coincidan por placa y no estén vinculadas
        new_insp_ids = list(current_insp_ids)
        for insp in inspections:
            i_plates = normalize(insp.get('placas_unidad'))
            if i_plates == plates and insp['id'] not in current_insp_ids:
                new_insp_ids.append(insp['id'])
                print(f"  [VÍNCULO] Caseta {plates} <-> Inspección {insp['id']}")

        # Buscar tickets que coincidan por placa
        found_ticket_id = r.get('shipping_ticket_id')
        if not found_ticket_id:
            for t in tickets:
                t_plates = normalize(t.get('placas_unidad'))
                if t_plates == plates:
                    found_ticket_id = t['id']
                    print(f"  [VÍNCULO] Caseta {plates} <-> Ticket {t['id']}")
                    break

        # Aplicar cambios si hubo hallazgos
        if len(new_insp_ids) > len(current_insp_ids) or found_ticket_id != r.get('shipping_ticket_id'):
            await db.vehicle_records.update_one(
                {"id": r_id},
                {"$set": {
                    "inspection_ids": new_insp_ids,
                    "inspection_id": new_insp_ids[0] if new_insp_ids else None,
                    "shipping_ticket_id": found_ticket_id,
                    "has_shipping_ticket": found_ticket_id is not None
                }}
            )
            updates_count += 1

    print(f"\nReparación terminada. Se actualizaron {updates_count} registros de caseta.")
    print("Ahora en el panel Maestro deberías ver los iconos de Inspección y Ticket activos en cada fila.")

if __name__ == "__main__":
    asyncio.run(full_repair())
