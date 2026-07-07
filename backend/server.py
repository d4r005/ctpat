from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query, File, UploadFile, BackgroundTasks, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response, JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import csv
import io
import re
import uuid
import base64
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt as pyjwt
import aiosmtplib
import requests
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email.mime.image import MIMEImage
from email import encoders
from PIL import Image, ImageDraw, ImageFont, ImageOps

# Configuración de Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("SRIUC-CORE")

ROOT_DIR = Path(__file__).parent

def _load_naf_logo_b64() -> str:
    """Logo NAF (North America Flooring) embebido en base64 para mostrarlo
    en la esquina superior izquierda del reporte consolidado PDF/correo,
    sin depender de una URL externa (igual criterio que fotos/firmas)."""
    try:
        p = ROOT_DIR / "assets" / "naf_logo.png"
        with open(p, "rb") as f:
            return "data:image/png;base64," + base64.b64encode(f.read()).decode()
    except Exception:
        return ""

NAF_LOGO_B64 = _load_naf_logo_b64()
load_dotenv(ROOT_DIR / '.env')

app = FastAPI(); api_router = APIRouter(prefix="/api")

# Configuración de base de datos - RUTA DIRECTA DE EMERGENCIA
mongo_url = os.environ.get('MONGO_URL', 'mongodb+srv://NAF:Branco2025@naf.qu9iczt.mongodb.net/')
client = AsyncIOMotorClient(mongo_url, maxPoolSize=50)
db = client['naf_inspection'] # Forzado a la DB con datos

@app.on_event("startup")
async def startup_db_client():
    logger.info(f"Servidor SRIUC iniciado. Conectado a: {db.name}")

JWT_SECRET = os.environ.get('JWT_SECRET', 'naf-secret')
JWT_ALGORITHM = 'HS256'
security = HTTPBearer()

# ========== Modelos de Datos (ULTRA-FLEXIBLES: Evitan pantallas en blanco) ==========

class BaseConfig(BaseModel):
    class Config:
        extra = "ignore"
        allow_population_by_field_name = True

class UserPublic(BaseConfig):
    id: Optional[str] = ""
    email: Optional[str] = ""
    name: Optional[str] = ""
    role: Optional[str] = "inspector"
    active: bool = True

class TokenResponse(BaseConfig):
    access_token: str
    user: UserPublic

class UserLogin(BaseConfig):
    email: str
    password: str

class UserRegister(BaseConfig):
    email: str
    password: str
    name: str
    role: str = "inspector"

class EscoltaInfo(BaseConfig):
    presente: bool = False
    compania: Optional[str] = ""
    unidad: Optional[str] = ""
    placas: Optional[str] = ""

class VehicleEntry(BaseConfig):
    tipo_unidad: Optional[str] = "sencillo"
    sucursal: Optional[str] = ""
    direccion: Optional[str] = ""
    licencia_conductor: Optional[str] = ""
    placas_unidad: Optional[str] = ""
    chofer_nombre: Optional[str] = ""
    compania_transporte: Optional[str] = ""
    numero_tractor: Optional[str] = ""
    compania_caja: Optional[str] = ""
    numero_caja: Optional[str] = ""
    placas_caja: Optional[str] = ""
    sello_entrada: Optional[str] = ""
    guardia_caseta_nombre: Optional[str] = ""
    condicion_carga: Optional[str] = ""
    descripcion_carga: Optional[str] = ""
    destino: Optional[str] = ""
    fecha_entrada: Optional[str] = None
    # Otros campos como opcionales
    foto_frente_unidad: Optional[str] = ""
    foto_atras_caja: Optional[str] = ""
    foto_id_chofer: Optional[str] = ""
    firma_operador: Optional[str] = ""

class VehicleExit(BaseConfig):
    guardia_salida_nombre: Optional[str] = ""
    condicion_salida: Optional[str] = ""
    sello_salida: Optional[str] = ""
    fecha_salida: Optional[str] = None
    pallets: Optional[str] = ""
    cajas: Optional[str] = ""
    bultos: Optional[str] = ""
    sello_vvtt_estado: Optional[str] = ""
    firma_guardia: Optional[str] = ""

class VehicleRecord(BaseConfig):
    id: str
    user_id: Optional[str] = ""
    status: Optional[str] = "entrada"
    entry: Optional[VehicleEntry] = None
    exit: Optional[VehicleExit] = None
    inspection_id: Optional[str] = None
    inspection_ids: List[str] = []
    shipping_ticket_id: Optional[str] = None
    has_shipping_ticket: bool = False
    created_at: Optional[str] = ""

class InspectionPoint(BaseConfig):
    number: int
    name: Optional[str] = ""
    estado: Optional[str] = ""
    comentarios: Optional[str] = ""
    photo: Optional[str] = ""

class Inspection(BaseConfig):
    id: str
    placas_unidad: Optional[str] = ""
    status_general: Optional[str] = "bueno"
    inspector_nombre: Optional[str] = ""
    created_at: Optional[str] = ""
    points: List[InspectionPoint] = []
    record_id: Optional[str] = None

class ShippingTicketCreate(BaseConfig):
    almacenista: str
    cliente: Optional[str] = ""
    operador: Optional[str] = ""
    linea_transporte: Optional[str] = ""
    numero_economico: Optional[str] = ""
    placas_unidad: Optional[str] = ""
    numero_caja: Optional[str] = ""
    placas_caja: Optional[str] = ""
    numero_pallets: Optional[str] = ""
    numero_sello: Optional[str] = ""
    observaciones: Optional[str] = ""
    hora_llegada: Optional[str] = ""
    hora_apertura_cortina: Optional[str] = ""
    hora_cierre_cortina: Optional[str] = ""
    hora_salida: Optional[str] = ""
    daño_caja: Optional[str] = ""
    area: Optional[str] = ""
    sellos: Optional[str] = ""
    numero_orden_compra: Optional[str] = ""
    foto_inicio_carga: Optional[str] = ""
    foto_media_carga: Optional[str] = ""
    foto_final_carga: Optional[str] = ""
    firma_almacenista: Optional[str] = ""
    firma_guardia: Optional[str] = ""
    nombre_guardia: Optional[str] = ""
    record_id: Optional[str] = None

class ApprovalBody(BaseConfig):
    note: Optional[str] = ""
    name: Optional[str] = ""
    signature: Optional[str] = ""

class SendReportEmailBody(BaseConfig):
    record_id: str
    extra_emails: List[str] = []

# ========== Ayudantes y Utilidades ==========

def ensure_clean_image(b64: str) -> str:
    if not b64 or not b64.startswith("data:image"): return b64
    try:
        header, data = b64.split(",", 1)
        content = base64.b64decode(data)
        img = Image.open(io.BytesIO(content))
        img = ImageOps.exif_transpose(img)
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
    except: return b64

def _process_image_bytes(content: bytes) -> str:
    try:
        img = Image.open(io.BytesIO(content))
        img = ImageOps.exif_transpose(img)

        # Si la imagen es más alta que ancha, es probable que esté rotada
        # (especialmente para trailers y licencias que son horizontales)
        if img.height > img.width:
            # Solo rotar si no tiene EXIF (exif_transpose ya lo habría hecho si tuviera)
            img = img.rotate(-90, expand=True)

        if img.mode in ("RGBA", "P"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "RGBA":
                bg.paste(img, mask=img.split()[3])
            else:
                bg.paste(img)
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        img.thumbnail((1200, 1200))
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=90)
        return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()
    except Exception as e:
        return "data:image/jpeg;base64," + base64.b64encode(content).decode()

def is_signature_broken(b64: str) -> bool:
    """Detecta una firma capturada como un cuadro de color solido (ej. negro),
    causado historicamente por una condicion de carrera al exportar el canvas
    en Android (lee la textura GPU antes de que el cambio de capa hardware ->
    software surta efecto). Una firma real siempre tiene variacion de pixeles
    (el trazo negro sobre fondo blanco); un bloque solido no. Se usa para NO
    aceptar/guardar una firma rota encima de una buena ya existente."""
    if not b64 or not b64.startswith("data:image"):
        return False
    try:
        header, data = b64.split(",", 1)
        img = Image.open(io.BytesIO(base64.b64decode(data))).convert("L")
        img.thumbnail((100, 100))
        extrema = img.getextrema()
        # getextrema() en escala de grises da (min, max) del bloque; si min==max
        # (o casi) es un color plano solido -- no hay ningun trazo dibujado.
        return (extrema[1] - extrema[0]) < 8
    except Exception:
        return False

def add_watermark(b64: str) -> str:
    if not b64 or not b64.startswith("data:image"): return b64
    try:
        header, data = b64.split(",", 1)
        img = Image.open(io.BytesIO(base64.b64decode(data)))
        if img.mode in ("RGBA", "P"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "RGBA":
                bg.paste(img, mask=img.split()[3])
            else:
                bg.paste(img)
            img = bg
        else:
            img = img.convert("RGB")
        draw = ImageDraw.Draw(img)
        txt = f"NAF - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        draw.text((10, 10), txt, fill=(255, 0, 0))
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=60)
        return f"data:image/jpeg;base64,{base64.b64encode(out.getvalue()).decode()}"
    except: return b64

# Mapa de confusiones comunes de OCR/lectura de placas (mismo caracter visualmente
# ambiguo leido distinto en distintos escaneos: Z/2, O/0, I/1, S/5, B/8, G/6).
# Se usa SOLO para vincular/buscar registros existentes -- nunca para lo que se
# guarda o se muestra, que siempre conserva la placa tal como fue capturada.
_PLATE_OCR_CLASSES = {
    'Z': '[Z2]', '2': '[Z2]',
    'O': '[O0]', '0': '[O0]',
    'I': '[I1]', '1': '[I1]',
    'S': '[S5]', '5': '[S5]',
    'B': '[B8]', '8': '[B8]',
    'G': '[G6]', '6': '[G6]',
}
_PLATE_OCR_CANON = {
    'Z': '2', 'O': '0', 'I': '1', 'S': '5', 'B': '8', 'G': '6',
}

def _plate_regex_pattern(plates: str) -> str:
    """Construye un patron regex tolerante a confusiones de OCR para buscar una
    placa en Mongo, permitiendo ademas caracteres intermedios (subcadena)."""
    pl = re.sub(r'[^A-Z0-9]', '', (plates or '').upper())
    parts = [_PLATE_OCR_CLASSES.get(ch, re.escape(ch)) for ch in pl]
    return ".*".join(parts)

def _canon_plate(plates: str) -> str:
    """Normaliza una placa a una forma canonica (colapsando caracteres
    ambiguos de OCR) para agrupar/comparar en memoria, ej. para diccionarios."""
    pl = re.sub(r'[^A-Z0-9]', '', (plates or '').upper())
    return "".join(_PLATE_OCR_CANON.get(ch, ch) for ch in pl)


async def _ensure_record_links(record: Dict[str, Any]) -> Dict[str, Any]:
    if not record: return record
    placas = record.get("entry", {}).get("placas_unidad", "").strip().upper()
    if not placas: return record
    pl_norm = re.sub(r'[^A-Z0-9]', '', placas)
    if not pl_norm: return record

    try:
        regex = _plate_regex_pattern(placas)
        # 1. Vincular Inspecciones
        insps = await db.inspections.find({"placas_unidad": {"$regex": f".*{regex}.*", "$options": "i"}}).to_list(10)
        if insps:
            record["inspection_ids"] = list(set(record.get("inspection_ids", []) + [i["id"] for i in insps]))
            record["inspection_id"] = insps[-1]["id"]
            if record["status"] == "entrada": record["status"] = "inspeccionado"

        # 2. Vincular Ticket
        if not record.get("shipping_ticket_id"):
            tick = await db.shipping_tickets.find_one({"placas_unidad": {"$regex": f".*{regex}.*", "$options": "i"}}, sort=[("created_at", -1)])
            if tick:
                record["shipping_ticket_id"] = tick["id"]
                record["has_shipping_ticket"] = True

        # Actualizar en DB
        await db.vehicle_records.update_one({"id": record["id"]}, {"$set": {
            "inspection_ids": record.get("inspection_ids", []),
            "inspection_id": record.get("inspection_id"),
            "shipping_ticket_id": record.get("shipping_ticket_id"),
            "has_shipping_ticket": record.get("has_shipping_ticket", False),
            "status": record["status"]
        }})
    except: pass
    return record

async def sync_orden_compra(record_id: Optional[str] = None, ticket_id: Optional[str] = None):
    """
    Mantiene 'numero de orden de compra' sincronizado entre el registro de
    caseta (entry.numero_orden_compra) y su ticket de embarque vinculado
    (numero_orden_compra): si un lado lo tiene y el otro no, se autorrellena
    el que falta. Si ambos ya tienen un valor (aunque sean distintos) no se
    toca nada -- se respeta lo capturado manualmente en cada lado.
    """
    try:
        rec = None
        if record_id:
            rec = await db.vehicle_records.find_one({"id": record_id}, {"_id": 0})
        elif ticket_id:
            ticket_probe = await db.shipping_tickets.find_one({"id": ticket_id}, {"_id": 0})
            if ticket_probe and ticket_probe.get("record_id"):
                rec = await db.vehicle_records.find_one({"id": ticket_probe["record_id"]}, {"_id": 0})
            if not rec:
                # Fallback: buscar por el lado del registro, que es el que de
                # forma más confiable queda enlazado (shipping_ticket_id).
                rec = await db.vehicle_records.find_one({"shipping_ticket_id": ticket_id}, {"_id": 0})
        if not rec: return

        tid = ticket_id or rec.get("shipping_ticket_id")
        if not tid: return
        ticket = await db.shipping_tickets.find_one({"id": tid}, {"_id": 0})
        if not ticket: return

        rec_oc = ((rec.get("entry") or {}).get("numero_orden_compra") or "").strip()
        tk_oc = (ticket.get("numero_orden_compra") or "").strip()

        if rec_oc and not tk_oc:
            await db.shipping_tickets.update_one({"id": tid}, {"$set": {"numero_orden_compra": rec_oc}})
        elif tk_oc and not rec_oc:
            await db.vehicle_records.update_one({"id": rec["id"]}, {"$set": {"entry.numero_orden_compra": tk_oc}})
    except Exception as e:
        logger.error(f"sync_orden_compra fallo: {e}")

def is_admin(user: Dict[str, Any]) -> bool:
    admins = ["d.trujillo@brancoindustries.com", "d4r005@gmail.com"]
    return user.get("email") in admins or user.get("role") == "admin"

# --- Helpers de notificaciones (alertas de seguimiento del proceso) ---
def _expo_push_batch(messages: List[Dict[str, Any]]):
    """Envía un lote (máx. 100) de mensajes a la API de push de Expo. Síncrono,
    pensado para correr dentro de run_in_executor. No lanza excepción: un
    fallo de push nunca debe tumbar el flujo de notificaciones en la app."""
    try:
        r = requests.post(
            "https://exp.host/--/api/v2/push/send",
            json=messages,
            headers={"Accept": "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json"},
            timeout=10,
        )
        if r.status_code >= 300:
            logger.warning(f"Expo push: respuesta {r.status_code}: {r.text[:300]}")
        else:
            body = r.json()
            # Expo reporta por-mensaje si un token quedó inválido/desregistrado;
            # lo logueamos para poder limpiar tokens muertos a futuro.
            for item in body.get("data", []):
                if item.get("status") == "error":
                    logger.warning(f"Expo push error: {item.get('message')} ({item.get('details')})")
    except Exception as e:
        logger.error(f"Expo push batch error: {e}")

async def _send_push_to_users(user_ids: List[str], title: str, message: str, **extra):
    """Envía notificación push REAL (Expo Push API) a cada usuario con push_token
    registrado. Esto es lo que permite que suene/vibre incluso con la app en
    segundo plano o cerrada — a diferencia del polling local, que sólo funciona
    con la app abierta en primer plano."""
    if not user_ids:
        return
    try:
        users = await db.users.find(
            {"id": {"$in": list(set(user_ids))}, "push_token": {"$exists": True, "$ne": None}},
            {"_id": 0, "id": 1, "push_token": 1}
        ).to_list(500)
        tokens = [u["push_token"] for u in users if u.get("push_token", "").startswith("ExponentPushToken")]
        if not tokens:
            return
        data_payload = {k: v for k, v in extra.items() if k in ("inspection_id", "record_id", "ticket_id", "chat_room", "kind")}
        messages = [{
            "to": tok,
            "title": title,
            "body": message,
            "data": data_payload,
            "sound": "default",
            "priority": "high",       # crítico para que FCM entregue el mensaje con la app en background/cerrada
            "channelId": "default",
        } for tok in tokens]
        loop = asyncio.get_event_loop()
        for i in range(0, len(messages), 100):
            await loop.run_in_executor(None, _expo_push_batch, messages[i:i + 100])
    except Exception as e:
        logger.error(f"_send_push_to_users error: {e}")

async def _insert_notifications(user_ids: List[str], title: str, message: str, **extra):
    """Inserta una notificación individual por cada user_id (evita auto-notificar duplicados)
    y además dispara un push real vía Expo para que suene/vibre aunque la app
    esté en segundo plano o cerrada."""
    now = datetime.now(timezone.utc).isoformat()
    docs = []
    seen = set()
    for uid in user_ids:
        if not uid or uid in seen:
            continue
        seen.add(uid)
        d = {"id": str(uuid.uuid4()), "user_id": uid, "global": False, "read": False,
             "title": title, "message": message, "created_at": now}
        d.update(extra)
        docs.append(d)
    if docs:
        await db.notifications.insert_many(docs)
        await _send_push_to_users(list(seen), title, message, **extra)

