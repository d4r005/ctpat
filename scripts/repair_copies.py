#!/usr/bin/env python3
"""Repara las copias fallidas: descarga cada archivo de migrated/ y lo resube a su carpeta de visita. Luego borra los originales ya reemplazados."""
import json, os, time, urllib.request, urllib.parse

SUPA = "https://nltfincxdlnunihvwlob.supabase.co"
KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
HDRS = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}

def req(method, path, headers=None, binary=None, body=None):
    h = dict(HDRS)
    if headers: h.update(headers)
    data = binary
    if body is not None and binary is None:
        data = json.dumps(body).encode(); h.setdefault('Content-Type', 'application/json')
    r = urllib.request.Request(f"{SUPA}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read()
            return resp.status, raw
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:150]

with open('/tmp/referenced_paths.json') as f:
    referenced = [tuple(x) for x in json.load(f)]
print(f"Referenciados: {len(referenced)}")

stats = {'repaired': 0, 'already_ok': 0, 'failed': [], 'deleted': 0}

for i, (bucket, path) in enumerate(referenced):
    qpath = urllib.parse.quote(path)
    st, _ = req('GET', f"/storage/v1/object/info/{bucket}/{qpath}")
    if st == 200:
        stats['already_ok'] += 1
        continue
    # descargar original de migrated/
    base = path.split('/')[-1]
    src = f"migrated/{base}"
    st2, content = req('GET', f"/storage/v1/object/{bucket}/{urllib.parse.quote(src)}")
    if st2 != 200:
        stats['failed'].append(f"download {bucket}/{src}: {st2}")
        continue
    # subir a la carpeta de visita
    st3, resp3 = req('POST', f"/storage/v1/object/{bucket}/{qpath}",
                     headers={'Content-Type': 'image/jpeg'}, binary=content)
    if st3 not in (200, 201):
        stats['failed'].append(f"upload {bucket}/{path}: {st3} {resp3}")
        continue
    stats['repaired'] += 1
    # verificar y borrar original
    st4, _ = req('GET', f"/storage/v1/object/info/{bucket}/{qpath}")
    if st4 == 200:
        st5, _ = req('DELETE', f"/storage/v1/object/{bucket}/{urllib.parse.quote(src)}")
        if st5 in (200, 204):
            stats['deleted'] += 1
    if i % 50 == 0:
        print(f"  … {i}/{len(referenced)} procesados")
    time.sleep(0.03)

print(f"\nYa existían: {stats['already_ok']}")
print(f"Reparados (descarga+resubida): {stats['repaired']}")
print(f"Originales borrados: {stats['deleted']}")
print(f"Fallos: {len(stats['failed'])}")
for e in stats['failed'][:10]:
    print(f"  ⚠️ {e}")
