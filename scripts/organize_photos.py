#!/usr/bin/env python3
"""
Organiza TODA la información fotográfica del SRIUC en Supabase Storage
en carpetas {PLACAS}-{DDMMYYYY}-{HHMM} (hora de llegada de la unidad).

Qué hace:
1. Construye la carpeta de cada visita desde vehicle_records (created_at → hora MX + hora_llegada).
2. Mueve los archivos de storage referenciados (migrated/x.jpg → {carpeta}/x.jpg) y actualiza URLs en la BD.
3. Sube las fotos base64 que viven dentro de la BD (JSONB) al bucket correcto en su carpeta y las reemplaza por URL.
4. Reporta huérfanos (archivos en migrated/ sin referencia).

Uso:
  python3 organize_photos.py --dry-run   # solo muestra el plan
  python3 organize_photos.py --apply     # ejecuta la migración
"""
import json, os, re, sys, base64, urllib.request, urllib.parse, uuid
from datetime import datetime, timedelta

SUPA_URL = "https://nltfincxdlnunihvwlob.supabase.co"
KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
MX_OFFSET = timedelta(hours=-6)  # México: UTC-6 fijo

HDRS = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}

URL_RE = re.compile(rf'{re.escape(SUPA_URL)}/storage/v1/object/public/([a-z]+)/([^\s"\\]+?\.(?:jpg|jpeg|png|webp))')
DATAURI_RE = re.compile(r'data:image/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)')


def req(method, path, body=None, headers=None, binary=None):
    url = f"{SUPA_URL}{path}"
    h = dict(HDRS)
    if headers:
        h.update(headers)
    data = None
    if binary is not None:
        data = binary
    elif body is not None:
        data = json.dumps(body).encode()
        h.setdefault('Content-Type', 'application/json')
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors='replace')[:300]


def fetch_all(table, select):
    out, offset = [], 0
    while True:
        st, rows = req('GET', f"/rest/v1/{table}?select={urllib.parse.quote(select)}&limit=500&offset={offset}")
        if st != 200 or not rows:
            if isinstance(rows, str):
                print(f"  ERROR fetch {table}: {rows[:150]}")
            return out
        out.extend(rows)
        if len(rows) < 500:
            return out
        offset += 500


def folder_for(plates, created_iso, hora_llegada):
    """{PLACAS}-{DDMMYYYY}-{HHMM} en hora de México."""
    dt = datetime.fromisoformat(created_iso.replace('Z', '+00:00')) + MX_OFFSET
    if hora_llegada and re.match(r'^\d{1,2}:\d{2}', hora_llegada):
        h, m = hora_llegada.split(':')[:2]
        dt = dt.replace(hour=int(h), minute=int(m))
    placas = re.sub(r'[^A-Za-z0-9]', '', (plates or '').upper()) or 'SINPLACAS'
    return f"{placas}-{dt.day:02d}{dt.month:02d}{dt.year}-{dt.hour:02d}{dt.minute:02d}"