async def notify_roles(roles: List[str], title: str, message: str, exclude_user_id: Optional[str] = None, **extra):
    """Notifica a todos los usuarios activos con alguno de los roles indicados (ej. supervisor/admin)."""
    admins_emails = ["d.trujillo@brancoindustries.com", "d4r005@gmail.com"]
    q = {"$or": [{"role": {"$in": roles}}, {"email": {"$in": admins_emails}}]}
    users = await db.users.find(q, {"_id": 0, "id": 1}).to_list(500)
    ids = [u["id"] for u in users if u["id"] != exclude_user_id]
    await _insert_notifications(ids, title, message, **extra)

async def notify_all_except(exclude_user_id: str, title: str, message: str, **extra):
    """Notifica a todos los usuarios activos excepto al remitente (uso: chat general)."""
    users = await db.users.find({}, {"_id": 0, "id": 1}).to_list(500)
    ids = [u["id"] for u in users if u["id"] != exclude_user_id]
    await _insert_notifications(ids, title, message, **extra)

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    try:
        p = pyjwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        u = await db.users.find_one({"id": p.get("sub")}, {"_id": 0, "password_hash": 0})
        if not u: raise HTTPException(401)
        return u
    except: raise HTTPException(401)

# ========== Endpoints de API ==========

# Fields to exclude in list/activity views to avoid massive payloads (timeouts)
MINIMAL_RECORD_PROJECTION = {
    "entry.foto_frente_unidad": 0,
    "entry.foto_atras_caja": 0,
    "entry.foto_atras_caja_2": 0,
    "entry.foto_id_chofer": 0,
    "entry.firma_operador": 0,
    "exit.sello_vvtt_foto": 0,
    "exit.sello_vvtt_foto_2": 0,
    "exit.firma_guardia": 0,
}

MINIMAL_INSPECTION_PROJECTION = {
    "inspector_firma": 0,
    "guard_signature": 0,
    "approved_by_signature": 0,
    "approved_sig": 0,
    "points.photo": 0,
}

MINIMAL_TICKET_PROJECTION = {
    "foto_inicio_carga": 0,
    "foto_media_carga": 0,
    "foto_final_carga": 0,
    "firma_almacenista": 0,
    "firma_guardia": 0,
}

try:
    import google.generativeai as genai
    HAS_GOOGLE_AI = True
except ImportError:
    HAS_GOOGLE_AI = False
    genai = None

# Configuración AI
GEMINI_KEY = os.environ.get("GEMINI_API_KEY")
if HAS_GOOGLE_AI and GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)
    ai_model = genai.GenerativeModel('gemini-2.5-flash')
else:
    ai_model = None

# ========== Modelos de Datos ==========
class OCRRequest(BaseModel):
    image_b64: str
    context: str # 'entry', 'inspection', 'ticket'
    mime_type: Optional[str] = None # mime real reportado por el picker del frontend (puede venir vacio/incorrecto en algunos navegadores)

# ========== Ayudantes y Utilidades ==========
def _detect_image_mime(img_data: bytes, declared: Optional[str] = None) -> str:
    """Detecta el mime type real a partir de los magic bytes de la imagen.
    Gemini rechaza la petición completa (400 Unable to process input image) si el
    mime_type declarado no coincide con los bytes reales, así que no confiamos
    ciegamente en lo que reporta el picker del frontend (en web a veces viene
    vacío o incorrecto según el navegador/dispositivo)."""
    if img_data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if img_data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if img_data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if img_data[:4] == b"RIFF" and img_data[8:12] == b"WEBP":
        return "image/webp"
    if img_data[4:12] in (b"ftypheic", b"ftypheix", b"ftyphevc", b"ftypmif1"):
        return "image/heic"
    if declared and declared.startswith("image/"):
        return declared
    return "image/jpeg"

async def analyze_document_ai(image_b64: str, context: str, mime_type: Optional[str] = None) -> Dict[str, Any]:
    if not ai_model:
        return {"error": "AI_NOT_CONFIGURED"}

    # Extraer pura data de la imagen
    if "," in image_b64:
        image_b64 = image_b64.split(",")[1]

    try:
        img_data = base64.b64decode(image_b64)
    except Exception as e:
        logger.error(f"Error en AI OCR: base64 inválido - {e}")
        return {"error": "INVALID_IMAGE_DATA"}

    if not img_data:
        return {"error": "EMPTY_IMAGE"}

    real_mime = _detect_image_mime(img_data, mime_type)
    if real_mime == "image/heic":
        logger.error("Error en AI OCR: formato HEIC no soportado por Gemini")
        return {"error": "UNSUPPORTED_FORMAT_HEIC"}

    prompts = {
        "entry": "Extract data from this vehicle entry log. Return JSON: {placas_unidad, chofer_nombre, compania_transporte, numero_tractor, numero_caja, sello_entrada, destino}",
        "inspection": "Extract data from this C-TPAT inspection sheet. Return JSON: {placas_unidad, status_general (bueno/malo), points (list of {number, name, estado (bueno/malo), comentarios}), measures: {alto, ancho, largo, capacidad} — ONLY include this key if the document shows container/unit measurements (height, width, length, capacity in m3); if not present on the document, omit the measures key entirely}",
        "ticket": "Extract data from this shipping ticket. Return JSON: {placas_unidad, cliente, operador, numero_caja, numero_pallets, numero_sello}"
    }

    prompt = prompts.get(context, "Extract all readable fields into JSON.")

    try:
        response = ai_model.generate_content([
            prompt,
            {"mime_type": real_mime, "data": img_data}
        ])

        # Extraer el JSON del texto de respuesta (Gemini suele ponerlo entre ```json ... ```)
        text = response.text
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            import json
            return json.loads(json_match.group())
        return {"error": "JSON_NOT_FOUND", "raw": text}
    except Exception as e:
        logger.error(f"Error en AI OCR (mime={real_mime}, declared={mime_type}, bytes={len(img_data)}): {e}")
        return {"error": str(e)}

@api_router.post("/ocr/analyze")
async def ocr_analyze(body: OCRRequest, u: Dict[str, Any] = Depends(get_current_user)):
    """Analiza una foto de un documento físico y devuelve los campos rellenos"""
    data = await analyze_document_ai(body.image_b64, body.context, body.mime_type)
    return data

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(body: UserLogin):
    try:
        u = await db.users.find_one({"email": body.email.lower()})
        if not u:
            raise HTTPException(401, "Usuario no encontrado")
        if not u.get("active", True):
            raise HTTPException(403, "Usuario desactivado. Contacta a un administrador.")
        ph = u["password_hash"]
        ph_bytes = ph.encode("utf-8") if isinstance(ph, str) else bytes(ph)
        if not bcrypt.checkpw(body.password.encode("utf-8"), ph_bytes):
            raise HTTPException(401, "Contraseña incorrecta")
        token = pyjwt.encode({"sub": u["id"], "exp": datetime.now(timezone.utc) + timedelta(days=30)}, JWT_SECRET)
        return TokenResponse(access_token=token, user=UserPublic(**u))
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(500, f"Error interno: {str(e)} | {traceback.format_exc()[-300:]}")

@api_router.get("/auth/me", response_model=UserPublic)
async def me(u: Dict[str, Any] = Depends(get_current_user)): return UserPublic(**u)

# --- Caseta ---
@api_router.get("/vehicle-records", response_model=List[VehicleRecord])
async def list_records(u: Dict[str, Any] = Depends(get_current_user), status: Optional[str] = None):
    # Filtro opcional por status (entrada, inspeccionado, salida)
    filt: Dict[str, Any] = {}
    if status:
        filt["status"] = status
    # Proyectar fuera las fotos base64 para evitar payloads gigantes y timeouts en la lista
    docs = await db.vehicle_records.find(filt, MINIMAL_RECORD_PROJECTION).sort("created_at", -1).to_list(2000)

    # Enriquecer con vínculos (inspection_ids, shipping_ticket_id) en batch
    # para que el ProcessTracker del frontend sea preciso sin llamadas adicionales
    all_insps = await db.inspections.find({}, {"_id": 0, "id": 1, "placas_unidad": 1, "record_id": 1}).to_list(5000)
    all_tickets = await db.shipping_tickets.find({}, {"_id": 0, "id": 1, "placas_unidad": 1, "record_id": 1}).to_list(5000)

    # Índice por placas normalizadas
    def norm(s): return _canon_plate(s)

    insp_by_plates: Dict[str, List[str]] = {}
    insp_by_record: Dict[str, List[str]] = {}
    for insp in all_insps:
        p = norm(insp.get("placas_unidad", ""))
        if p:
            insp_by_plates.setdefault(p, [])
            if insp["id"] not in insp_by_plates[p]:
                insp_by_plates[p].append(insp["id"])
        rid = insp.get("record_id")
        if rid:
            insp_by_record.setdefault(rid, [])
            if insp["id"] not in insp_by_record[rid]:
                insp_by_record[rid].append(insp["id"])

    ticket_by_plates: Dict[str, str] = {}
    ticket_by_record: Dict[str, str] = {}
    for tk in all_tickets:
        p = norm(tk.get("placas_unidad", ""))
        if p: ticket_by_plates[p] = tk["id"]
        rid = tk.get("record_id")
        if rid: ticket_by_record[rid] = tk["id"]

    enriched = []
    for doc in docs:
        p = norm(doc.get("entry", {}).get("placas_unidad", ""))
        rid = doc.get("id", "")

        # Merge inspection_ids: los que ya estaban + los de record_id + los de placas
        existing = set(doc.get("inspection_ids", []))
        if doc.get("inspection_id"): existing.add(doc["inspection_id"])
        by_rec = set(insp_by_record.get(rid, []))
        by_plates = set(insp_by_plates.get(p, []))
        merged_ids = list(existing | by_rec | by_plates)

        doc["inspection_ids"] = merged_ids
        if merged_ids:
            doc["inspection_id"] = merged_ids[-1]
            if doc["status"] == "entrada":
                doc["status"] = "inspeccionado"

        # Ticket
        ticket_id = doc.get("shipping_ticket_id") or ticket_by_record.get(rid) or ticket_by_plates.get(p)
        if ticket_id:
            doc["shipping_ticket_id"] = ticket_id
            doc["has_shipping_ticket"] = True

        enriched.append(VehicleRecord(**doc))

    return enriched

@api_router.post("/vehicle-records", response_model=VehicleRecord)
async def create_record(body: VehicleEntry, background_tasks: BackgroundTasks, u: Dict[str, Any] = Depends(get_current_user)):
    rid = str(uuid.uuid4())
    doc = body.dict()
    full_doc = {
        "id": rid, "user_id": u["id"], "status": "entrada", "entry": doc,
        "exit": None, "inspection_id": None, "inspection_ids": [],
        "shipping_ticket_id": None, "has_shipping_ticket": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    for f in ["foto_frente_unidad", "foto_atras_caja", "foto_atras_caja_2", "foto_id_chofer", "firma_operador"]:
        if full_doc["entry"].get(f): full_doc["entry"][f] = ensure_clean_image(full_doc["entry"][f])
    await db.vehicle_records.insert_one(full_doc)

    # Auto-vincular inspecciones/tickets previos antes de sincronizar al sheet
    # Esto evita que se "pierda" la información al registrar una unidad virtual
    full_doc = await _ensure_record_links(full_doc)

    # Sincronizar automáticamente al sheet
    background_tasks.add_task(sync_to_google_sheets, "entrada", full_doc)
    # Alerta de seguimiento: nuevo ingreso en caseta
    placas = doc.get("placas_unidad", "S/P")
    background_tasks.add_task(
        notify_roles, ["supervisor", "admin"],
        f"🚪 Nuevo ingreso en caseta: {placas}",
        f"{u['name']} registró el ingreso de la unidad {placas} en caseta.",
        exclude_user_id=u["id"], record_id=rid, kind="caseta"
    )
    return VehicleRecord(**full_doc)

@api_router.get("/vehicle-records/{rec_id}", response_model=VehicleRecord)
async def get_record(rec_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    d = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
    if not d: raise HTTPException(404, "Registro no encontrado")
    return VehicleRecord(**(await _ensure_record_links(d)))

@api_router.put("/vehicle-records/{rec_id}")
async def update_record(rec_id: str, body: Dict[str, Any], background_tasks: BackgroundTasks, u: Dict[str, Any] = Depends(get_current_user)):
    """
    Actualiza un registro de forma parcial. IMPORTANTE: "entry" y "exit" se
    FUSIONAN (merge) con lo ya existente en vez de reemplazar el objeto
    completo — antes un $set directo con {"entry": {...parcial...}} borraba
    todos los campos de "entry" que no vinieran en el body (p.ej. editar solo
    "destino" borraba placas, chofer, fotos, etc.). Esto es crítico para poder
    editar/completar datos faltantes en registros históricos sin destruir el resto.
    """
    for k in ["_id", "id", "user_id", "created_at"]:
        if k in body: del body[k]

    existing = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Registro no encontrado")

    # Limpiar fotos base64 nuevas antes de fusionar. Si una firma llega rota
    # (cuadro solido, ver is_signature_broken) y ya existia una buena, se
    # descarta la nueva y se conserva la anterior en vez de pisarla.
    if "entry" in body and body["entry"]:
        existing_entry = existing.get("entry", {}) or {}
        for f in ["foto_frente_unidad", "foto_atras_caja", "foto_atras_caja_2", "foto_id_chofer", "firma_operador"]:
            v = body["entry"].get(f)
            if v and str(v).startswith("data:image"):
                if f == "firma_operador" and is_signature_broken(v) and existing_entry.get(f):
                    logger.warning(f"Firma rota detectada en entry {rec_id}: se conserva la version anterior")
                    body["entry"][f] = existing_entry[f]
                else:
                    body["entry"][f] = ensure_clean_image(v)
        merged_entry = {**existing_entry, **body["entry"]}
        body["entry"] = merged_entry

    if "exit" in body and body["exit"]:
        existing_exit = existing.get("exit") or {}
        for f in ["sello_vvtt_foto", "sello_vvtt_foto_2", "firma_guardia"]:
            v = body["exit"].get(f)
            if v and str(v).startswith("data:image"):
                if f == "firma_guardia" and is_signature_broken(v) and existing_exit.get(f):
                    logger.warning(f"Firma rota detectada en exit {rec_id}: se conserva la version anterior")
                    body["exit"][f] = existing_exit[f]
                else:
                    body["exit"][f] = ensure_clean_image(v)
        merged_exit = {**existing_exit, **body["exit"]}
        body["exit"] = merged_exit

    await db.vehicle_records.update_one({"id": rec_id}, {"$set": body})
    background_tasks.add_task(sync_orden_compra, rec_id, None)
    return {"ok": True}

@api_router.delete("/vehicle-records/{rec_id}")
async def delete_record(rec_id: str, background_tasks: BackgroundTasks, u: Dict[str, Any] = Depends(get_current_user)):
    """
    Elimina el PROCESO COMPLETO de la unidad: registro de caseta + TODAS sus
    inspecciones vinculadas + su ticket de embarque (si existe). Antes solo se
    borraba el vehicle_record, dejando huérfanas las inspecciones/tickets en
    Mongo -- eso hacía que "Auditoría" (POST /admin/repair-links), que
    reconstruye registros faltantes a partir de inspecciones/tickets
    existentes, "resucitara" el registro recién borrado en la siguiente
    ejecución. Ahora se borra todo en cascada para que no quede nada que
    pueda reconstruirlo.
    """
    if not is_admin(u): raise HTTPException(403)
    rec = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Registro no encontrado")
    placas = rec.get("entry", {}).get("placas_unidad", "")

    # Reunir TODAS las inspecciones vinculadas (por id y, por si acaso, por placa)
    insp_ids = set(rec.get("inspection_ids") or [])
    if rec.get("inspection_id"):
        insp_ids.add(rec["inspection_id"])
    norm_plate = _canon_plate(placas)
    linked_insps = await db.inspections.find({"id": {"$in": list(insp_ids)}}, {"_id": 0}).to_list(50) if insp_ids else []
    if norm_plate:
        extra_insps = await db.inspections.find({}, {"_id": 0}).to_list(5000)
        for i in extra_insps:
            if _canon_plate(i.get("placas_unidad", "")) == norm_plate and i["id"] not in insp_ids:
                insp_ids.add(i["id"])
                linked_insps.append(i)

    ticket_id = rec.get("shipping_ticket_id")
    ticket = await db.shipping_tickets.find_one({"id": ticket_id}, {"_id": 0}) if ticket_id else None
    if not ticket and norm_plate:
        all_tickets = await db.shipping_tickets.find({}, {"_id": 0}).to_list(5000)
        ticket = next((tk for tk in all_tickets if _canon_plate(tk.get("placas_unidad", "")) == norm_plate), None)

    await db.vehicle_records.delete_one({"id": rec_id})
    if insp_ids:
        await db.inspections.delete_many({"id": {"$in": list(insp_ids)}})
    if ticket:
        await db.shipping_tickets.delete_one({"id": ticket["id"]})

    # Cascada: quitar de Google Sheets (entrada/salida, inspecciones y ticket) y de Drive
    background_tasks.add_task(_sheet_delete_rows_by_ids, "Entradas_Salidas", [f"{rec_id}:entrada", f"{rec_id}:salida"])
    if insp_ids:
        background_tasks.add_task(_sheet_delete_rows_by_ids, "Inspecciones_19_Puntos", list(insp_ids))
        background_tasks.add_task(_sheet_delete_rows_by_ids, "Inspecciones_9_Puntos", list(insp_ids))
    if ticket:
        background_tasks.add_task(_sheet_delete_rows_by_ids, "Tickets_Embarque", [ticket["id"]])
    background_tasks.add_task(cleanup_drive_evidence, placas, rec, *linked_insps, ticket)

    background_tasks.add_task(
        notify_roles, ["supervisor", "admin"],
        f"🗑️ Registro de caseta eliminado: {placas or 'S/P'}",
        f"{u['name']} eliminó el proceso completo (caseta, {len(insp_ids)} inspección(es), ticket) de la unidad {placas or 'S/P'} (Mongo, Sheet y evidencia de Drive).",
        exclude_user_id=u["id"], kind="caseta"
    )
    return {"ok": True}

@api_router.delete("/vehicle-records/{rec_id}/exit")
async def delete_exit(rec_id: str, background_tasks: BackgroundTasks, u: Dict[str, Any] = Depends(get_current_user)):
    """
    Elimina SOLO la parte de SALIDA de un registro de caseta, dejando intactos
    la entrada, la(s) inspección(es) y el ticket de embarque. Antes sólo se
    podía borrar el proceso completo (entrada+salida juntos), así que no había
    forma de "deshacer" una salida capturada por error sin perder todo lo demás.
    """
    if not is_admin(u): raise HTTPException(403)
    rec = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Registro no encontrado")
    if not rec.get("exit"):
        raise HTTPException(400, "Este registro no tiene una salida capturada")

    placas = rec.get("entry", {}).get("placas_unidad", "")
    old_exit = rec.get("exit") or {}

    # Revertir status: si ya tiene inspección(es) vinculada(s), vuelve a
    # "inspeccionado"; si no, vuelve a "entrada".
    has_inspection = bool(rec.get("inspection_id") or rec.get("inspection_ids"))
    new_status = "inspeccionado" if has_inspection else "entrada"

    await db.vehicle_records.update_one(
        {"id": rec_id},
        {"$unset": {"exit": ""}, "$set": {"status": new_status}}
    )

    # Cascada: quitar sólo la fila de SALIDA del sheet (la de ENTRADA se conserva)
    background_tasks.add_task(_sheet_delete_rows_by_ids, "Entradas_Salidas", [f"{rec_id}:salida"])
    # Limpieza best-effort de las fotos/firma propias de la salida (sello VVTT,
    # firma del guardia) — sin tocar la carpeta completa de evidencia de la placa.
    background_tasks.add_task(cleanup_drive_evidence, "", old_exit)

    background_tasks.add_task(
        notify_roles, ["supervisor", "admin"],
        f"🗑️ Salida eliminada: {placas or 'S/P'}",
        f"{u['name']} eliminó la salida registrada de la unidad {placas or 'S/P'}. El registro vuelve a estado '{new_status}'.",
        exclude_user_id=u["id"], record_id=rec_id, kind="salida_eliminada"
    )
    return {"ok": True, "status": new_status}



# ========== Email: Reporte Consolidado ==========

async def _collect_report_data(record_id: str):
    """Recolecta caseta + inspecciones + ticket para un record_id."""
    rec = await db.vehicle_records.find_one({"id": record_id}, {"_id": 0})
    if not rec:
        return None, None, None, None
    placas = rec.get("entry", {}).get("placas_unidad", "")
    insp_ids = list(set(rec.get("inspection_ids", [])))
    if rec.get("inspection_id") and rec["inspection_id"] not in insp_ids:
        insp_ids.append(rec["inspection_id"])
    inspections = []
    for iid in insp_ids:
        insp = await db.inspections.find_one({"id": iid}, {"_id": 0})
        if insp: inspections.append(insp)
    if not inspections and placas:
        pat = _plate_regex_pattern(placas)
        if pat:
            inspections = await db.inspections.find(
                {"placas_unidad": {"$regex": f".*{pat}.*", "$options": "i"}},
                {"_id": 0}).sort("created_at", -1).to_list(10)
    ticket = None
    if rec.get("shipping_ticket_id"):
        ticket = await db.shipping_tickets.find_one({"id": rec["shipping_ticket_id"]}, {"_id": 0})
    if not ticket and placas:
        pat = _plate_regex_pattern(placas)
        if pat:
            ticket = await db.shipping_tickets.find_one(
                {"placas_unidad": {"$regex": f".*{pat}.*", "$options": "i"}},
                sort=[("created_at", -1)])
            if ticket and "_id" in ticket: del ticket["_id"]
    return rec, inspections, ticket, placas


_POINTS_19 = [
    (1,"Defensa","保险杠"),(2,"Motor","发动机"),(3,"Neumáticos","轮胎"),
    (4,"Piso exterior e Interior de tractor","牵引车内外地板"),
    (5,"Tanque de combustible","油箱"),(6,"Cabina","驾驶室"),
    (7,"Tanque de aire","储气罐"),(8,"Ejes","车轴"),(9,"Quinta rueda","第五轮"),
    (10,"Por debajo de unidad","单位底部"),
    (11,"Exterior e interior de puertas (bisagras, uniones)","车门内外（合页、连接处）"),
    (12,"Piso interior","内地板"),(13,"Paredes laterales","侧壁"),
    (14,"Pared frontal","前壁"),(15,"Techo interior","内顶棚"),
    (16,"Unidad de refrigeración","制冷装置"),(17,"Escape","排气管"),
    (18,"Inspección Sellos VVTT","VVTT 封条检查"),
    (19,"Inspección agrícola","农业检查"),
]
_POINTS_9 = [
    (1,"Pared frontal","前壁"),(2,"Lateral izquierdo","左侧壁"),
    (3,"Lateral derecho","右侧壁"),(4,"Piso (Suelo)","地板"),
    (5,"Techo","顶棚"),(6,"Puertas (Interior/Exterior)","车门（内外）"),
    (7,"Fuera tren de rodaje / Chasis","底盘/车架"),
    (8,"Inspección Sellos VVTT","VVTT 封条检查"),
    (9,"Inspección agrícola","农业检查"),
]
_POINT_MAP_ALL = {n: (es, zh) for n, es, zh in _POINTS_19 + _POINTS_9}


def _sd(d) -> str:
    """Formatea fecha a DD/MM/YYYY HH:MM ajustando de UTC a CST (México -6h)."""
    if not d: return "-"
    try:
        if isinstance(d, datetime):
            dt_obj = d
        else:
            s = str(d)
            if "T" in s:
                dt_obj = datetime.fromisoformat(s.replace("Z", "+00:00"))
            elif "/" in s and ":" in s:
                # Si el usuario dice que 17:10 está mal, es que es UTC.
                try:
                    dt_obj = datetime.strptime(s, "%d/%m/%Y %H:%M").replace(tzinfo=timezone.utc)
                except:
                    return s
            else:
                return s

        # Asegurar que sea consciente de la zona horaria (asumir UTC si es naive)
        if dt_obj.tzinfo is None:
            dt_obj = dt_obj.replace(tzinfo=timezone.utc)

        # Convertir a CST (UTC-6)
        cst_tz = timezone(timedelta(hours=-6))
        cst_dt = dt_obj.astimezone(cst_tz)
        return cst_dt.strftime("%d/%m/%Y %H:%M")
    except Exception:
        return str(d)


def _resolve_src_to_b64(src: str) -> str:
    """Convierte cualquier src de imagen a data URI base64 para embeber en correo HTML."""
    if not src:
        return ""
    if src.startswith("data:image"):
        # Auto-corregir orientación y dimensiones si ya es base64
        return ensure_clean_image(src)
    if not src.startswith("http"):
        return ""
    try:
        if "drive.google.com" in src or "googleusercontent.com" in src:
            m = re.search(r"id=([a-zA-Z0-9_-]+)", src) or re.search(r"file/d/([a-zA-Z0-9_-]+)", src)
            if m:
                token = os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN", "")
                if token:
                    dl_url = "https://www.googleapis.com/drive/v3/files/" + m.group(1) + "?alt=media"
                    r = requests.get(dl_url, headers={"Authorization": "Bearer " + token}, timeout=15)
                    if r.status_code == 200:
                        return _process_image_bytes(r.content)
        r = requests.get(src, timeout=15)
        if r.status_code == 200:
            return _process_image_bytes(r.content)
    except Exception as exc:
        logger.warning("_resolve_src_to_b64 error (%s): %s", src[:60], exc)
    return ""


def _img_tag(src_val: str, style: str = "max-height:56px;max-width:150px;object-fit:contain;") -> str:
    """Convierte cualquier src a base64 inline para correos HTML."""
    resolved = _resolve_src_to_b64(src_val)
    if resolved:
        return '<img src="' + resolved + '" style="' + style + '" />'
    return '<div style="width:120px;height:55px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:7px;border:1px dashed #ccc;">Sin firma</div>'



def _inline_sig(src_val: str, label: str, name: str = "") -> str:
    name_html = ('<p style="margin:1px 0 0 0;font-size:7px;color:#555;">' + name + "</p>") if name else ""
    return (
        '<div style="text-align:center;padding:6px 10px;min-width:130px;display:inline-block;">'
        '<div style="height:60px;display:flex;align-items:flex-end;justify-content:center;'
        'background:#FFF;border-bottom:2px solid #0A2540;margin-bottom:3px;min-width:120px;">'
        + _img_tag(src_val) +
        '</div>'
        '<p style="margin:0;font-weight:bold;font-size:7.5px;color:#0A2540;text-transform:uppercase;">' + label + "</p>"
        + name_html +
        "</div>"
    )


def _photo_block(url: str, label: str) -> str:
    if not url:
        return ""
    resolved = _resolve_src_to_b64(url)
    if not resolved:
        return ""
    # Aumentamos el ancho al 48% para que se vean mucho más grandes y legibles
    return (
        '<div style="display:inline-block;width:48%;margin:0.8%;vertical-align:top;'
        'border:1px solid #ddd;padding:8px;background:#FFF;text-align:center;box-sizing:border-box;border-radius:4px;">'
        '<p style="margin:0 0 6px 0;font-size:9px;font-weight:bold;color:#333;text-transform:uppercase;background:#f8f9fa;padding:3px;">' + label + "</p>"
        '<div style="width:100%;background:#fafafa;border:1px solid #eee;overflow:hidden;line-height:0;">'
        '<img src="' + resolved + '" style="width:100%;height:auto;display:block;" />'
        '</div>'
        "</div>"
    )



def _build_full_report_html(rec: dict, inspections: list, ticket, placas: str) -> str:
    entry   = rec.get("entry", {}) or {}
    ex      = rec.get("exit",  {}) or {}
    is_full = entry.get("tipo_unidad", "").lower() == "full"
    is_carga = ticket is not None

    css = (
        "body{font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#1a1a1a;margin:0;padding:16px;background:#f4f4f4;}"
        ".pw{max-width:780px;margin:0 auto;background:#FFF;padding:20px;border:1px solid #ddd;}"
        ".hb{background:#0A2540;color:#FFF;text-align:center;padding:16px;margin-bottom:20px;position:relative;}"
        ".hb h1{margin:0;font-size:18px;letter-spacing:2px;}"
        ".hb p{margin:4px 0 0;font-size:9px;opacity:.85;}"
        ".hb-logo{position:absolute;top:12px;left:16px;height:36px;background:#FFF;padding:4px 6px;border-radius:3px;}"
        ".st{background:#0A2540;color:#FFF;padding:8px 12px;font-size:11px;"
        "font-weight:900;letter-spacing:1px;margin:20px 0 8px;text-transform:uppercase;}"
        "table{width:100%;border-collapse:collapse;}"
        "td,th{padding:5px 8px;border:1px solid #ddd;font-size:9px;}"
        "th{background:#e8f0fe;font-weight:bold;color:#0A2540;text-align:left;}"
        ".g{color:#16a34a;font-weight:bold;} .b{color:#dc2626;font-weight:bold;}"
        ".chip{display:inline-block;padding:2px 8px;font-weight:bold;font-size:8px;border-radius:3px;color:#FFF;}"
        ".sr{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}"
        ".rb{background:#FFF8E1;border:1px solid #F59E0B;padding:10px;margin-bottom:12px;font-size:8px;}"
        ".db{background:#E8F5E9;border:1px solid #4CAF50;padding:10px;margin-bottom:8px;font-size:8px;}"
        ".ft{margin-top:30px;border-top:1px solid #eee;padding-top:10px;text-align:center;color:#aaa;font-size:8px;}"
    )

    reglas = [
        "1. No romper el sello hasta que la cortina asignada esté abierta y el almacenista responsable esté presente. / 1. 在指定的卸货门打开且负责的仓库人员到场之前，请勿破坏封条。",
        "2. No pasar materiales/equipos ajenos a NAF por la cortina. / 2. 请勿通过卸货门运送不属于 NAF 的材料/设备。",
        "3. Prohibido brincar rampas y entrar al almacén sin autorización. / 3. 禁止未经授权跳过坡道或进入仓库。",
        "4. Prohibidos drogas, armas, agentes biológicos, aerosoles, cámaras de video/foto, pornografía y bebidas alcohólicas. / 4. 禁止携带毒品、武器、生物制剂、气雾剂、摄相机、色情制品和酒精饮料。",
        "5. Prohibido dar propinas, premios o incentivos al personal de seguridad/almacén NAF. / 5. 禁止向 NAF 安保或仓库人员提供小费、奖品或奖励。",
        "6. No menores de edad ni personal ajeno a NAF en el patio de maniobras. / 6. 禁止未成年人或非 NAF 人员进入操作场区。",
        "7. Prohibido tirar basura en el patio de maniobras. / 7. 禁止在操作场区乱扔垃圾。",
        "8. Velocidad máxima 10 km/h. / 8. 最高时速 10 公里/小时。",
    ]
    declaraciones = [
        "1. Declaro NO transportar drogas, agentes biológicos, bioterrorismo, municiones, armas, contrabando ni personas indocumentadas. / 1. 我声明不运输毒品、生物制剂、生物恐怖主义物品、弹药、武器、走私品或无证人员。",
        "2. Declaro estar en condición física adecuada y buen estado de salud. / 2. 我声明身体状况良好，健康状态佳。",
        "3. Declaro NO haber consumido alcohol o drogas recientemente y NO estar bajo su influencia. / 3. 我声明最近没有饮酒或吸毒，且不受其影响。",
        "4. Declaro que al estar en instalaciones NAF he leído, entendido y aceptado plenamente estas instrucciones. / 4. 我声明在 NAF 设施内已阅读、理解并完全接受这些指令。",
    ]
    rules_html = "".join('<div style="margin-bottom:3px;">' + r + "</div>" for r in reglas)
    decls_html = "".join('<div style="margin-bottom:3px;">' + d + "</div>" for d in declaraciones)

    # ── Sección 1: Caseta ────────────────────────────────────────────────────
    def tr(label, val):
        return '<tr><td style="background:#f9fafb;width:38%;"><b>' + label + "</b></td><td>" + str(val or "-") + "</td></tr>"

    def th2(label):
        return '<tr><th colspan="2" style="background:#e8f0fe;">' + label + "</th></tr>"

    caseta_rows = (
        tr("Placas / 车牌号", entry.get("placas_unidad"))
        + tr("Chofer / 司机姓名", entry.get("chofer_nombre"))
        + tr("Licencia / 驾驶证", entry.get("licencia_conductor") or entry.get("numero_licencia"))
        + tr("Compañía / 运输公司", entry.get("compania_transporte"))
        + tr("Tractor / 牵引车", entry.get("numero_tractor"))
        + th2("CAJA / 货箱")
        + tr("Empresa Caja / 货箱公司", entry.get("compania_caja"))
        + tr("Caja / 货箱", entry.get("numero_caja"))
        + tr("Placas Caja / 货箱车牌", entry.get("placas_caja"))
        + tr("Sello Entrada / 进场封条", entry.get("sello_entrada"))
    )
    if is_full:
        caseta_rows += (
            th2("CAJA / 货箱 2")
            + tr("Empresa Caja 2", entry.get("compania_caja_2"))
            + tr("Caja 2 / 货箱 2", entry.get("numero_caja_2"))
            + tr("Sello Entrada 2", entry.get("sello_entrada_2"))
        )
    caseta_rows += (
        tr("Guardia Caseta / 门卫", entry.get("guardia_caseta_nombre"))
        + tr("Condición Carga / 货物状态", entry.get("condicion_carga"))
        + tr("Fecha Entrada / 进场时间", _sd(entry.get("fecha_entrada") or rec.get("created_at")))
    )
    fotos_salida = ""
    if ex:
        # NOTA: Destino / Tractor Salida / Caja Salida se eliminaron de este
        # bloque -- son redundantes con los datos ya mostrados en CASETA
        # (entrada) y en la práctica casi nunca se llenaban en el registro de
        # salida, apareciendo siempre vacíos ("-") en el reporte.
        caseta_rows += (
            th2("DATOS DE SALIDA / 出场数据")
            + tr("Fecha Salida / 出场时间", _sd(ex.get("fecha_salida")))
            + tr("Condición Salida", ex.get("condicion_salida"))
            + tr("Sello Salida 1", ex.get("sello_salida"))
        )
        # Placas de unidad/caja en salida: sólo se muestran si el guardia las
        # llenó explícitamente porque son DISTINTAS a las de entrada (caso de
        # cambio de tractor/caja en patio). Si quedaron vacías se asume que
        # es la misma unidad/caja que entró y no se repite el dato.
        if ex.get("placas_unidad_salida"):
            caseta_rows += tr("Placas Unidad Salida", ex.get("placas_unidad_salida"))
        if ex.get("placas_caja_salida"):
            caseta_rows += tr("Placas Caja Salida", ex.get("placas_caja_salida"))
        if is_full:
            caseta_rows += (
                tr("Caja Salida 2", ex.get("numero_caja_salida_2"))
                + tr("Sello Salida 2", ex.get("sello_salida_2"))
            )
        # Cortina / Pallets / Sello VVTT: estos datos en la práctica los captura
        # el almacenista al llenar el TICKET DE EMBARQUE (no el guardia de
        # salida en caseta), así que se toman de ahí primero y sólo se cae a
        # los campos de 'exit' si el ticket no los tiene.
        tk = ticket or {}
        apertura = tk.get("hora_apertura_cortina") or ex.get("hora_apertura_cortina") or "-"
        cierre = tk.get("hora_cierre_cortina") or ex.get("hora_cierre_cortina") or "-"
        pallets = tk.get("numero_pallets") or ex.get("pallets") or "-"
        sello_vvtt = tk.get("numero_sello") or ex.get("sello_vvtt_estado") or "-"
        # Una descarga siempre sale SIN el sello VVTT intacto (se rompe para
        # poder abrir la caja) -- en ese caso el reporte debe hablar de "Sello
        # Roto", no "Sello VVTT Estado" (que da a entender que sigue intacto).
        es_descarga = (entry.get("condicion_carga") or "").strip().lower() == "descarga"
        label_sello_estado = "Sello Roto" if es_descarga else "Sello VVTT Estado"
        label_sello_foto = "Sello Roto Salida / 断封条出场" if es_descarga else "Sello VVTT Salida / VVTT 封条出场"
        caseta_rows += (
            tr("Cortina (apertura/cierre)", apertura + " / " + cierre)
            + tr("Pallets / Cajas / Bultos", pallets + " / " + (ex.get("cajas") or "-") + " / " + (ex.get("bultos") or "-"))
            + tr(label_sello_estado, sello_vvtt + (("  |  Sello VVTT 2: " + ex.get("sello_vvtt_estado_2")) if is_full and ex.get("sello_vvtt_estado_2") else ""))
            + tr("Guardia Salida / 门卫", ex.get("guardia_salida_nombre"))
        )
        fotos_salida = (
            _photo_block(ex.get("sello_vvtt_foto"), label_sello_foto)
            + (_photo_block(ex.get("sello_vvtt_foto_2"), "Sello VVTT Salida 2") if is_full else "")
        )

    fotos_caseta = (
        _photo_block(entry.get("foto_frente_unidad"), "Frente / 前方")
        + _photo_block(entry.get("foto_atras_caja"), "Atrás / 后方")
        + _photo_block(entry.get("foto_id_chofer"), "ID Chofer / 司机证件")
        + _photo_block(entry.get("foto_sello_vvtt") or entry.get("foto_sello"), "Sello / 封条")
        + _photo_block(entry.get("foto_carga_1") or entry.get("foto_interior_1"), "Carga 1 / 货物1")
        + _photo_block(entry.get("foto_carga_2") or entry.get("foto_interior_2"), "Carga 2 / 货物2")
        + _photo_block(entry.get("foto_carga_3") or entry.get("foto_interior_3"), "Carga 3 / 货物3")
    )

    caseta_section = (
        "<table>" + caseta_rows + "</table>"
        + ('<div style="margin-top:8px;">' + fotos_caseta + "</div>" if fotos_caseta.strip() else "")
        + '<div class="rb" style="margin-top:14px;"><p style="font-weight:bold;margin:0 0 6px;font-size:9px;color:#92400E;">REGLAMENTO NAF / NAF 规章制度</p>' + rules_html + "</div>"
        + '<div class="db"><p style="font-weight:bold;margin:0 0 6px;font-size:9px;color:#166534;">DECLARACIONES DEL OPERADOR / 司机声明</p>' + decls_html + "</div>"
        + '<div style="margin-top:10px;padding:10px;background:#f9fafb;border:1px solid #e5e7eb;">'
        + '<p style="margin:0 0 6px;font-size:8px;font-weight:bold;color:#374151;text-transform:uppercase;">Aceptado / 已接受 — Firma del Operador / 司机签字</p>'
        + _inline_sig(entry.get("firma_operador", ""), "Firma Operador / 司机签字", entry.get("chofer_nombre", ""))
        + "</div>"
        + (('<div style="margin-top:10px;">' + fotos_salida + "</div>") if fotos_salida.strip() else "")
        + (('<div style="margin-top:10px;padding:10px;background:#f9fafb;border:1px solid #e5e7eb;">'
            + '<p style="margin:0 0 6px;font-size:8px;font-weight:bold;color:#374151;text-transform:uppercase;">Firma Guardia de Salida / 出场警卫签字</p>'
            + _inline_sig(ex.get("firma_guardia", ""), "Firma Guardia Salida / 出场警卫签字", ex.get("guardia_salida_nombre", ""))
            + "</div>") if ex and ex.get("firma_guardia") else "")
    )

    # ── Sección 2: Inspección ────────────────────────────────────────────────
    if not inspections:
        insp_section = (
            '<div style="padding:10px;background:#FEF9C3;border:1px solid #F59E0B;color:#92400E;font-size:9px;">'
            "No hay inspecciones digitales vinculadas. Placas: " + entry.get("placas_unidad", "N/D") + "</div>"
        )
    else:
        insp_blocks = []
        for insp in inspections:
            itype = insp.get("inspection_type", "")
            pts   = insp.get("points", [])

            rows_html = ""
            for pt in pts:
                num   = pt.get("number", "")
                defn  = _POINT_MAP_ALL.get(num, (str(num), ""))
                bname = (defn[0] + " / " + defn[1]) if defn[1] else defn[0]
                estado = pt.get("estado", "-")
                cls   = "g" if estado == "bueno" else "b" if estado == "malo" else ""
                est_label = "BUENO / 良好" if estado == "bueno" else ("FALLA / 故障" if estado == "malo" else "N/A")
                foto_html = ""
                if pt.get("photo"):
                    p_url = pt["photo"]
                    # Resolvemos SIEMPRE a base64 inline (igual que fotos de caseta/embarque):
                    # un <img src="drive.google.com/..."> crudo no carga sin sesión de Google,
                    # lo que hacía que los puntos con foto se vieran "incompletos" en el correo.
                    resolved = _resolve_src_to_b64(p_url)
                    if resolved:
                        foto_html = (
                            '<div style="margin-top:4px;border:1px solid #eee;padding:4px;background:#f9fafb;line-height:0;">'
                            '<img src="' + resolved + '" style="width:100%;max-width:400px;height:auto;display:block;border:1px solid #ddd;"/>'
                            '</div>'
                        )
                    else:
                        foto_html = (
                            '<div style="margin-top:4px;border:1px dashed #ccc;padding:4px;background:#f9fafb;'
                            'color:#999;font-size:6px;">Foto no disponible (' + p_url[:40] + ')</div>'
                        )
                rows_html += (
                    "<tr>"
                    '<td style="text-align:center;width:28px;">' + str(num) + "</td>"
                    "<td>" + bname + "</td>"
                    '<td class="' + cls + '" style="text-align:center;width:80px;">' + est_label + "</td>"
                    "<td>" + (pt.get("comentarios") or "-") + foto_html + "</td>"
                    "</tr>"
                )

            appr = insp.get("approval_status", "pendiente")
            appr_color = "#16a34a" if appr == "aprobada" else ("#dc2626" if appr == "rechazada" else "#f59e0b")
            appr_label = "APROBADA / 已批准" if appr == "aprobada" else ("RECHAZADA / 已拒绝" if appr == "rechazada" else "PENDIENTE / 待定")
            res_color  = "#16a34a" if insp.get("status_general") == "bueno" else "#dc2626"
            res_label  = "BUENO / 良好" if insp.get("status_general") == "bueno" else "FALLA / 故障"
            sup_name   = insp.get("approved_by_name") or insp.get("approved_by", "")
            sup_sig    = insp.get("approved_by_signature") or insp.get("approved_sig", "")
            appr_note  = insp.get("approval_note", "")
            note_html  = ('<br/><span style="font-size:8px;color:#555;display:block;margin-top:2px;">' + appr_note + "</span>") if appr_note else ""
            sup_cell = (
                '<div class="sr"><span style="font-size:9px;font-weight:600;">' + sup_name + "</span>"
                + _inline_sig(sup_sig, "Firma Supervisor / 主管签字") + "</div>"
                if sup_name else
                '<span style="color:#aaa;font-style:italic;font-size:8px;">Pendiente de aprobación / 待批准</span>'
            )
            itype_label = "19 PUNTOS / 19点检查" if "19" in itype else "9 PUNTOS / 9点检查"

            dimensions_rows = ""
            if insp.get("box_type"):
                m = insp.get("measures", {})
                dimensions_rows = (
                    th2("DIMENSIONES DE LA CAJA / 货箱尺寸")
                    + tr("Tipo de Caja / 货箱类型", str(insp.get("box_type")) + '"')
                    + tr("Alto / 高度", m.get("alto", "-"))
                    + tr("Ancho / 宽度", m.get("ancho", "-"))
                    + tr("Largo / 长度", m.get("largo", "-"))
                    + tr("Capacidad / 容量", str(m.get("capacidad", "-")) + " m³")
                )

            guard_cell = ""
            if insp.get("guard_name"):
                guard_cell = (
                    '<tr><td style="background:#f9fafb;vertical-align:middle;"><b>Guardia / 警卫</b></td><td>'
                    + '<div class="sr"><span style="font-size:9px;font-weight:600;">' + str(insp.get("guard_name") or "-") + "</span>"
                    + _inline_sig(insp.get("guard_signature", ""), "Firma Guardia / 警卫签字")
                    + "</div></td></tr>"
                )

            insp_blocks.append(
                '<div style="margin-bottom:20px;border:1px solid #0A2540;padding:10px;">'
                '<p style="font-weight:bold;background:#e8f0fe;padding:6px;margin:-10px -10px 10px;color:#0A2540;border-bottom:2px solid #0A2540;">'
                + itype_label + " — " + insp.get("numero_trailer", "-") + " — " + insp.get("placas_unidad", "-") + "</p>"
                "<table style='margin-bottom:10px;'>"
                + tr("Resultado / 检查结果", '<span class="chip" style="background:' + res_color + ';">' + res_label + "</span>")
                + tr("Aprobación / 批准", '<span class="chip" style="background:' + appr_color + ';">' + appr_label + "</span>" + note_html)
                + tr("Compañía / 运输公司", insp.get("compania_transportista"))
                + tr("Precinto / 铅封", (insp.get("numero_precinto") or "-") + " | Sello alta seg.: " + (insp.get("sello_alta_seguridad") or "-"))
                + tr("Fecha Inspección / 检查日期", _sd(insp.get("fecha_hora") or insp.get("created_at")))
                + dimensions_rows
                + '<tr><td style="background:#f9fafb;vertical-align:middle;"><b>Inspector / 检查员</b></td><td>'
                + '<div class="sr"><span style="font-size:9px;font-weight:600;">' + (insp.get("inspector_nombre") or "-") + "</span>"
                + _inline_sig(insp.get("inspector_firma", ""), "Firma Inspector / 检查员签字")
                + "</div></td></tr>"
                + guard_cell
                + '<tr><td style="background:#f9fafb;vertical-align:middle;"><b>Supervisor aprueba / 主管批准</b></td><td>' + sup_cell + "</td></tr>"
                + "</table>"
                "<table>"
                '<tr style="background:#e8f0fe;">'
                '<th style="width:28px;text-align:center;">#</th>'
                "<th>Punto de Inspección / 检查点</th>"
                '<th style="width:80px;text-align:center;">Estado / 状态</th>'
                "<th>Comentarios / 备注</th></tr>"
                + rows_html + "</table></div>"
            )
        insp_section = "".join(insp_blocks)

    # ── Sección 3: Embarque ──────────────────────────────────────────────────
    if ticket:
        fotos_emb = (
            _photo_block(ticket.get("foto_carga_1"), "Carga 1")
            + _photo_block(ticket.get("foto_carga_2"), "Carga 2")
            + _photo_block(ticket.get("foto_carga_3"), "Carga 3")
            + _photo_block(ticket.get("foto_sello"), "Sello final")
        )
        shipping_section = (
            "<table style='margin-bottom:12px;'>"
            + tr("Cliente / 客户", ticket.get("cliente"))
            + tr("Operador / 操作员", ticket.get("operador"))
            + tr("Línea Transporte / 运输线路", ticket.get("linea_transporte"))
            + tr("Placas / 车牌", ticket.get("placas_unidad"))
            + tr("Caja / 货箱", ticket.get("numero_caja"))
            + tr("Pallets / 托盘数量", ticket.get("numero_pallets"))
            + tr("Sello / 封条", ticket.get("numero_sello"))
            + tr("No. Económico / 经济号", ticket.get("numero_economico"))
            + tr("Orden de Compra / 采购订单", ticket.get("numero_orden_compra"))
            + tr("Observaciones / 备注", ticket.get("observaciones"))
            + '<tr><td style="background:#f9fafb;vertical-align:middle;"><b>Almacenista / 仓管员</b></td><td>'
            + '<div class="sr"><span style="font-size:9px;font-weight:600;">' + (ticket.get("almacenista") or "-") + "</span>"
            + _inline_sig(ticket.get("firma_almacenista", ""), "Firma Almacenista / 仓管员签字", ticket.get("almacenista", ""))
            + "</div></td></tr>"
            + '<tr><td style="background:#f9fafb;vertical-align:middle;"><b>Guardia / 警卫</b></td><td>'
            + '<div class="sr"><span style="font-size:9px;font-weight:600;">' + (ticket.get("nombre_guardia") or "-") + "</span>"
            + _inline_sig(ticket.get("firma_guardia", ""), "Firma Guardia / 警卫签字", ticket.get("nombre_guardia", ""))
            + "</div></td></tr>"
            + "</table>"
            + ('<div style="margin-top:8px;">' + fotos_emb + "</div>" if fotos_emb.strip() else "")
        )
    else:
        shipping_section = '<div style="padding:8px;background:#f1f5f9;border:1px solid #ddd;color:#666;font-size:9px;">Unidad de descarga — no aplica ticket de embarque. / 卸货车辆 — 不适用运输单。</div>'

    now_str = _sd(datetime.now(timezone.utc).isoformat())
    year    = datetime.now().year

    shipping_block = (
        '<div class="st">3. TICKET DE EMBARQUE / 运输单</div>' + shipping_section
        if is_carga else
        '<div style="padding:8px;background:#f1f5f9;border:1px solid #ddd;color:#666;font-size:9px;margin-top:15px;">Unidad de descarga — no aplica ticket de embarque.</div>'
    )

    return (
        "<!DOCTYPE html><html><head><meta charset='UTF-8'><style>" + css + "</style></head><body>"
        '<div class="pw">'
        '<div class="hb">'
        + (('<img src="' + NAF_LOGO_B64 + '" class="hb-logo" alt="NAF"/>') if NAF_LOGO_B64 else "")
        + '<h1>REPORTE CONSOLIDADO / 综合报告</h1>'
        "<p>NAF INDUSTRIES · C-TPAT · Unidad: <b>" + placas + "</b> · Generado: " + now_str + "</p></div>"
        '<div class="st">1. REGISTRO DE CASETA / 门卫室记录</div>'
        + caseta_section
        + '<div class="st">2. INSPECCIÓN C-TPAT / C-TPAT 检查</div>'
        + insp_section
        + shipping_block
        + '<div class="ft">© ' + str(year) + ' Branco Industries — Sistema SRIUC / SRIUC 系统 &nbsp;|&nbsp; Documento generado el ' + now_str + "</div>"
        + "</div></body></html>"
    )


async def _build_report_html(record_id: str) -> tuple:
    """Wrapper legacy — devuelve (html, placas)."""
    rec, inspections, ticket, placas = await _collect_report_data(record_id)
    if not rec: return None, None
    html = _build_full_report_html(rec, inspections, ticket, placas)
    return html, placas


def _sync_send_via_gmail_api(sender_email: str, msg) -> dict:
    """
    Envía un mensaje MIME ya construido usando la API de Gmail (HTTPS, puerto 443)
    en lugar de SMTP crudo. HuggingFace Spaces bloquea a nivel de red los puertos
    SMTP salientes (25/465/587 -> "Network is unreachable"/timeout), pero el
    puerto 443 (HTTPS) sí funciona, así que usamos la API REST de Gmail.
    Requiere GMAIL_ACCESS_TOKEN en el entorno (inyectado periódicamente vía
    /api/admin/refresh-gmail-token, igual que GOOGLEDRIVE_ACCESS_TOKEN).
    """
    token = os.environ.get("GMAIL_ACCESS_TOKEN", "")
    if not token:
        raise RuntimeError("GMAIL_ACCESS_TOKEN no configurado")
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    resp = requests.post(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"raw": raw},
        timeout=30,
    )
    if resp.status_code >= 300:
        raise RuntimeError(f"Gmail API error {resp.status_code}: {resp.text[:300]}")
    return resp.json()


async def send_report_email(record_id: str, extra_emails: List[str] = []):
    """
    Envía el reporte consolidado COMPLETO por correo usando la API de Gmail.
    HTML con todas las secciones, fotos y firmas en base64 inline — igual al PDF.
    Se ejecuta como tarea async nativa de FastAPI BackgroundTasks (mismo event loop
    que el resto de la app), evitando el error "Future attached to a different loop"
    que ocurría al crear un event loop nuevo dentro de un hilo del threadpool.
    """
    sender_email = os.environ.get("SMTP_USER", "d4r005@gmail.com")
    default_recipient = os.environ.get("REPORT_RECIPIENT", "d.trujillo@brancoindustries.com")

    if not os.environ.get("GMAIL_ACCESS_TOKEN"):
        logger.error("send_report_email: GMAIL_ACCESS_TOKEN no configurado")
        return False, "Token de Gmail no configurado"

    try:
        rec, inspections, ticket, placas = await _collect_report_data(record_id)
    except Exception as e:
        logger.error("send_report_email: error obteniendo datos del reporte: " + str(e))
        return False, str(e)
    if not rec:
        return False, "Registro no encontrado"

    all_recipients = list({default_recipient.lower()} | {e.strip().lower() for e in extra_emails if e.strip()})
    html_body = _build_full_report_html(rec, inspections, ticket, placas)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Reporte CTPAT  " + placas + "  " + datetime.now().strftime("%d/%m/%Y %H:%M")
    msg["From"]    = sender_email
    msg["To"]      = ", ".join(all_recipients)
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        # La llamada HTTPS a la API de Gmail es bloqueante -> se delega a un hilo
        # para no congelar el event loop principal.
        await asyncio.to_thread(_sync_send_via_gmail_api, sender_email, msg)
        logger.info("Reporte completo enviado a " + str(all_recipients) + " unidad " + placas)
        return True, "Reporte completo enviado a " + str(len(all_recipients)) + " destinatario(s)"
    except Exception as e:
        logger.error("Error enviando email: " + str(e))
        return False, str(e)

@api_router.patch("/vehicle-records/{rec_id}/exit", response_model=VehicleRecord)
async def exit_record(rec_id: str, body: VehicleExit, background_tasks: BackgroundTasks, u: Dict[str, Any] = Depends(get_current_user)):
    x = body.dict()
    # Sólo se fija la fecha/hora de salida la PRIMERA vez que se registra.
    # Antes, cada edición posterior (ej. corregir un sello o el conteo de
    # pallets) sobreescribía fecha_salida con el momento de la edición,
    # haciendo que el reporte mostrara una hora de salida incorrecta.
    existing = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0, "exit": 1})
    existing_exit = (existing or {}).get("exit", {}) or {}
    existing_fecha = existing_exit.get("fecha_salida")
    x["fecha_salida"] = existing_fecha or datetime.now(timezone.utc).isoformat()
    # PROTECCIÓN CRÍTICA: este endpoint recibe SIEMPRE el modelo completo
    # (VehicleExit tiene default "" en todos los campos), así que si el
    # frontend guarda con un estado incompleto -- por ejemplo por un bug de
    # estado en React, o simplemente porque el usuario abrió el formulario
    # antes de que terminaran de cargar los datos existentes -- un $set
    # directo del dict completo BORRA evidencia ya guardada (fotos de sello,
    # firma del guardia) que no venía en este envío puntual. Igual que ya se
    # corrigió para "entry"/"exit" en el PUT genérico, aquí se conserva el
    # valor existente para foto/firma cuando el nuevo valor llega vacío.
    for f in ["firma_guardia", "sello_vvtt_foto", "sello_vvtt_foto_2"]:
        if not x.get(f) and existing_exit.get(f):
            x[f] = existing_exit[f]
        elif x.get(f) and is_signature_broken(x[f]) and existing_exit.get(f):
            # Captura rota (cuadro solido, ver is_signature_broken) -- no pisar
            # una firma buena ya guardada con basura.
            logger.warning(f"Firma/foto rota detectada en salida {rec_id}, campo {f}: se conserva la version anterior")
            x[f] = existing_exit[f]
        elif x.get(f):
            x[f] = ensure_clean_image(x[f])
    await db.vehicle_records.update_one({"id": rec_id}, {"$set": {"exit": x, "status": "salida"}})
    up = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
    # Sincronizar salida automáticamente al sheet
    if up: background_tasks.add_task(sync_to_google_sheets, "salida", up)
    # Enviar reporte automático por correo si el proceso está completo (Ingreso + Inspección + Embarque + Salida)
    # Excepción: Si es "DESCARGA", se omite el Ticket de Embarque
    if up:
        entry_data     = up.get("entry", {})
        has_entry      = bool(entry_data)
        has_inspection = bool(up.get("inspection_id") or up.get("inspection_ids"))
        has_ticket     = bool(up.get("shipping_ticket_id"))
        has_exit       = bool(up.get("exit"))

        # Determinar si es un proceso de descarga
        is_descarga = "descarga" in entry_data.get("condicion_carga", "").lower()

        # El proceso está completo si tiene entrada, inspección y salida.
        # El ticket de embarque solo es obligatorio si NO es descarga.
        placas_salida = entry_data.get("placas_unidad", "S/P")
        if has_entry and has_inspection and has_exit and (is_descarga or has_ticket):
            background_tasks.add_task(send_report_email, rec_id)
            motivo = "Descarga" if is_descarga else "Carga Completa"
            logger.info(f"Reporte automático disparado para record {rec_id} ({motivo})")
            background_tasks.add_task(
                notify_roles, ["supervisor", "admin"],
                f"✅ Proceso completo: {placas_salida}",
                f"{u['name']} registró la salida de la unidad {placas_salida}. Proceso completo, reporte enviado.",
                exclude_user_id=u["id"], record_id=rec_id, kind="proceso_completo"
            )
        else:
            missing = []
            if not has_entry: missing.append("Ingreso")
            if not has_inspection: missing.append("Inspección")
            if not is_descarga and not has_ticket: missing.append("Embarque (Obligatorio para Carga)")
            if not has_exit: missing.append("Salida")
            logger.info(f"Salida registrada para {rec_id} pero proceso incompleto. Faltan: {', '.join(missing)}")
            background_tasks.add_task(
                notify_roles, ["supervisor", "admin"],
                f"🚦 Salida registrada: {placas_salida}",
                f"{u['name']} registró la salida de la unidad {placas_salida}. Faltan: {', '.join(missing)}." if missing else f"{u['name']} registró la salida de la unidad {placas_salida}.",
                exclude_user_id=u["id"], record_id=rec_id, kind="salida"
            )
    return VehicleRecord(**up)