def walk_json(obj, path=""):
    """Itera (ruta, valor) de todos los strings del JSON."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk_json(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk_json(v, f"{path}[{i}]")
    elif isinstance(obj, str):
        yield path, obj


def main():
    apply = '--apply' in sys.argv
    dry = '--dry-run' in sys.argv
    if not (apply or dry):
        print(__doc__)
        sys.exit(1)

    print("=" * 60)
    print("MIGRACIÓN DE FOTOS A CARPETAS {PLACAS}-{DDMMYYYY}-{HHMM}")
    print("=" * 60)

    # ---------- 1. Cargar registros ----------
    vrs = fetch_all('vehicle_records', 'id,plates,created_at,entry_data,exit_data')
    insp = fetch_all('inspections', 'id,plates,record_id,created_at,data')
    tics = fetch_all('shipping_tickets', 'id,plates,record_id,created_at,data')
    print(f"Registros: {len(vrs)} caseta | {len(insp)} inspecciones | {len(tics)} tickets")

    # ---------- 2. Carpetas ancla ----------
    vr_folder = {}
    for vr in vrs:
        ed = vr.get('entry_data') or {}
        vr_folder[vr['id']] = folder_for(vr.get('plates'), vr['created_at'], ed.get('hora_llegada'))

    def folder_of(rec, table):
        rid = rec.get('record_id')
        if rid and rid in vr_folder:
            return vr_folder[rid], rid
        return folder_for(rec.get('plates'), rec['created_at'], None), rid

    # ---------- 3. Recolectar trabajo ----------
    moves = {}      # (bucket, old_path) -> {new: new_path, keys: set de registros que lo referencian}
    uploads = []    # (table, rec_id, field, path, mime, folder, bucket, b64)
    patches = {}    # (table, rec_id, field) -> {old_url: new_url}

    for table, rows, fields in [
        ('vehicle_records', vrs, [('entry_data', 'entry_data'), ('exit_data', 'exit_data')]),
        ('inspections', insp, [('data', 'data')]),
        ('shipping_tickets', tics, [('data', 'data')]),
    ]:
        for rec in rows:
            folder, rid = folder_of(rec, table)
            for field, col in fields:
                obj = rec.get(col)
                if not obj:
                    continue
                key = (table, rec['id'], col)
                for p, s in walk_json(obj):
                    for m in URL_RE.finditer(s):
                        bucket, opath = m.group(1), m.group(2)
                        if opath.startswith('migrated/'):
                            newp = f"{folder}/{opath.split('/')[-1]}"
                            entry = moves.setdefault((bucket, opath), {'new': newp, 'keys': set()})
                            entry['keys'].add(key)
                            patches.setdefault(key, {})[s] = f"{SUPA_URL}/storage/v1/object/public/{bucket}/{newp}"
                    for m in DATAURI_RE.finditer(s):
                        mime, b64 = m.group(1), m.group(2)
                        last = p.split('.')[-1].split('[')[0]
                        if 'firma' in last or 'signature' in last:
                            bucket = 'signatures'
                        elif table == 'inspections':
                            bucket = 'inspections'
                        else:
                            bucket = 'evidence'
                        uploads.append((table, rec['id'], col, p, mime, folder, bucket, b64))

    print(f"\nArchivos storage a mover: {len(moves)}")
    print(f"Fotos base64 en BD a subir: {len(uploads)}")
    print(f"Registros a actualizar en BD: {len(patches)}")

    # Muestra del plan
    print("\n--- Muestra de movimientos ---")
    for i, ((b, op), np) in enumerate(list(moves.items())[:6]):
        print(f"  {b}: {op} → {np}")
    print("\n--- Muestra de subidas base64 ---")
    for u in uploads[:6]:
        print(f"  {u[0]}/{u[5]} ← {u[3]} ({u[4]}, {len(u[7])//1024}KB → bucket {u[6]})")

    if dry:
        print("\n[DRY RUN] Sin cambios. Ejecuta con --apply para realizar la migración.")
        return

    # ---------- 4. Ejecutar ----------
    stats = {'copied': 0, 'uploaded': 0, 'patched': 0, 'deleted': 0, 'errors': []}

    # 4a. Copiar archivos storage a carpetas
    print("\n[Copiando archivos storage…]")
    for (bucket, opath), info in moves.items():
        newp = info['new']
        st, resp = req('POST', f"/storage/v1/object/copy/{bucket}",
                       {"source": opath, "destination": newp})
        if st in (200, 201):
            stats['copied'] += 1
        else:
            stats['errors'].append(f"copy {bucket}/{opath}: {st} {resp}")

    # 4b. Subir base64 de la BD
    print("[Subiendo fotos base64 de la BD…]")
    for table, rec_id, col, path, mime, folder, bucket, b64 in uploads:
        ext = 'png' if mime == 'png' else 'jpg'
        fname = f"{path.split('.')[-1].split('[')[0]}_{uuid.uuid4().hex[:8]}.{ext}"
        newp = f"{folder}/{fname}"
        try:
            binary = base64.b64decode(b64)
        except Exception as e:
            stats['errors'].append(f"b64 decode {table}/{rec_id}/{path}: {e}")
            continue
        st, resp = req('POST', f"/storage/v1/object/{bucket}/{urllib.parse.quote(newp)}",
                       binary=binary, headers={'Content-Type': f'image/{mime}'})
        if st in (200, 201):
            stats['uploaded'] += 1
            newurl = f"{SUPA_URL}/storage/v1/object/public/{bucket}/{newp}"
            old_uri = f"data:image/{mime};base64,{b64}"
            patches.setdefault((table, rec_id, col), {})[old_uri] = newurl
        else:
            stats['errors'].append(f"upload {bucket}/{newp}: {st} {resp}")

    # 4c. Actualizar URLs en la BD (string replace en cada campo)
    print("[Actualizando URLs en la BD…]")
    for (table, rec_id, col), mapping in patches.items():
        st, row = req('GET', f"/rest/v1/{table}?id=eq.{rec_id}&select={col}")
        if st != 200 or not row:
            stats['errors'].append(f"fetch {table}/{rec_id}: {st}")
            continue
        obj = row[0].get(col)
        s = json.dumps(obj, ensure_ascii=False)
        for old, new in mapping.items():
            s = s.replace(old, new)
        try:
            newobj = json.loads(s)
        except Exception as e:
            stats['errors'].append(f"json {table}/{rec_id}: {e}")
            continue
        st, resp = req('PATCH', f"/rest/v1/{table}?id=eq.{rec_id}",
                       {col: newobj}, headers={'Prefer': 'return=minimal'})
        if st in (200, 204):
            stats['patched'] += 1
        else:
            stats['errors'].append(f"patch {table}/{rec_id}: {st} {resp}")

    # 4d. Borrar originales en migrated/ SOLO si el patch de su registro funcionó
    print("[Eliminando originales migrados…]")
    patched_keys = set()
    for (table, rec_id, col), mapping in patches.items():
        # solo cuenta si el parche de ese registro NO falló
        if not any(f"patch {table}/{rec_id}" in e for e in stats['errors']):
            patched_keys.add((table, rec_id, col))
    skipped_delete = 0
    for (bucket, opath), info in moves.items():
        # borrar solo si TODOS los registros que referencian este archivo fueron actualizados
        if not info['keys'].issubset(patched_keys):
            skipped_delete += 1
            continue
        st, _ = req('GET', f"/storage/v1/object/info/{bucket}/{urllib.parse.quote(info['new'])}")
        if st == 200:
            st2, resp2 = req('DELETE', f"/storage/v1/object/{bucket}/{urllib.parse.quote(opath)}")
            if st2 in (200, 204):
                stats['deleted'] += 1
    if skipped_delete:
        print(f"  (se conservaron {skipped_delete} originales por registros sin parchear)")

    # ---------- 5. Reporte ----------
    print("\n" + "=" * 60)
    print(f"COPIADOS: {stats['copied']}/{len(moves)}")
    print(f"SUBIDOS (base64→storage): {stats['uploaded']}/{len(uploads)}")
    print(f"REGISTROS ACTUALIZADOS: {stats['patched']}")
    print(f"ORIGINALES ELIMINADOS: {stats['deleted']}")
    print(f"ERRORES: {len(stats['errors'])}")
    for e in stats['errors'][:15]:
        print(f"  ⚠️ {e}")

    # Huérfanos restantes
    for bucket in ['evidence', 'signatures', 'inspections']:
        st, objs = req('POST', f"/storage/v1/object/list/{bucket}",
                       {"prefix": "migrated", "limit": 1000, "offset": 0})
        n = len(objs) if isinstance(objs, list) else 0
        print(f"Huérfanos restantes en {bucket}/migrated: {n}")


if __name__ == '__main__':
    main()