# --- Inspecciones ---
@api_router.post("/inspections", response_model=Inspection)
async def create_inspection(body: InspectionCreate, background_tasks: BackgroundTasks, u: Dict[str, Any] = Depends(get_current_user)):
    iid = str(uuid.uuid4()); doc = body.dict()
    doc.update({
        "id": iid, "user_id": u["id"], "created_at": datetime.now(timezone.utc).isoformat(),
        "status_general": "malo" if any(p.estado == "malo" for p in body.points) else "bueno",
        "approval_status": "pendiente"
    })
    doc["inspector_firma"] = ensure_clean_image(doc.get("inspector_firma", ""))
    doc["guard_signature"] = ensure_clean_image(doc.get("guard_signature", ""))
    for p in doc["points"]:
        if p.get("photo"): p["photo"] = ensure_clean_image(p["photo"])
    await db.inspections.insert_one(doc)
    if body.record_id:
        await db.vehicle_records.update_one(
            {"id": body.record_id},
            {"$set": {"status": "inspeccionado", "inspection_id": iid},
             "$addToSet": {"inspection_ids": iid}}
        )
    else:
        # Auto-vincular por placas si no viene record_id
        pl = _plate_regex_pattern(body.placas_unidad or "")
        if pl:
            rec_by_plates = await db.vehicle_records.find_one(
                {"entry.placas_unidad": {"$regex": pl, "$options": "i"}, "status": {"$ne": "salida"}},
                sort=[("created_at", -1)]
            )
            if rec_by_plates:
                await db.vehicle_records.update_one(
                    {"id": rec_by_plates["id"]},
                    {"$set": {"status": "inspeccionado", "inspection_id": iid},
                     "$addToSet": {"inspection_ids": iid}}
                )
                doc["record_id"] = rec_by_plates["id"]
    # Sincronizar automáticamente al sheet
    background_tasks.add_task(sync_to_google_sheets, "inspeccion", doc)

    # Alerta de seguimiento: toda inspección requiere aprobación de supervisor/admin
    background_tasks.add_task(
        notify_roles, ["supervisor", "admin"],
        f"📋 Inspección pendiente de aprobar: {body.placas_unidad}",
        f"{u['name']} completó la inspección de la unidad {body.placas_unidad}. Requiere tu aprobación.",
        exclude_user_id=u["id"], inspection_id=iid, kind="approval_pending"
    )

    # Notificar si hay fallas (alerta global urgente para todos)
    if doc["status_general"] == "malo":
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()), "user_id": u["id"], "global": True, "read": False,
            "title": f"🔴 FALLA: {body.placas_unidad}",
            "message": f"Inspección con fallas reportada por {u['name']}.",
            "inspection_id": iid, "kind": "falla", "created_at": datetime.now(timezone.utc).isoformat()
        })

    return Inspection(**doc)

@api_router.get("/inspections", response_model=List[Inspection])
async def list_insps(u: Dict[str, Any] = Depends(get_current_user), scope: str = "mine"):
    filt = {} if scope == "all" and (u["role"] in ["supervisor", "admin"] or is_admin(u)) else {"user_id": u["id"]}
    # Proyectar fuera las fotos para la lista
    docs = await db.inspections.find(filt, MINIMAL_INSPECTION_PROJECTION).sort("created_at", -1).to_list(2000)
    return [Inspection(**d) for d in docs]

@api_router.get("/inspections/{insp_id}", response_model=Inspection)
async def get_insp(insp_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    d = await db.inspections.find_one({"id": insp_id}, {"_id": 0})
    if not d: raise HTTPException(404)
    return Inspection(**d)

@api_router.put("/inspections/{insp_id}")
async def update_inspection(insp_id: str, body: Dict[str, Any], u: Dict[str, Any] = Depends(get_current_user)):
    for k in ["_id", "id", "user_id", "created_at"]:
        if k in body: del body[k]
    existing = await db.inspections.find_one({"id": insp_id}, {"_id": 0}) or {}
    # Limpiar fotos. Si una firma llega rota (cuadro solido, ver
    # is_signature_broken) y ya existia una buena, se descarta la nueva.
    for f in ["inspector_firma", "guard_signature", "approved_by_signature"]:
        v = body.get(f)
        if v and str(v).startswith("data:image"):
            if is_signature_broken(v) and existing.get(f):
                logger.warning(f"Firma rota detectada en inspection {insp_id} campo {f}: se conserva la version anterior")
                body[f] = existing[f]
            else:
                body[f] = ensure_clean_image(v)
    if "points" in body:
        for p in body["points"]:
            if p.get("photo") and p["photo"].startswith("data:image"):
                p["photo"] = ensure_clean_image(p["photo"])

    await db.inspections.update_one({"id": insp_id}, {"$set": body})
    return {"ok": True}

@api_router.delete("/inspections/{insp_id}")
async def delete_inspection(insp_id: str, background_tasks: BackgroundTasks, u: Dict[str, Any] = Depends(get_current_user)):
    if not is_admin(u): raise HTTPException(403)
    insp = await db.inspections.find_one({"id": insp_id}, {"_id": 0})
    if not insp:
        raise HTTPException(404, "Inspección no encontrada")
    placas = insp.get("placas_unidad", "")

    await db.inspections.delete_one({"id": insp_id})

    # Cascada: quitar de Google Sheets (9 o 19 puntos, según el tipo) y de Drive
    background_tasks.add_task(_sheet_delete_rows_by_ids, "Inspecciones_19_Puntos", [insp_id])
    background_tasks.add_task(_sheet_delete_rows_by_ids, "Inspecciones_9_Puntos", [insp_id])
    background_tasks.add_task(cleanup_drive_evidence, placas, insp)

    background_tasks.add_task(
        notify_roles, ["supervisor", "admin"],
        f"🗑️ Inspección eliminada: {placas or 'S/P'}",
        f"{u['name']} eliminó la inspección de la unidad {placas or 'S/P'} (Mongo, Sheet y evidencia de Drive).",
        exclude_user_id=u["id"], kind="inspeccion"
    )
    return {"ok": True}

@api_router.post("/inspections/{insp_id}/approve", response_model=Inspection)
async def approve_insp(insp_id: str, body: ApprovalBody, background_tasks: BackgroundTasks, u: Dict[str, Any] = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    update = {"approval_status": "aprobada", "approval_note": body.note, "approved_by": body.name, "approved_by_name": body.name, "approved_sig": ensure_clean_image(body.signature), "approved_by_signature": ensure_clean_image(body.signature), "approved_at": now}
    await db.inspections.update_one({"id": insp_id}, {"$set": update})
    d = await db.inspections.find_one({"id": insp_id}, {"_id": 0})

    # Notificar al inspector que su inspección fue aprobada
    if d:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()), "user_id": d["user_id"], "global": False, "read": False,
            "title": "✅ Inspección Aprobada",
            "message": f"Tu inspección de la unidad {d.get('placas_unidad')} ha sido aprobada por {u['name']}.",
            "inspection_id": insp_id, "kind": "approved", "created_at": datetime.now(timezone.utc).isoformat()
        })

        # Alerta de seguimiento: avisar a supervisor/admin que ya pueden generar
        # el ticket de embarque de esta unidad (antes no se avisaba a nadie
        # tras aprobar, por eso "no llegaba mensaje" para el siguiente paso).
        placas_d = d.get("placas_unidad", "S/P")
        ya_tiene_ticket = False
        rec = None
        if d.get("record_id"):
            rec = await db.vehicle_records.find_one({"id": d["record_id"]}, {"_id": 0})
        if not rec:
            pl = _plate_regex_pattern(placas_d or "")
            if pl:
                rec = await db.vehicle_records.find_one(
                    {"entry.placas_unidad": {"$regex": pl, "$options": "i"}},
                    sort=[("created_at", -1)]
                )
        ya_tiene_ticket = bool(rec and rec.get("has_shipping_ticket"))
        if not ya_tiene_ticket:
            background_tasks.add_task(
                notify_roles, ["supervisor", "admin"],
                f"📦 Lista para embarque: {placas_d}",
                f"La inspección de la unidad {placas_d} fue aprobada por {u['name']}. Ya se puede generar el ticket de embarque.",
                exclude_user_id=u["id"], inspection_id=insp_id, record_id=(rec.get("id") if rec else None), kind="embarque_pendiente"
            )

    return Inspection(**d)

# --- Embarque ---
@api_router.post("/shipping-tickets")
async def create_ticket(body: ShippingTicketCreate, background_tasks: BackgroundTasks, u: Dict[str, Any] = Depends(get_current_user)):
    tid = str(uuid.uuid4()); doc = body.dict()
    doc.update({"id": tid, "user_id": u["id"], "created_at": datetime.now(timezone.utc).isoformat()})
    for f in ["firma_almacenista", "firma_guardia", "foto_inicio_carga", "foto_media_carga", "foto_final_carga"]:
        if doc.get(f): doc[f] = ensure_clean_image(doc[f])
    await db.shipping_tickets.insert_one(doc)
    if body.record_id:
        await db.vehicle_records.update_one(
            {"id": body.record_id},
            {"$set": {"shipping_ticket_id": tid, "has_shipping_ticket": True}}
        )
        background_tasks.add_task(sync_orden_compra, body.record_id, tid)
    else:
        # Auto-vincular por placas si no viene record_id.
        # OJO: antes esto excluía registros con status=="salida", lo cual
        # rompía el vínculo cuando el ticket se genera DESPUÉS de que la
        # unidad ya salió (por ejemplo, completando datos faltantes de un
        # registro histórico) — el ticket se guardaba pero nunca quedaba
        # ligado al vehicle_record, así que el panel maestro seguía
        # mostrando el proceso como incompleto para siempre. Ahora se
        # prioriza el registro más reciente de esa placa que AÚN NO tenga
        # ticket, sin importar si ya salió o no.
        pl = _plate_regex_pattern(body.placas_unidad or "")
        if pl:
            rec_by_plates = await db.vehicle_records.find_one(
                {"entry.placas_unidad": {"$regex": pl, "$options": "i"}, "has_shipping_ticket": {"$ne": True}},
                sort=[("created_at", -1)]
            )
            if not rec_by_plates:
                # Fallback: si por lo que sea todos los registros de esa placa ya
                # tienen ticket marcado, igual se liga al más reciente para no
                # dejar el ticket huérfano.
                rec_by_plates = await db.vehicle_records.find_one(
                    {"entry.placas_unidad": {"$regex": pl, "$options": "i"}},
                    sort=[("created_at", -1)]
                )
            if rec_by_plates:
                await db.vehicle_records.update_one(
                    {"id": rec_by_plates["id"]},
                    {"$set": {"shipping_ticket_id": tid, "has_shipping_ticket": True}}
                )
                doc["record_id"] = rec_by_plates["id"]
                # BUG corregido: antes 'record_id' sólo se fijaba en la variable
                # local 'doc' (que ya se había insertado sin este campo) -- el
                # ticket en la BD se quedaba con record_id vacío para siempre,
                # aunque el vehicle_record SÍ apuntara correctamente al ticket
                # via shipping_ticket_id. Esto rompía cualquier lógica que
                # necesitara ir de ticket -> registro (como el autorrelleno de
                # orden de compra) para tickets auto-vinculados por placa.
                await db.shipping_tickets.update_one({"id": tid}, {"$set": {"record_id": rec_by_plates["id"]}})
                background_tasks.add_task(sync_orden_compra, rec_by_plates["id"], tid)
    # Sincronizar automáticamente al sheet
    background_tasks.add_task(sync_to_google_sheets, "embarque", doc)
    # Alerta de seguimiento: nuevo ticket de embarque
    placas_emb = doc.get("placas_unidad", "S/P")
    background_tasks.add_task(
        notify_roles, ["supervisor", "admin"],
        f"📦 Nuevo ticket de embarque: {placas_emb}",
        f"{u['name']} registró el ticket de embarque de la unidad {placas_emb}.",
        exclude_user_id=u["id"], record_id=doc.get("record_id"), ticket_id=tid, kind="embarque"
    )
    return {"id": tid}

@api_router.get("/shipping-tickets", response_model=List[Dict[str, Any]])
async def list_tickets(u: Dict[str, Any] = Depends(get_current_user)):
    # La lista NO necesita las fotos de carga (base64, pueden pesar cientos de
    # KB - varios MB cada una) -- incluirlas en cada ticket de la lista es lo
    # que hacia que la pantalla de embarque tardara mucho en abrir/cargar. El
    # detalle (GET /shipping-tickets/{id}) si las sigue devolviendo completas.
    return await db.shipping_tickets.find(
        {},
        {"_id": 0, "foto_inicio_carga": 0, "foto_media_carga": 0, "foto_final_carga": 0},
    ).sort("created_at", -1).to_list(2000)

@api_router.get("/shipping-tickets/{id}")
async def get_ticket(id: str, u: Dict[str, Any] = Depends(get_current_user)):
    d = await db.shipping_tickets.find_one({"id": id}, {"_id": 0})
    if not d: d = await db.shipping_tickets.find_one({"record_id": id}, {"_id": 0})
    if not d: raise HTTPException(404)
    return d

@api_router.put("/shipping-tickets/{id}")
async def update_ticket(id: str, body: Dict[str, Any], background_tasks: BackgroundTasks, u: Dict[str, Any] = Depends(get_current_user)):
    for k in ["_id", "id", "user_id", "created_at"]:
        if k in body: del body[k]
    existing = await db.shipping_tickets.find_one({"id": id}, {"_id": 0}) or {}
    for f in ["firma_almacenista", "firma_guardia", "foto_inicio_carga", "foto_media_carga", "foto_final_carga"]:
        v = body.get(f)
        if v and str(v).startswith("data:image"):
            if f in ("firma_almacenista", "firma_guardia") and is_signature_broken(v) and existing.get(f):
                logger.warning(f"Firma rota detectada en ticket {id} campo {f}: se conserva la version anterior")
                body[f] = existing[f]
            else:
                body[f] = ensure_clean_image(v)
    await db.shipping_tickets.update_one({"id": id}, {"$set": body})
    background_tasks.add_task(sync_orden_compra, None, id)
    return {"ok": True}

@api_router.delete("/shipping-tickets/{id}")
async def delete_ticket(id: str, background_tasks: BackgroundTasks, u: Dict[str, Any] = Depends(get_current_user)):
    if not is_admin(u): raise HTTPException(403)
    ticket = await db.shipping_tickets.find_one({"id": id}, {"_id": 0})
    if not ticket:
        raise HTTPException(404, "Ticket de embarque no encontrado")
    placas = ticket.get("placas_unidad", "")

    await db.shipping_tickets.delete_one({"id": id})
    # Desvincular del registro de caseta si estaba enlazado
    if ticket.get("record_id"):
        await db.vehicle_records.update_one(
            {"id": ticket["record_id"]},
            {"$unset": {"shipping_ticket_id": "", "has_shipping_ticket": ""}}
        )

    # Cascada: quitar de Google Sheets (Tickets_Embarque) y de Drive
    background_tasks.add_task(_sheet_delete_rows_by_ids, "Tickets_Embarque", [id])
    background_tasks.add_task(cleanup_drive_evidence, placas, ticket)

    background_tasks.add_task(
        notify_roles, ["supervisor", "admin"],
        f"🗑️ Ticket de embarque eliminado: {placas or 'S/P'}",
        f"{u['name']} eliminó el ticket de embarque de la unidad {placas or 'S/P'} (Mongo, Sheet y evidencia de Drive).",
        exclude_user_id=u["id"], kind="embarque"
    )
    return {"ok": True}

# ========== Sincronización Google Sheets (directo, sin webhook) ==========

SHEET_ID = "1o1l0iH74CykHu4p7Ybaa08HSNeRaesy_OOG4DpkGoPE"

async def _get_drive_token():
    """Recupera el token inyectado en el entorno."""
    return os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN", "")

def _sheets_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

async def _sheet_get_col_a(token: str, hoja: str) -> List[str]:
    """Obtiene la columna A de una hoja para deduplicación."""
    try:
        url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/'{hoja}'!A2:A5000"
        r = await asyncio.get_event_loop().run_in_executor(
            None, lambda: requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=10)
        )
        vals = r.json().get("values", [])
        return [v[0] for v in vals if v]
    except Exception as e:
        logger.error(f"Error obteniendo Col A de {hoja}: {e}")
        return []

async def _sheet_append_via_api(hoja: str, row: list, unique_id: str):
    """
    Agrega una fila al Sheet directamente via Sheets API.
    Usa el token almacenado en GOOGLEDRIVE_ACCESS_TOKEN.
    """
    token = os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN", "")
    if not token:
        logger.warning(f"Sheets append [{hoja}]: sin token de acceso")
        return

    loop = asyncio.get_event_loop()

    def _append():
        return requests.post(
            f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/'{hoja}'!A1:append",
            params={"valueInputOption": "RAW", "insertDataOption": "INSERT_ROWS"},
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"majorDimension": "ROWS", "values": [row]},
            timeout=10).json()

    try:
        existing = await _sheet_get_col_a(token, hoja)
        if unique_id and unique_id in existing:
            logger.info(f"Sheets [{hoja}] ya existe ID {unique_id}, omitiendo")
            return
        result = await loop.run_in_executor(None, _append)
        logger.info(f"Sheets [{hoja}] fila agregada para ID {unique_id}: {result.get('updates',{}).get('updatedRows','?')} filas")
    except Exception as e:
        logger.error(f"Sheets append [{hoja}] error: {e}")

async def sync_to_google_sheets(tipo: str, payload: Any):
    """
    Sincroniza un registro a la hoja correcta del Google Sheet.
    - tipo: 'entrada', 'salida', 'inspeccion', 'embarque'
    - Usa el ID del registro como clave de deduplicación (col A de cada hoja)
    - Nunca inserta duplicados: si el ID ya existe, omite silenciosamente
    """
    token = await _get_drive_token()
    if not token:
        logger.warning("sync_sheets: GOOGLEDRIVE_ACCESS_TOKEN no configurado")
        return

    data = payload if isinstance(payload, dict) else payload.dict()

    try:
        if tipo in ("entrada", "salida"):
            rec_id = data.get("id", "")
            entry  = data.get("entry", {})
            ex     = data.get("exit", {}) or {}
            hoja   = "Entradas_Salidas"

            existing = await _sheet_get_col_a(token, hoja)
            # Para ENTRADA y SALIDA usamos rec_id + tipo como clave única
            key_entrada = f"{rec_id}:entrada"
            key_salida  = f"{rec_id}:salida"

            if tipo == "entrada" and key_entrada not in existing:
                row = [
                    str(key_entrada),                           # A: ID_Registro
                    str(data.get("created_at") or ""),          # B: Fecha
                    "ENTRADA",                                  # C: Proceso
                    str(entry.get("placas_unidad") or ""),       # D: Placas
                    str(entry.get("chofer_nombre") or ""),       # E: Chofer
                    str(entry.get("compania_transporte") or ""), # F: Compañía
                    str(entry.get("numero_tractor") or ""),      # G: Tractor
                    str(entry.get("numero_caja") or ""),         # H: Caja
                    str(entry.get("sello_entrada") or ""),       # I: Sello
                    str(entry.get("destino") or ""),             # J: Destino
                    str(entry.get("guardia_caseta_nombre") or ""), # K: Guardia
                    str(entry.get("cortina_asignada") or ""),    # L: Cortina
                    str(entry.get("licencia_conductor") or ""),  # M: Licencia
                    str(entry.get("condicion_carga") or ""),     # N: Condicion
                ]
                await _sheet_append_via_api(hoja, row, key_entrada)
                logger.info(f"Sheets ENTRADA registrada: {entry.get('placas_unidad')}")

            elif tipo == "salida" and ex and key_salida not in existing:
                row = [
                    str(key_salida),                            # A: ID_Registro
                    str(ex.get("fecha_salida") or data.get("created_at") or ""), # B: Fecha
                    "SALIDA",                                   # C: Proceso
                    str(ex.get("placas_unidad_salida") or entry.get("placas_unidad") or ""), # D: Placas
                    str(entry.get("chofer_nombre") or ""),       # E: Chofer
                    str(entry.get("compania_transporte") or ""), # F: Compañía
                    str(ex.get("numero_tractor_salida") or entry.get("numero_tractor") or ""), # G: Tractor
                    str(ex.get("numero_caja_salida") or entry.get("numero_caja") or ""), # H: Caja
                    str(ex.get("sello_salida") or ""),           # I: Sello
                    str(ex.get("destino") or entry.get("destino") or ""), # J: Destino
                    str(ex.get("guardia_salida_nombre") or ""),  # K: Guardia
                    str(ex.get("cortina_salida") or ""),         # L: Cortina
                    "",                                         # M: Licencia
                    str(ex.get("condicion_salida") or ""),       # N: Condicion
                ]
                await _sheet_append_via_api(hoja, row, key_salida)
                logger.info(f"Sheets SALIDA registrada: {entry.get('placas_unidad')}")

        elif tipo == "inspeccion":
            insp_id = data.get("id", "")
            pts     = {p["number"]: p for p in data.get("points", [])}
            itype   = data.get("inspection_type", "")
            is_19   = "19" in itype or itype == "19_puntos"
            hoja    = "Inspecciones_19_Puntos" if is_19 else "Inspecciones_9_Puntos"

            existing = await _sheet_get_col_a(token, hoja)
            if insp_id in existing:
                logger.info(f"Sheets inspeccion ya existe, omitiendo: {insp_id}")
                return

            def pt(n): return str(pts.get(n, {}).get("estado") or "-")

            if is_19:
                row = [
                    str(insp_id),                            # Col A: ID Inspección / Unique Key
                    str(data.get("record_id") or ""),          # Col B: ID Registro
                    str(data.get("shipping_ticket_id") or ""), # Col C: ID Embarque
                    str(data.get("created_at") or ""),         # Col D: Fecha
                    "INSPECCION_19",                    # Col E: Proceso
                    str(data.get("placas_unidad") or ""),
                    str(data.get("inspector_nombre") or ""),
                    str(data.get("status_general") or ""),
                    str(sum(1 for p in pts.values() if p.get("estado") == "malo")),
                    str(data.get("approval_status") or ""),
                    str(data.get("approved_by_name") or ""),
                    pt(1), pt(2), pt(3), pt(4), pt(5), pt(6), pt(7), pt(8), pt(9),
                    pt(10), pt(11), pt(12), pt(13), pt(14), pt(15), pt(16), pt(17), pt(18), pt(19)
                ]
            else:
                row = [
                    str(insp_id),                            # Col A: ID Inspección / Unique Key
                    str(data.get("record_id") or ""),          # Col B: ID Registro
                    str(data.get("shipping_ticket_id") or ""), # Col C: ID Embarque
                    str(data.get("created_at") or ""),         # Col D: Fecha
                    "INSPECCION_9",                     # Col E: Proceso
                    str(data.get("placas_unidad") or ""),
                    str(data.get("inspector_nombre") or ""),
                    str(data.get("status_general") or ""),
                    str(sum(1 for p in pts.values() if p.get("estado") == "malo")),
                    str(data.get("approval_status") or ""),
                    str(data.get("approved_by_name") or ""),
                    pt(1), pt(2), pt(3), pt(4), pt(5), pt(6), pt(7), pt(8), pt(9)
                ]

            await _sheet_append_via_api(hoja, row, insp_id)
            logger.info(f"Sheets inspeccion registrada: {data.get('placas_unidad')} ({hoja})")

        elif tipo == "embarque":
            tid = data.get("id", "")
            hoja = "Tickets_Embarque"
            existing = await _sheet_get_col_a(token, hoja)
            if tid in existing:
                logger.info(f"Sheets embarque ya existe, omitiendo: {tid}")
                return

            row = [
                str(tid),                                # Col A: ID Embarque / Unique Key
                str(data.get("record_id") or ""),          # Col B: ID Registro
                str(data.get("inspection_id") or ""),      # Col C: ID Inspección
                str(data.get("created_at") or ""),         # Col D: Fecha
                "EMBARQUE",                         # Col E: Proceso
                str(data.get("placas_unidad") or ""),
                str(data.get("cliente") or ""),
                str(data.get("almacenista") or ""),
                str(data.get("operador") or ""),
                str(data.get("linea_transporte") or ""),
                str(data.get("numero_caja") or ""),
                str(data.get("numero_pallets") or ""),
                str(data.get("numero_sello") or ""),
                str(data.get("nombre_guardia") or ""),
                str(data.get("observaciones") or ""),
                str(data.get("area") or ""),
            ]
            await _sheet_append_via_api(hoja, row, tid)
            logger.info(f"Sheets embarque registrado: {data.get('placas_unidad')}")

    except Exception as e:
        logger.error(f"sync_to_google_sheets [{tipo}] error: {e}")


# ========== Eliminación en cascada: Mongo + Google Sheets + Drive ==========

async def _sheet_get_gid(token: str, hoja: str) -> Optional[int]:
    """Obtiene el sheetId (gid) numérico de una pestaña por su nombre."""
    try:
        url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}"
        r = await asyncio.get_event_loop().run_in_executor(
            None, lambda: requests.get(
                url, headers={"Authorization": f"Bearer {token}"},
                params={"fields": "sheets.properties"}, timeout=10)
        )
        for s in r.json().get("sheets", []):
            props = s.get("properties", {})
            if props.get("title") == hoja:
                return props.get("sheetId")
    except Exception as e:
        logger.error(f"Error obteniendo gid de {hoja}: {e}")
    return None

async def _sheet_delete_rows_by_ids(hoja: str, ids: List[str]):
    """Elimina físicamente las filas de una hoja cuya columna A coincida con algún ID dado."""
    token = os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN", "")
    ids = [i for i in ids if i]
    if not token or not ids:
        return
    loop = asyncio.get_event_loop()
    try:
        col_a = await _sheet_get_col_a(token, hoja)
        # Fila real en la hoja = índice de la lista + 2 (la lista arranca en A2)
        rows_to_delete = [idx + 2 for idx, v in enumerate(col_a) if v in ids]
        if not rows_to_delete:
            return
        gid = await _sheet_get_gid(token, hoja)
        if gid is None:
            logger.warning(f"Sheets delete [{hoja}]: no se encontró el gid de la pestaña, se omite el borrado de filas")
            return

        # Se borra de la fila más alta a la más baja para no desfasar índices
        batch_requests = [{
            "deleteDimension": {
                "range": {
                    "sheetId": gid,
                    "dimension": "ROWS",
                    "startIndex": row_num - 1,
                    "endIndex": row_num
                }
            }
        } for row_num in sorted(rows_to_delete, reverse=True)]

        def _batch():
            return requests.post(
                f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}:batchUpdate",
                headers=_sheets_headers(token),
                json={"requests": batch_requests},
                timeout=15).json()

        result = await loop.run_in_executor(None, _batch)
        if "error" in result:
            logger.error(f"Sheets delete [{hoja}] filas {rows_to_delete} -> error: {result['error']}")
        else:
            logger.info(f"Sheets [{hoja}] filas eliminadas: {rows_to_delete}")
    except Exception as e:
        logger.error(f"Sheets delete [{hoja}] error: {e}")


_DRIVE_ID_RE = re.compile(r"(?:/d/|[?&]id=)([a-zA-Z0-9_-]{15,})")

def _extract_drive_file_ids(obj: Any, found: set = None) -> set:
    """Recorre recursivamente un dict/list y extrae IDs de archivo de Google Drive de cualquier string."""
    if found is None:
        found = set()
    if isinstance(obj, dict):
        for v in obj.values():
            _extract_drive_file_ids(v, found)
    elif isinstance(obj, list):
        for v in obj:
            _extract_drive_file_ids(v, found)
    elif isinstance(obj, str):
        if "drive.google.com" in obj or "googleusercontent.com" in obj:
            for m in _DRIVE_ID_RE.finditer(obj):
                found.add(m.group(1))
    return found

async def _drive_delete_file(token: str, file_id: str):
    loop = asyncio.get_event_loop()
    try:
        r = await loop.run_in_executor(
            None, lambda: requests.delete(
                f"https://www.googleapis.com/drive/v3/files/{file_id}",
                headers={"Authorization": f"Bearer {token}"}, timeout=10)
        )
        if r.status_code in (200, 204):
            logger.info(f"Drive: archivo eliminado {file_id}")
        elif r.status_code == 404:
            pass  # ya no existe, ignorar
        else:
            logger.warning(f"Drive: no se pudo eliminar {file_id} ({r.status_code}): {r.text[:200]}")
    except Exception as e:
        logger.error(f"Drive delete file {file_id} error: {e}")

async def _drive_find_folders_by_name(token: str, name: str) -> List[str]:
    """Busca carpetas de Drive cuyo nombre coincida exactamente con `name`."""
    loop = asyncio.get_event_loop()
    try:
        q = f"name = '{name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        r = await loop.run_in_executor(
            None, lambda: requests.get(
                "https://www.googleapis.com/drive/v3/files",
                headers={"Authorization": f"Bearer {token}"},
                params={"q": q, "fields": "files(id,name)"}, timeout=10)
        )
        return [f["id"] for f in r.json().get("files", [])]
    except Exception as e:
        logger.error(f"Drive buscar carpeta '{name}' error: {e}")
        return []

async def _drive_delete_folder_recursive(token: str, folder_id: str):
    """Elimina todo el contenido de una carpeta de Drive y luego la carpeta misma."""
    loop = asyncio.get_event_loop()
    try:
        r = await loop.run_in_executor(
            None, lambda: requests.get(
                "https://www.googleapis.com/drive/v3/files",
                headers={"Authorization": f"Bearer {token}"},
                params={"q": f"'{folder_id}' in parents and trashed = false", "fields": "files(id,mimeType)"},
                timeout=10)
        )
        for f in r.json().get("files", []):
            if f.get("mimeType") == "application/vnd.google-apps.folder":
                await _drive_delete_folder_recursive(token, f["id"])
            else:
                await _drive_delete_file(token, f["id"])
    except Exception as e:
        logger.error(f"Drive listar contenido de carpeta {folder_id} error: {e}")
    await _drive_delete_file(token, folder_id)

async def cleanup_drive_evidence(placas: str, *records: Any):
    """
    Limpieza best-effort de evidencia en Drive al eliminar un proceso:
    - Borra cualquier archivo de Drive referenciado directamente en los campos del/los registro(s).
    - Busca y borra la carpeta de evidencia por número de placa (y variantes sin espacios/guiones).
    Nunca lanza excepción: un fallo aquí no debe impedir el borrado en Mongo/Sheets.
    """
    token = os.environ.get("GOOGLEDRIVE_ACCESS_TOKEN", "")
    if not token:
        logger.warning("cleanup_drive_evidence: sin GOOGLEDRIVE_ACCESS_TOKEN configurado, se omite limpieza de Drive")
        return
    try:
        file_ids = set()
        for rec in records:
            if rec:
                file_ids |= _extract_drive_file_ids(rec)
        for fid in file_ids:
            await _drive_delete_file(token, fid)

        if placas:
            clean = re.sub(r"[^A-Z0-9]", "", placas.upper())
            candidatos = {placas.strip(), placas.strip().upper(), clean}
            carpetas_vistas = set()
            for nombre in candidatos:
                if not nombre:
                    continue
                for folder_id in await _drive_find_folders_by_name(token, nombre):
                    if folder_id not in carpetas_vistas:
                        carpetas_vistas.add(folder_id)
                        await _drive_delete_folder_recursive(token, folder_id)
            if carpetas_vistas:
                logger.info(f"Drive: {len(carpetas_vistas)} carpeta(s) de evidencia eliminada(s) para placas {placas}")
    except Exception as e:
        logger.error(f"cleanup_drive_evidence error (placas={placas}): {e}")


async def _trigger_automatic_report(record_id: str):
    url = os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")
    if not url: return
    try:
        # 1. Obtener registro completo
        rec = await db.vehicle_records.find_one({"id": record_id}, {"_id": 0})
        if not rec: return

        # 2. Obtener inspecciones ligadas
        insps = []
        insp_ids = rec.get("inspection_ids", [])
        if rec.get("inspection_id"): insp_ids.append(rec["inspection_id"])

        for iid in list(set(insp_ids)):
            insp = await db.inspections.find_one({"id": iid}, {"_id": 0})
            if insp: insps.append(insp)

        # 3. Obtener Ticket
        ticket = None
        if rec.get("shipping_ticket_id"):
            ticket = await db.shipping_tickets.find_one({"id": rec["shipping_ticket_id"]}, {"_id": 0})

        payload = {
            "webhook_type": "consolidated_report",
            "caseta": rec,
            "inspections": insps,
            "embarque": ticket,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: requests.post(url, json=payload, timeout=15))
    except Exception as e:
        logger.error(f"Error triggering automatic report: {e}")

# --- Reporte Consolidado ---

@api_router.post("/report/send-email")
async def send_email_endpoint(body: SendReportEmailBody, background_tasks: BackgroundTasks, u: Dict[str, Any] = Depends(get_current_user)):
    """
    Dispara el envío del reporte consolidado en background.
    Responde inmediatamente para no generar timeout en el cliente.
    """
    # Validar que el registro existe antes de responder
    rec = await db.vehicle_records.find_one({"id": body.record_id}, {"_id": 0, "entry": 1})
    if not rec:
        raise HTTPException(404, "Registro no encontrado")

    # Lanzar el envío en background — el cliente no espera
    background_tasks.add_task(send_report_email, body.record_id, body.extra_emails)

    plates = rec.get("entry", {}).get("placas_unidad", "")
    recipients_count = 1 + len([e for e in body.extra_emails if e.strip()])
    return {
        "ok": True,
        "message": f"Reporte de {plates} en cola de envío a {recipients_count} destinatario(s). Llegará en unos momentos.",
        "async": True
    }

@api_router.get("/report/html/{record_id}")
async def get_report_html(record_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    """
    Devuelve el HTML COMPLETO y ya resuelto (fotos y firmas de Drive convertidas
    a base64 inline) del reporte consolidado — el mismo que se usa para el
    correo — para que el PDF generado en la app sea idéntico y no dependa de
    URLs de Drive crudas que no cargan sin sesión de Google.
    """
    rec, inspections, ticket, placas = await _collect_report_data(record_id)
    if not rec:
        raise HTTPException(404, "Registro no encontrado")
    html = _build_full_report_html(rec, inspections, ticket, placas)
    return {"html": html, "placas": placas}

@api_router.get("/report/consolidated/{record_id}")
async def get_consolidated_report(record_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    """Devuelve todos los datos consolidados de un registro: caseta + inspecciones + ticket de embarque"""
    rec = await db.vehicle_records.find_one({"id": record_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Registro no encontrado")

    # Asegurar vínculos antes de consultar
    rec = await _ensure_record_links(rec)

    # Obtener todas las inspecciones vinculadas
    insp_ids = list(set(rec.get("inspection_ids", [])))
    if rec.get("inspection_id") and rec["inspection_id"] not in insp_ids:
        insp_ids.append(rec["inspection_id"])

    inspections = []
    for iid in insp_ids:
        insp = await db.inspections.find_one({"id": iid}, {"_id": 0})
        if insp:
            inspections.append(insp)

    # Si aún no hay inspecciones vinculadas por ID, buscar por placas
    if not inspections:
        plates = rec.get("entry", {}).get("placas_unidad", "").strip().upper()
        if plates:
            regex = _plate_regex_pattern(plates)
            found = await db.inspections.find(
                {"placas_unidad": {"$regex": f".*{regex}.*", "$options": "i"}},
                {"_id": 0}
            ).sort("created_at", -1).to_list(10)
            inspections = found

    # Obtener ticket de embarque
    ticket = None
    if rec.get("shipping_ticket_id"):
        ticket = await db.shipping_tickets.find_one({"id": rec["shipping_ticket_id"]}, {"_id": 0})
    if not ticket:
        plates = rec.get("entry", {}).get("placas_unidad", "").strip().upper()
        if plates:
            regex = _plate_regex_pattern(plates)
            ticket = await db.shipping_tickets.find_one(
                {"placas_unidad": {"$regex": f".*{regex}.*", "$options": "i"}},
                sort=[("created_at", -1)]
            )
            if ticket and "_id" in ticket:
                del ticket["_id"]

    return {
        "caseta": rec,
        "inspections": inspections,
        "embarque": ticket,
        "has_inspections": len(inspections) > 0,
        "has_shipping": ticket is not None
    }

# --- Admin / Reparación ---
@api_router.get("/admin/duplicate-plates")
async def find_duplicate_plates(u: Dict[str, Any] = Depends(get_current_user)):
    """
    Detecta registros de caseta que probablemente son la MISMA unidad pero
    quedaron separados por una confusion de OCR al leer la placa (ej. Z vs 2,
    O vs 0). Agrupa por placa canonica y devuelve solo los grupos con mas de
    un registro, para que el admin decida cual conservar y fusionar.
    """
    if not is_admin(u): raise HTTPException(403)

    all_records = await db.vehicle_records.find({}, {"_id": 0}).to_list(5000)
    all_insps = await db.inspections.find({}, {"_id": 0, "id": 1, "record_id": 1, "placas_unidad": 1}).to_list(5000)
    all_tickets = await db.shipping_tickets.find({}, {"_id": 0, "id": 1, "placas_unidad": 1}).to_list(5000)

    insp_count_by_record: Dict[str, int] = {}
    for i in all_insps:
        rid = i.get("record_id")
        if rid: insp_count_by_record[rid] = insp_count_by_record.get(rid, 0) + 1

    groups: Dict[str, List[Dict[str, Any]]] = {}
    for r in all_records:
        plates = r.get("entry", {}).get("placas_unidad", "")
        canon = _canon_plate(plates)
        if not canon: continue
        groups.setdefault(canon, []).append(r)

    result = []
    for canon, recs in groups.items():
        # Solo interesa si hay placas EXACTAS distintas mapeando al mismo canonico
        exact_plates = {r.get("entry", {}).get("placas_unidad", "").strip().upper() for r in recs}
        if len(recs) < 2 or len(exact_plates) < 2:
            continue
        items = []
        for r in recs:
            items.append({
                "id": r["id"],
                "placas": r.get("entry", {}).get("placas_unidad", ""),
                "status": r.get("status"),
                "created_at": r.get("created_at"),
                "chofer": r.get("entry", {}).get("chofer_nombre", ""),
                "inspection_count": insp_count_by_record.get(r["id"], 0),
                "has_shipping_ticket": bool(r.get("has_shipping_ticket") or r.get("shipping_ticket_id")),
            })
        items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        result.append({"canon": canon, "records": items})

    result.sort(key=lambda g: max(r.get("created_at") or "" for r in g["records"]), reverse=True)
    return {"groups": result, "count": len(result)}


class MergeRecordsBody(BaseModel):
    keep_id: str
    remove_id: str

@api_router.post("/admin/merge-vehicle-records")
async def merge_vehicle_records(body: MergeRecordsBody, u: Dict[str, Any] = Depends(get_current_user)):
    """
    Fusiona dos registros de caseta que son la MISMA unidad fisica pero quedaron
    separados (tipicamente por una confusion de OCR al leer la placa: Z/2, O/0,
    etc.). Todas las inspecciones y el ticket de embarque del registro
    'remove_id' se re-vinculan a 'keep_id', los datos de entrada/salida se
    completan con lo que falte, y el duplicado se elimina.
    """
    if not is_admin(u): raise HTTPException(403)
    if body.keep_id == body.remove_id:
        raise HTTPException(400, "Los dos registros deben ser distintos")

    keep = await db.vehicle_records.find_one({"id": body.keep_id}, {"_id": 0})
    remove = await db.vehicle_records.find_one({"id": body.remove_id}, {"_id": 0})
    if not keep or not remove:
        raise HTTPException(404, "Alguno de los dos registros no existe")

    # 1. Re-vincular inspecciones del duplicado al registro que se conserva
    moved_insp_ids = [i["id"] async for i in db.inspections.find({"record_id": body.remove_id}, {"_id": 0, "id": 1})]
    if moved_insp_ids:
        await db.inspections.update_many({"record_id": body.remove_id}, {"$set": {"record_id": body.keep_id}})

    merged_insp_ids = list(set(
        (keep.get("inspection_ids") or []) + (remove.get("inspection_ids") or []) + moved_insp_ids
    ))
    merged_insp_ids = [x for x in merged_insp_ids if x]

    # 2. Re-vincular ticket(s) de embarque del duplicado
    keep_ticket_id = keep.get("shipping_ticket_id")
    remove_ticket_id = remove.get("shipping_ticket_id")
    final_ticket_id = keep_ticket_id or remove_ticket_id
    has_ticket = bool(keep.get("has_shipping_ticket") or remove.get("has_shipping_ticket") or final_ticket_id)
    # Si el duplicado tenia tickets con su placa propia (sin shipping_ticket_id vinculado),
    # tambien se re-etiquetan para que apunten al registro que se conserva.
    dup_plate = remove.get("entry", {}).get("placas_unidad", "")
    if dup_plate:
        pat = _plate_regex_pattern(dup_plate)
        if pat:
            loose_tickets = await db.shipping_tickets.find(
                {"placas_unidad": {"$regex": f".*{pat}.*", "$options": "i"}}, {"_id": 0, "id": 1}
            ).to_list(10)
            if loose_tickets:
                has_ticket = True
                if not final_ticket_id:
                    final_ticket_id = loose_tickets[0]["id"]

    # 3. Fusionar entry/exit -- lo que ya tenga 'keep' tiene prioridad, se
    # completa con lo que exista en 'remove' solo para campos vacios/faltantes.
    def _merge_dict(base: Dict[str, Any], extra: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(extra or {})
        out.update({k: v for k, v in (base or {}).items() if v not in (None, "", [], {})})
        return out

    merged_entry = _merge_dict(keep.get("entry") or {}, remove.get("entry") or {})
    merged_exit = _merge_dict(keep.get("exit") or {}, remove.get("exit") or {})

    # 4. Status final -- el mas avanzado de los dos
    order = ["entrada", "inspeccionado", "embarcado", "salida"]
    def _rank(s): return order.index(s) if s in order else 0
    final_status = keep.get("status") if _rank(keep.get("status")) >= _rank(remove.get("status")) else remove.get("status")
    if merged_exit:
        final_status = "salida"
    elif has_ticket and _rank(final_status) < _rank("embarcado"):
        final_status = "embarcado"
    elif merged_insp_ids and _rank(final_status) < _rank("inspeccionado"):
        final_status = "inspeccionado"

    update_doc = {
        "entry": merged_entry,
        "inspection_ids": merged_insp_ids,
        "inspection_id": merged_insp_ids[-1] if merged_insp_ids else keep.get("inspection_id"),
        "shipping_ticket_id": final_ticket_id,
        "has_shipping_ticket": has_ticket,
        "status": final_status,
    }
    if merged_exit:
        update_doc["exit"] = merged_exit

    await db.vehicle_records.update_one({"id": body.keep_id}, {"$set": update_doc})
    await db.vehicle_records.delete_one({"id": body.remove_id})

    logger.info(f"Fusion de registros: {body.remove_id} ({dup_plate}) -> {body.keep_id} por {u.get('email')}")

    return {
        "ok": True,
        "kept_id": body.keep_id,
        "removed_id": body.remove_id,
        "moved_inspections": len(moved_insp_ids),
        "final_status": final_status,
        "has_shipping_ticket": has_ticket,
    }


@api_router.post("/admin/repair-links")
async def repair_links(background_tasks: BackgroundTasks, u: Dict[str, Any] = Depends(get_current_user)):
    """
    Inicia una reconstrucción y sincronización masiva en segundo plano.
    Evita el error de Timeout procesando los datos sin fotos y delegando
    la tarea pesada a un hilo de background.
    """
    if not is_admin(u): raise HTTPException(403)

    async def _do_work():
        logger.info("ADMIN: Iniciando tarea de background para REPARACIÓN Y RESINC...")
        try:
            # 1. Obtener datos proyectando fuera las fotos para velocidad
            proj = {"_id": 0, "entry.foto_frente_unidad": 0, "entry.foto_atras_caja": 0, "entry.foto_id_chofer": 0, "entry.firma_operador": 0, "exit.sello_vvtt_foto": 0, "exit.firma_guardia": 0, "inspector_firma": 0, "guard_signature": 0, "foto_inicio_carga": 0, "foto_media_carga": 0, "foto_final_carga": 0, "firma_almacenista": 0}

            all_insps = await db.inspections.find({}, proj).to_list(10000)
            all_tickets = await db.shipping_tickets.find({}, proj).to_list(10000)
            all_records = await db.vehicle_records.find({}, proj).to_list(10000)

            # Mapas para vinculacion rapida
            def norm(p): return _canon_plate(p)

            # 2. Reconstruir registros faltantes
            existing_plates = {norm(r.get("entry", {}).get("placas_unidad", "")) for r in all_records}
            missing_plates_data = {}

            for insp in all_insps:
                p = insp.get("placas_unidad", "").strip().upper()
                nm = norm(p)
                if nm and nm not in existing_plates:
                    missing_plates_data[nm] = {"p": p, "date": insp.get("created_at"), "company": insp.get("compania_transportista"), "box": insp.get("numero_trailer"), "sello": insp.get("numero_precinto"), "driver": insp.get("inspector_nombre")}

            for tick in all_tickets:
                p = tick.get("placas_unidad", "").strip().upper()
                nm = norm(p)
                if nm and nm not in existing_plates:
                    if nm not in missing_plates_data:
                        missing_plates_data[nm] = {"p": p, "date": tick.get("created_at"), "company": tick.get("linea_transporte"), "box": tick.get("numero_caja"), "sello": tick.get("numero_sello"), "driver": tick.get("operador")}

            for nm, data in missing_plates_data.items():
                rid = str(uuid.uuid4())
                await db.vehicle_records.insert_one({
                    "id": rid, "user_id": u["id"], "status": "inspeccionado", "created_at": data["date"],
                    "entry": {"tipo_unidad": "sencillo", "placas_unidad": data["p"], "chofer_nombre": data["driver"] or "HISTÓRICO", "compania_transporte": data["company"] or "", "numero_caja": data["box"] or "", "sello_entrada": data["sello"] or "", "guardia_caseta_nombre": "RECONSTRUIDO", "fecha_entrada": data["date"]}
                })
                existing_plates.add(nm)

            # 3. Re-vincular y RESINCRONIZAR AL SHEET
            records = await db.vehicle_records.find({}, proj).to_list(10000)
            for r in records:
                # Actualizar vinculos internos
                updated_r = await _ensure_record_links(r)
                # Forzar sincronizacion al sheet con el formato nuevo corregido
                await sync_to_google_sheets("entrada", updated_r)
                if updated_r.get("exit"):
                    await sync_to_google_sheets("salida", updated_r)

            logger.info(f"ADMIN: Tarea finalizada. Procesados {len(records)} registros.")
        except Exception as e:
            logger.error(f"ADMIN: Error en tarea de reparación: {e}")

    background_tasks.add_task(_do_work)
    return {"status": "started", "message": "Proceso de vinculación y sincronización masiva iniciado. Verás los cambios en el Google Sheet gradualmente."}

@api_router.get("/analytics")
async def get_analytics(u: Dict[str, Any] = Depends(get_current_user), date_from: Optional[str] = None, date_to: Optional[str] = None):
    if u["role"] not in ["supervisor", "admin"] and not is_admin(u):
        raise HTTPException(403, "Acceso restringido a supervisores")

    filt = {}
    if date_from or date_to:
        date_filt = {}
        if date_from: date_filt["$gte"] = date_from
        if date_to: date_filt["$lte"] = date_to
        filt["created_at"] = date_filt

    insps = await db.inspections.find(filt).to_list(10000)
    total = len(insps)
    if total == 0:
        return {
            "total": 0, "approval_rate_pct": 0,
            "approval_breakdown": {"pendiente": 0, "aprobada": 0, "rechazada": 0},
            "status_breakdown": {"bueno": 0, "malo": 0},
            "by_inspector": [], "top_failed_points": []
        }

    appr = {"pendiente": 0, "aprobada": 0, "rechazada": 0}
    stat = {"bueno": 0, "malo": 0}
    inspectors = {} # name -> {total, fallas, aprobadas, rechazadas}
    failed_points = {} # point_name -> count

    for i in insps:
        a_status = i.get("approval_status", "pendiente")
        appr[a_status] = appr.get(a_status, 0) + 1

        s_gen = i.get("status_general", "bueno")
        stat[s_gen] = stat.get(s_gen, 0) + 1

        name = i.get("inspector_nombre", "Desconocido")
        if name not in inspectors:
            inspectors[name] = {"name": name, "total": 0, "fallas": 0, "aprobadas": 0, "rechazadas": 0}

        inspectors[name]["total"] += 1
        if s_gen == "malo": inspectors[name]["fallas"] += 1
        if a_status == "aprobada": inspectors[name]["aprobadas"] += 1
        if a_status == "rechazada": inspectors[name]["rechazadas"] += 1

        for p in i.get("points", []):
            if p.get("estado") == "malo":
                p_name = p.get("name", f"Punto {p.get('number')}")
                failed_points[p_name] = failed_points.get(p_name, 0) + 1

    appr_rate = round((appr["aprobada"] / total) * 100) if total > 0 else 0

    top_failed = [{"name": k, "count": v} for k, v in failed_points.items()]
    top_failed.sort(key=lambda x: x["count"], reverse=True)

    return {
        "total": total,
        "approval_rate_pct": appr_rate,
        "approval_breakdown": appr,
        "status_breakdown": stat,
        "by_inspector": list(inspectors.values()),
        "top_failed_points": top_failed[:10]
    }

# --- Notificaciones ---
@api_router.get("/notifications")
async def list_notifications(u: Dict[str, Any] = Depends(get_current_user)):
    # Los supervisores ven alertas críticas globales, inspectores solo las suyas
    filt = {"$or": [{"user_id": u["id"]}, {"global": True}]}
    notifs = await db.notifications.find(filt, {"_id": 0}).sort("created_at", -1).to_list(100)
    return notifs

@api_router.post("/notifications/{id}/read")
async def mark_read(id: str, u: Dict[str, Any] = Depends(get_current_user)):
    await db.notifications.update_one({"id": id}, {"$set": {"read": True}})
    return {"ok": True}

@api_router.post("/notifications/read-all")
async def read_all(u: Dict[str, Any] = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": u["id"]}, {"$set": {"read": True}})
    return {"ok": True}

@api_router.post("/notifications/read-by-kind")
async def read_by_kind(body: Dict[str, Any], u: Dict[str, Any] = Depends(get_current_user)):
    """Marca como leidas solo las notificaciones de un 'kind' especifico (ej. 'chat'),
    sin tocar el resto -- para que abrir el chat no borre alertas de inspeccion/caseta."""
    kind = body.get("kind")
    if not kind: raise HTTPException(400, "kind requerido")
    await db.notifications.update_many(
        {"$or": [{"user_id": u["id"]}, {"global": True}], "kind": kind},
        {"$set": {"read": True}}
    )
    return {"ok": True}

class UserCreateInspector(BaseModel):
    email: str
    password: str
    name: str
    role: str = "inspector"

class UserUpdateBody(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None

@api_router.get("/users", response_model=List[UserPublic])
async def list_users(u: Dict[str, Any] = Depends(get_current_user)):
    if u.get("role") not in ("admin", "supervisor") and not is_admin(u):
        raise HTTPException(403, "No autorizado")
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(500)
    return [UserPublic(**usr) for usr in users]

@api_router.post("/users/create-inspector", response_model=UserPublic)
async def create_inspector(body: UserCreateInspector, u: Dict[str, Any] = Depends(get_current_user)):
    if not is_admin(u):
        raise HTTPException(403, "Solo administradores pueden crear usuarios")
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(400, "Ya existe un usuario con ese correo")
    pw_hash = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    new_user = {
        "id": str(uuid.uuid4()),
        "email": body.email.lower(),
        "name": body.name,
        "role": body.role,
        "active": True,
        "password_hash": pw_hash,
    }
    await db.users.insert_one(new_user)
    return UserPublic(**{k: v for k, v in new_user.items() if k != "password_hash"})

@api_router.patch("/users/{user_id}", response_model=UserPublic)
async def update_user(user_id: str, body: UserUpdateBody, u: Dict[str, Any] = Depends(get_current_user)):
    if not is_admin(u):
        raise HTTPException(403, "Solo administradores pueden editar usuarios")
    updates: Dict[str, Any] = {}
    if body.name is not None: updates["name"] = body.name
    if body.email is not None: updates["email"] = body.email.lower()
    if body.role is not None: updates["role"] = body.role
    if body.password: updates["password_hash"] = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not updated:
        raise HTTPException(404, "Usuario no encontrado")
    return UserPublic(**updated)

@api_router.post("/users/{user_id}/toggle-active")
async def toggle_user_active(user_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    if not is_admin(u):
        raise HTTPException(403, "Solo administradores pueden cambiar el estado de usuarios")
    if user_id == u.get("id"):
        raise HTTPException(400, "No puedes desactivarte a ti mismo")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "Usuario no encontrado")
    new_status = not target.get("active", True)
    await db.users.update_one({"id": user_id}, {"$set": {"active": new_status}})
    return {"ok": True, "active": new_status}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    if not is_admin(u):
        raise HTTPException(403, "Solo administradores pueden eliminar usuarios")
    if user_id == u.get("id"):
        raise HTTPException(400, "No puedes eliminarte a ti mismo")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Usuario no encontrado")
    return {"ok": True}

@api_router.post("/users/push-token")
async def save_push_token(body: Dict[str, str], u: Dict[str, Any] = Depends(get_current_user)):
    token = body.get("token")
    if token:
        await db.users.update_one({"id": u["id"]}, {"$set": {"push_token": token}})
    return {"ok": True}

# --- Chat (Interno Team Chat) ---
@api_router.get("/users/directory")
async def users_directory(u: Dict[str, Any] = Depends(get_current_user)):
    """Directorio ligero (id, nombre, rol) para @mencionar en el chat. Disponible para cualquier usuario autenticado."""
    users = await db.users.find({"active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1, "role": 1}).sort("name", 1).to_list(500)
    return [x for x in users if x.get("id") != u["id"]]

async def _notify_chat_message(msg: Dict[str, Any]):
    """Alerta de chat: mención directa (@Nombre) con prioridad alta, o mensaje general al resto del equipo."""
    try:
        text = msg.get("text", "")
        room = msg.get("room", "GENERAL")
        sender_id = msg.get("user_id")
        sender_name = msg.get("user_name", "Alguien")
        preview = text if len(text) <= 120 else text[:117] + "..."

        users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
        text_low = text.lower()
        mentioned_ids = []
        for usr in users:
            if usr["id"] == sender_id:
                continue
            nm = (usr.get("name") or "").strip().lower()
            if nm and f"@{nm}" in text_low:
                mentioned_ids.append(usr["id"])

        if mentioned_ids:
            await _insert_notifications(
                mentioned_ids,
                f"🔴 {sender_name} te mencionó en el chat",
                preview,
                chat_room=room, kind="mention", urgent=True
            )

        other_ids = [usr["id"] for usr in users if usr["id"] != sender_id and usr["id"] not in mentioned_ids]
        if other_ids:
            await _insert_notifications(
                other_ids,
                f"💬 {sender_name}",
                preview,
                chat_room=room, kind="chat"
            )
    except Exception as e:
        logger.error(f"Error notificando mensaje de chat: {e}")

@api_router.get("/chat/{room}")
async def get_chat(room: str, u: Dict[str, Any] = Depends(get_current_user)):
    msgs = await db.chat_messages.find({"room": room}).sort("created_at", 1).to_list(200)
    return [{**m, "id": str(m.get("_id"))} for m in msgs]

@api_router.post("/chat/send")
async def send_chat(body: Dict[str, Any], background_tasks: BackgroundTasks, u: Dict[str, Any] = Depends(get_current_user)):
    msg = {
        "id": str(uuid.uuid4()),
        "room": body.get("room", "GENERAL"),
        "user_id": u["id"],
        "user_name": u["name"],
        "text": body.get("text", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.chat_messages.insert_one(msg)
    if "_id" in msg: del msg["_id"]
    background_tasks.add_task(_notify_chat_message, msg.copy())
    return msg

# --- Actividades ---
@api_router.get("/activities")
async def acts(u: Dict[str, Any] = Depends(get_current_user)):
    """Genera una lista de actividades recientes en tiempo real desde los registros reales."""
    activities = []

    # Inspecciones recientes
    insps = await db.inspections.find({}, {
        "id": 1, "placas_unidad": 1, "inspector_nombre": 1,
        "status_general": 1, "approval_status": 1, "created_at": 1, "_id": 0
    }).sort("created_at", -1).to_list(200)
    for insp in insps:
        activities.append({
            "id": insp["id"],
            "type": "inspection",
            "title": f"Inspección: {insp.get('placas_unidad', '-')}",
            "subtitle": insp.get('inspector_nombre', '-'),
            "status": insp.get("status_general", "bueno"),
            "user_name": insp.get("inspector_nombre", "-"),
            "created_at": insp.get("created_at", ""),
        })

    # Casetas recientes
    recs = await db.vehicle_records.find({}, {
        "id": 1, "status": 1, "created_at": 1,
        "entry.placas_unidad": 1, "entry.chofer_nombre": 1,
        "entry.guardia_caseta_nombre": 1, "_id": 0
    }).sort("created_at", -1).to_list(200)
    for rec in recs:
        entry = rec.get("entry", {})
        activities.append({
            "id": rec["id"],
            "type": "caseta",
            "title": f"Caseta: {entry.get('placas_unidad', '-')}",
            "subtitle": entry.get("chofer_nombre", "-"),
            "status": "bueno",
            "user_name": entry.get("guardia_caseta_nombre", "-"),
            "created_at": rec.get("created_at", ""),
        })

    # Tickets de embarque recientes
    tickets = await db.shipping_tickets.find({}, {
        "id": 1, "placas_unidad": 1, "almacenista": 1, "created_at": 1, "_id": 0
    }).sort("created_at", -1).to_list(200)
    for tk in tickets:
        activities.append({
            "id": tk["id"],
            "type": "embarque",
            "title": f"Embarque: {tk.get('placas_unidad', '-')}",
            "subtitle": tk.get("almacenista", "-"),
            "status": "bueno",
            "user_name": tk.get("almacenista", "-"),
            "created_at": tk.get("created_at", ""),
        })

    # Ordenar por fecha desc y limitar a 100
    activities.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return activities[:100]


def _check_admin_or_agent_key(u: Optional[Dict[str, Any]], agent_key: Optional[str]) -> None:
    """Autoriza estos endpoints de mantenimiento de dos formas: (1) un usuario
    admin autenticado normal, o (2) una clave de servicio fija (AGENT_ADMIN_KEY,
    configurada como secreto del Space) para que la automatización programada
    del agente pueda refrescar los tokens de Gmail/Drive cada ~45 min sin
    depender de una sesión de usuario ni del JWT_SECRET real."""
    expected = os.environ.get("AGENT_ADMIN_KEY", "").strip()
    if expected and agent_key and agent_key.strip() == expected:
        return
    if u and is_admin(u):
        return
    raise HTTPException(403)

@api_router.post("/admin/refresh-sheets-token")
async def refresh_sheets_token(
    body: Dict[str, Any],
    x_agent_key: Optional[str] = Header(default=None),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
):
    """
    Permite inyectar el access token de Google Drive/Sheets al entorno del servidor.
    Se llama desde el sandbox (que sí tiene el token OAuth fresco) para mantener
    la sincronización con Google Sheets activa.
    """
    u = None
    if creds:
        try:
            p = pyjwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            u = await db.users.find_one({"id": p.get("sub")}, {"_id": 0, "password_hash": 0})
        except Exception:
            u = None
    _check_admin_or_agent_key(u, x_agent_key)
    token = body.get("token", "").strip()
    if not token: raise HTTPException(400, "Token requerido")
    os.environ["GOOGLEDRIVE_ACCESS_TOKEN"] = token
    # Persistimos en Mongo (no solo en memoria) para que un redeploy/reinicio del
    # Space (que borra os.environ) no deje el backend sin token hasta el
    # siguiente ciclo de la automatizacion (~45 min) -- se recarga en startup.
    await db.system_tokens.update_one(
        {"key": "googledrive_access_token"},
        {"$set": {"value": token, "updated_at": datetime.utcnow().isoformat()}},
        upsert=True,
    )
    logger.info("GOOGLEDRIVE_ACCESS_TOKEN actualizado correctamente (memoria + Mongo)")
    return {"ok": True, "message": "Token inyectado correctamente"}


@api_router.post("/admin/refresh-gmail-token")
async def refresh_gmail_token(
    body: Dict[str, Any],
    x_agent_key: Optional[str] = Header(default=None),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
):
    """
    Permite inyectar el access token de Gmail al entorno del servidor.
    Se llama desde el sandbox (que sí tiene el token OAuth fresco, auto-refrescado)
    para poder enviar correos vía la API de Gmail (HTTPS), ya que HuggingFace
    Spaces bloquea los puertos SMTP salientes.
    """
    u = None
    if creds:
        try:
            p = pyjwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            u = await db.users.find_one({"id": p.get("sub")}, {"_id": 0, "password_hash": 0})
        except Exception:
            u = None
    _check_admin_or_agent_key(u, x_agent_key)
    token = body.get("token", "").strip()
    if not token: raise HTTPException(400, "Token requerido")
    os.environ["GMAIL_ACCESS_TOKEN"] = token
    # Igual que con Drive: se persiste en Mongo para sobrevivir a un
    # redeploy/reinicio del Space sin depender del proximo ciclo (~45 min) de
    # la automatizacion que refresca el token.
    await db.system_tokens.update_one(
        {"key": "gmail_access_token"},
        {"$set": {"value": token, "updated_at": datetime.utcnow().isoformat()}},
        upsert=True,
    )
    logger.info("GMAIL_ACCESS_TOKEN actualizado correctamente (memoria + Mongo)")
    return {"ok": True, "message": "Token inyectado correctamente"}

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware)

@app.on_event("startup")
async def startup_event():
    logger.info("SRIUC Backend Iniciando...")
    # Recargar los ultimos tokens de Gmail/Drive guardados en Mongo. Esto es lo
    # que evita que un redeploy (que borra os.environ por completo) deje al
    # backend sin poder enviar correos ni sincronizar Sheets/Drive hasta que la
    # automatizacion del agente vuelva a correr (hasta 45 min despues) -- ahora
    # el ultimo token conocido (normalmente todavia valido, dura ~1h) se
    # restaura de inmediato al arrancar.
    try:
        for key, env_name in (("gmail_access_token", "GMAIL_ACCESS_TOKEN"), ("googledrive_access_token", "GOOGLEDRIVE_ACCESS_TOKEN")):
            doc = await db.system_tokens.find_one({"key": key}, {"_id": 0})
            if doc and doc.get("value"):
                os.environ[env_name] = doc["value"]
                logger.info(f"{env_name} restaurado desde Mongo (guardado {doc.get('updated_at', '?')})")
    except Exception as e:
        logger.error(f"Error restaurando tokens desde Mongo al iniciar: {e}")
    # Prueba de vida: Enviar un mini-correo al admin indicando que el servidor reinició.
    # Usa la API de Gmail (HTTPS) — SMTP directo no funciona en HuggingFace Spaces
    # porque el contenedor bloquea los puertos salientes 25/465/587.
    try:
        if os.environ.get("GMAIL_ACCESS_TOKEN"):
            sender_email = os.environ.get("SMTP_USER", "d4r005@gmail.com")
            dest = os.environ.get("REPORT_RECIPIENT", "d.trujillo@brancoindustries.com")
            msg = MIMEText(f"El servidor SRIUC en Hugging Face ha reiniciado correctamente a las {datetime.now().isoformat()}. Las tareas de background están activas.")
            msg["Subject"] = "SISTEMA ONLINE - SRIUC"
            msg["From"] = sender_email
            msg["To"] = dest
            await asyncio.to_thread(_sync_send_via_gmail_api, sender_email, msg)
            logger.info("Correo de notificación de inicio enviado (Gmail API).")
        else:
            logger.info("Notificación de inicio omitida: GMAIL_ACCESS_TOKEN aún no configurado.")
    except Exception as e:
        logger.error(f"Error enviando notificación de inicio: {e}")

@app.on_event("shutdown")
async def shutdown_db_client(): client.close()
