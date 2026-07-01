from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query, File, UploadFile, BackgroundTasks
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
from PIL import Image, ImageDraw, ImageFont

# Configuración de Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("SRIUC-CORE")

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url, maxPoolSize=50)
db = client[os.environ.get('DB_NAME', 'ctpat')]

JWT_SECRET = os.environ.get('JWT_SECRET', 'naf-secret')
JWT_ALGORITHM = 'HS256'
security = HTTPBearer()

# ========== Modelos de Datos ==========

class UserLogin(BaseModel):
    email: str
    password: str

class UserRegister(BaseModel):
    email: str
    password: str
    name: str
    role: str = "inspector"

class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    role: str
    active: bool = True

class TokenResponse(BaseModel):
    access_token: str
    user: UserPublic

class EscoltaInfo(BaseModel):
    presente: bool = False
    compania: str = ""
    unidad: str = ""
    placas: str = ""

class VehicleEntry(BaseModel):
    tipo_unidad: str = "sencillo"
    sucursal: str = ""
    direccion: str = ""
    licencia_conductor: str = ""
    placas_unidad: str
    chofer_nombre: str
    compania_transporte: str = ""
    numero_tractor: str = ""
    compania_caja: str = ""
    numero_caja: str = ""
    placas_caja: str = ""
    sello_entrada: str = ""
    compania_caja_2: str = ""
    numero_caja_2: str = ""
    sello_entrada_2: str = ""
    escolta: EscoltaInfo = EscoltaInfo()
    cortina_asignada: str = ""
    guardia_caseta_nombre: str
    condicion_carga: str = ""
    descripcion_carga: str = ""
    numero_guia: str = ""
    numero_requerimiento: str = ""
    orden_compra: bool = False
    numero_orden_compra: str = ""
    destino: str = ""
    foto_frente_unidad: str = ""
    foto_atras_caja: str = ""
    foto_atras_caja_2: str = ""
    foto_id_chofer: str = ""
    firma_operador: str = ""
    declaraciones_aceptadas: bool = False
    fecha_entrada: Optional[str] = None

class VehicleExit(BaseModel):
    hora_apertura_cortina: str = ""
    hora_cierre_cortina: str = ""
    cortina_salida: str = ""
    sello_salida: str = ""
    sello_salida_2: str = ""
    condicion_salida: str = ""
    destino: str = ""
    numero_tractor_salida: str = ""
    numero_caja_salida: str = ""
    numero_caja_salida_2: str = ""
    escolta: EscoltaInfo = EscoltaInfo()
    pallets: str = ""
    cajas: str = ""
    bultos: str = ""
    sello_vvtt_estado: str = ""
    sello_vvtt_estado_2: str = ""
    sello_vvtt_foto: str = ""
    sello_vvtt_foto_2: str = ""
    guardia_salida_nombre: str = ""
    firma_guardia: str = ""
    fecha_salida: Optional[str] = None

class VehicleRecord(BaseModel):
    id: str
    user_id: str
    status: str
    entry: VehicleEntry
    exit: Optional[VehicleExit] = None
    inspection_id: Optional[str] = None
    inspection_ids: List[str] = []
    shipping_ticket_id: Optional[str] = None
    has_shipping_ticket: bool = False
    created_at: str

class InspectionPoint(BaseModel):
    number: int
    name: str
    estado: str
    comentarios: str = ""
    photo: str = ""

class Measures(BaseModel):
    alto: str = ""
    ancho: str = ""
    largo: str = ""
    capacidad: str = ""

class InspectionCreate(BaseModel):
    inspection_type: str = ""
    compania_transportista: str = ""
    placas_unidad: str = ""
    numero_trailer: str = ""
    numero_precinto: str = ""
    sello_alta_seguridad: str = ""
    sello_verificado: bool = False
    points: List[InspectionPoint] = []
    actividad_sospechosa: str = ""
    inspector_nombre: str = ""
    inspector_firma: str = ""
    record_id: Optional[str] = None
    # Nuevos campos
    box_type: str = ""
    measures: Optional[Measures] = None
    guard_name: str = ""
    guard_signature: str = ""

class Inspection(BaseModel):
    id: str
    user_id: str = ""
    created_at: str = ""
    inspection_type: str = ""
    compania_transportista: str = ""
    placas_unidad: str = ""
    numero_trailer: str = ""
    numero_precinto: str = ""
    sello_alta_seguridad: str = ""
    sello_verificado: bool = False
    status_general: str = "bueno"
    approval_status: str = "pendiente"
    approval_note: str = ""
    approved_by: str = ""
    approved_by_name: str = ""
    approved_by_signature: str = ""
    approved_sig: str = ""
    approved_at: str = ""
    inspector_nombre: str = ""
    inspector_firma: str = ""
    fecha_hora: str = ""
    actividad_sospechosa: str = ""
    points: List[InspectionPoint] = []
    record_id: Optional[str] = None
    # Nuevos campos
    box_type: str = ""
    measures: Optional[Measures] = None
    guard_name: str = ""
    guard_signature: str = ""

class ShippingTicketCreate(BaseModel):
    almacenista: str
    cliente: str = ""
    operador: str = ""
    linea_transporte: str = ""
    numero_economico: str = ""
    placas_unidad: str
    numero_caja: str = ""
    numero_pallets: str = ""
    numero_sello: str = ""
    observaciones: str = ""
    foto_inicio_carga: str = ""
    foto_media_carga: str = ""
    foto_final_carga: str = ""
    firma_almacenista: str = ""
    firma_guardia: str = ""
    nombre_guardia: str = ""
    record_id: Optional[str] = None

class ApprovalBody(BaseModel):
    note: str
    name: str
    signature: str

class SendReportEmailBody(BaseModel):
    record_id: str
    extra_emails: List[str] = []

# ========== Ayudantes y Utilidades ==========

def ensure_clean_image(b64: str) -> str:
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
        img.thumbnail((1200, 1200))
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=75)
        return f"data:image/jpeg;base64,{base64.b64encode(out.getvalue()).decode()}"
    except: return b64

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

async def _ensure_record_links(record: Dict[str, Any]) -> Dict[str, Any]:
    if not record: return record
    placas = record.get("entry", {}).get("placas_unidad", "").strip().upper()
    if not placas: return record
    pl_norm = re.sub(r'[^A-Z0-9]', '', placas)
    if not pl_norm: return record

    try:
        regex = ".*".join(list(pl_norm))
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

def is_admin(user: Dict[str, Any]) -> bool:
    admins = ["d.trujillo@brancoindustries.com", "d4r005@gmail.com"]
    return user.get("email") in admins or user.get("role") == "admin"

# --- Helpers de notificaciones (alertas de seguimiento del proceso) ---
async def _insert_notifications(user_ids: List[str], title: str, message: str, **extra):
    """Inserta una notificación individual por cada user_id (evita auto-notificar duplicados)."""
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

app = FastAPI(); api_router = APIRouter(prefix="/api")

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
    docs = await db.vehicle_records.find(filt, {"_id": 0}).sort("created_at", -1).to_list(2000)

    # Enriquecer con vínculos (inspection_ids, shipping_ticket_id) en batch
    # para que el ProcessTracker del frontend sea preciso sin llamadas adicionales
    all_insps = await db.inspections.find({}, {"_id": 0, "id": 1, "placas_unidad": 1, "record_id": 1}).to_list(5000)
    all_tickets = await db.shipping_tickets.find({}, {"_id": 0, "id": 1, "placas_unidad": 1, "record_id": 1}).to_list(5000)

    # Índice por placas normalizadas
    def norm(s): return re.sub(r"[^A-Z0-9]", "", (s or "").upper())

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
async def update_record(rec_id: str, body: Dict[str, Any], u: Dict[str, Any] = Depends(get_current_user)):
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

    # Limpiar fotos base64 nuevas antes de fusionar
    if "entry" in body and body["entry"]:
        for f in ["foto_frente_unidad", "foto_atras_caja", "foto_atras_caja_2", "foto_id_chofer", "firma_operador"]:
            if body["entry"].get(f) and str(body["entry"][f]).startswith("data:image"):
                body["entry"][f] = ensure_clean_image(body["entry"][f])
        merged_entry = {**existing.get("entry", {}), **body["entry"]}
        body["entry"] = merged_entry

    if "exit" in body and body["exit"]:
        for f in ["sello_vvtt_foto", "sello_vvtt_foto_2", "firma_guardia"]:
            if body["exit"].get(f) and str(body["exit"][f]).startswith("data:image"):
                body["exit"][f] = ensure_clean_image(body["exit"][f])
        merged_exit = {**(existing.get("exit") or {}), **body["exit"]}
        body["exit"] = merged_exit

    await db.vehicle_records.update_one({"id": rec_id}, {"$set": body})
    return {"ok": True}

@api_router.delete("/vehicle-records/{rec_id}")
async def delete_record(rec_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    if not is_admin(u): raise HTTPException(403)
    await db.vehicle_records.delete_one({"id": rec_id})
    return {"ok": True}


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
        pl = re.sub(r"[^A-Z0-9]", "", placas.upper())
        if pl:
            inspections = await db.inspections.find(
                {"placas_unidad": {"$regex": pl, "$options": "i"}},
                {"_id": 0}).sort("created_at", -1).to_list(10)
    ticket = None
    if rec.get("shipping_ticket_id"):
        ticket = await db.shipping_tickets.find_one({"id": rec["shipping_ticket_id"]}, {"_id": 0})
    if not ticket and placas:
        pl = re.sub(r"[^A-Z0-9]", "", placas.upper())
        if pl:
            ticket = await db.shipping_tickets.find_one(
                {"placas_unidad": {"$regex": pl, "$options": "i"}},
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
    if not d: return "-"
    try:
        dt = datetime.fromisoformat(str(d).replace("Z", "+00:00"))
        return dt.strftime("%d/%m/%Y %H:%M")
    except Exception:
        return str(d)


def _resolve_src_to_b64(src: str) -> str:
    """Convierte cualquier src de imagen a data URI base64 para embeber en correo HTML."""
    if not src:
        return ""
    if src.startswith("data:image"):
        return src
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
                        ct = r.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
                        return "data:" + ct + ";base64," + base64.b64encode(r.content).decode()
        r = requests.get(src, timeout=15)
        if r.status_code == 200:
            ct = r.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
            if "image" not in ct:
                ct = "image/jpeg"
            return "data:" + ct + ";base64," + base64.b64encode(r.content).decode()
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
    return (
        '<div style="display:inline-block;width:30%;margin:1%;vertical-align:top;'
        'border:1px solid #eee;padding:5px;background:#FFF;text-align:center;">'
        '<p style="margin:0 0 4px 0;font-size:7px;font-weight:bold;color:#666;text-transform:uppercase;">' + label + "</p>"
        '<img src="' + resolved + '" style="width:100%;height:100px;object-fit:cover;border:1px solid #ddd;" />'
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
        ".hb{background:#0A2540;color:#FFF;text-align:center;padding:16px;margin-bottom:20px;}"
        ".hb h1{margin:0;font-size:18px;letter-spacing:2px;}"
        ".hb p{margin:4px 0 0;font-size:9px;opacity:.85;}"
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
        caseta_rows += (
            th2("DATOS DE SALIDA / 出场数据")
            + tr("Fecha Salida / 出场时间", _sd(ex.get("fecha_salida")))
            + tr("Destino / 目的地", ex.get("destino"))
            + tr("Condición Salida", ex.get("condicion_salida"))
            + tr("Tractor Salida", ex.get("numero_tractor_salida"))
            + tr("Caja Salida", ex.get("numero_caja_salida"))
            + tr("Sello Salida 1", ex.get("sello_salida"))
        )
        if is_full:
            caseta_rows += (
                tr("Caja Salida 2", ex.get("numero_caja_salida_2"))
                + tr("Sello Salida 2", ex.get("sello_salida_2"))
            )
        caseta_rows += (
            tr("Cortina (apertura/cierre)", (ex.get("hora_apertura_cortina") or "-") + " / " + (ex.get("hora_cierre_cortina") or "-"))
            + tr("Cortina Salida", ex.get("cortina_salida"))
            + tr("Pallets / Cajas / Bultos", (ex.get("pallets") or "-") + " / " + (ex.get("cajas") or "-") + " / " + (ex.get("bultos") or "-"))
            + tr("Sello VVTT Estado", (ex.get("sello_vvtt_estado") or "-") + (("  |  Sello VVTT 2: " + ex.get("sello_vvtt_estado_2")) if is_full and ex.get("sello_vvtt_estado_2") else ""))
            + tr("Guardia Salida / 门卫", ex.get("guardia_salida_nombre"))
        )
        fotos_salida = (
            _photo_block(ex.get("sello_vvtt_foto"), "Sello VVTT Salida / VVTT 封条出场")
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
                            '<div style="margin-top:4px;border:1px solid #eee;padding:4px;background:#f9fafb;">'
                            '<img src="' + resolved + '" style="max-height:100px;max-width:240px;object-fit:contain;border:1px solid #ddd;"/>'
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
        '<div class="hb"><h1>REPORTE CONSOLIDADO / 综合报告</h1>'
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
    x = body.dict(); x["fecha_salida"] = datetime.now(timezone.utc).isoformat()
    if x.get("firma_guardia"): x["firma_guardia"] = ensure_clean_image(x["firma_guardia"])
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
        pl = re.sub(r"[^A-Z0-9]", "", (body.placas_unidad or "").upper())
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
    docs = await db.inspections.find(filt, {"_id": 0}).sort("created_at", -1).to_list(2000)
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
    # Limpiar fotos
    if body.get("inspector_firma") and body["inspector_firma"].startswith("data:image"):
        body["inspector_firma"] = ensure_clean_image(body["inspector_firma"])
    if body.get("guard_signature") and body["guard_signature"].startswith("data:image"):
        body["guard_signature"] = ensure_clean_image(body["guard_signature"])
    if body.get("approved_by_signature") and body["approved_by_signature"].startswith("data:image"):
        body["approved_by_signature"] = ensure_clean_image(body["approved_by_signature"])
    if "points" in body:
        for p in body["points"]:
            if p.get("photo") and p["photo"].startswith("data:image"):
                p["photo"] = ensure_clean_image(p["photo"])

    await db.inspections.update_one({"id": insp_id}, {"$set": body})
    return {"ok": True}

@api_router.delete("/inspections/{insp_id}")
async def delete_inspection(insp_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    if not is_admin(u): raise HTTPException(403)
    await db.inspections.delete_one({"id": insp_id})
    return {"ok": True}

@api_router.post("/inspections/{insp_id}/approve", response_model=Inspection)
async def approve_insp(insp_id: str, body: ApprovalBody, u: Dict[str, Any] = Depends(get_current_user)):
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
    else:
        # Auto-vincular por placas si no viene record_id
        pl = re.sub(r"[^A-Z0-9]", "", (body.placas_unidad or "").upper())
        if pl:
            rec_by_plates = await db.vehicle_records.find_one(
                {"entry.placas_unidad": {"$regex": pl, "$options": "i"}, "status": {"$ne": "salida"}},
                sort=[("created_at", -1)]
            )
            if rec_by_plates:
                await db.vehicle_records.update_one(
                    {"id": rec_by_plates["id"]},
                    {"$set": {"shipping_ticket_id": tid, "has_shipping_ticket": True}}
                )
                doc["record_id"] = rec_by_plates["id"]
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
    return await db.shipping_tickets.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)

@api_router.get("/shipping-tickets/{id}")
async def get_ticket(id: str, u: Dict[str, Any] = Depends(get_current_user)):
    d = await db.shipping_tickets.find_one({"id": id}, {"_id": 0})
    if not d: d = await db.shipping_tickets.find_one({"record_id": id}, {"_id": 0})
    if not d: raise HTTPException(404)
    return d

@api_router.put("/shipping-tickets/{id}")
async def update_ticket(id: str, body: Dict[str, Any], u: Dict[str, Any] = Depends(get_current_user)):
    for k in ["_id", "id", "user_id", "created_at"]:
        if k in body: del body[k]
    for f in ["firma_almacenista", "firma_guardia", "foto_inicio_carga", "foto_media_carga", "foto_final_carga"]:
        if body.get(f) and body[f].startswith("data:image"): body[f] = ensure_clean_image(body[f])
    await db.shipping_tickets.update_one({"id": id}, {"$set": body})
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
                    key_entrada,                        # Col A: ID Registro / Unique Key
                    data.get("inspection_id", ""),      # Col B: ID Inspección
                    data.get("shipping_ticket_id", ""), # Col C: ID Embarque
                    data.get("created_at", ""),         # Col D: Fecha
                    "ENTRADA",                          # Col E: Proceso
                    entry.get("placas_unidad", ""),
                    entry.get("chofer_nombre", ""),
                    entry.get("compania_transporte", ""),
                    entry.get("numero_tractor", ""),
                    entry.get("numero_caja", ""),
                    entry.get("sello_entrada", ""),
                    entry.get("destino", ""),
                    entry.get("guardia_caseta_nombre", ""),
                    entry.get("cortina_asignada", ""),
                    entry.get("licencia_conductor", ""),
                    entry.get("condicion_carga", ""),
                ]
                await _sheet_append_via_api(hoja, row, key_entrada)
                logger.info(f"Sheets ENTRADA registrada: {entry.get('placas_unidad')}")

            elif tipo == "salida" and ex and key_salida not in existing:
                row = [
                    key_salida,                         # Col A: ID Registro / Unique Key
                    data.get("inspection_id", ""),      # Col B: ID Inspección
                    data.get("shipping_ticket_id", ""), # Col C: ID Embarque
                    ex.get("fecha_salida", data.get("created_at", "")), # Col D: Fecha
                    "SALIDA",                           # Col E: Proceso
                    entry.get("placas_unidad", ""),
                    entry.get("chofer_nombre", ""),
                    "",
                    "",
                    ex.get("numero_caja_salida", entry.get("numero_caja", "")),
                    ex.get("sello_salida", ""),
                    ex.get("destino", entry.get("destino", "")),
                    ex.get("guardia_salida_nombre", ""),
                    ex.get("cortina_salida", ""),
                    "",
                    ex.get("condicion_salida", ""),
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

            def pt(n): return pts.get(n, {}).get("estado", "-")

            if is_19:
                row = [
                    insp_id,                            # Col A: ID Inspección / Unique Key
                    data.get("record_id", ""),          # Col B: ID Registro
                    data.get("shipping_ticket_id", ""), # Col C: ID Embarque
                    data.get("created_at", ""),         # Col D: Fecha
                    "INSPECCION_19",                    # Col E: Proceso
                    data.get("placas_unidad", ""),
                    data.get("inspector_nombre", ""),
                    data.get("status_general", ""),
                    str(sum(1 for p in pts.values() if p.get("estado") == "malo")),
                    data.get("approval_status", ""),
                    data.get("approved_by_name", ""),
                    pt(1), pt(2), pt(3), pt(4), pt(5), pt(6), pt(7), pt(8), pt(9),
                    pt(10), pt(11), pt(12), pt(13), pt(14), pt(15), pt(16), pt(17), pt(18), pt(19)
                ]
            else:
                row = [
                    insp_id,                            # Col A: ID Inspección / Unique Key
                    data.get("record_id", ""),          # Col B: ID Registro
                    data.get("shipping_ticket_id", ""), # Col C: ID Embarque
                    data.get("created_at", ""),         # Col D: Fecha
                    "INSPECCION_9",                     # Col E: Proceso
                    data.get("placas_unidad", ""),
                    data.get("inspector_nombre", ""),
                    data.get("status_general", ""),
                    str(sum(1 for p in pts.values() if p.get("estado") == "malo")),
                    data.get("approval_status", ""),
                    data.get("approved_by_name", ""),
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
                tid,                                # Col A: ID Embarque / Unique Key
                data.get("record_id", ""),          # Col B: ID Registro
                data.get("inspection_id", ""),      # Col C: ID Inspección
                data.get("created_at", ""),         # Col D: Fecha
                "EMBARQUE",                         # Col E: Proceso
                data.get("placas_unidad", ""),
                data.get("cliente", ""),
                data.get("almacenista", ""),
                data.get("operador", ""),
                data.get("linea_transporte", ""),
                data.get("numero_caja", ""),
                data.get("numero_pallets", ""),
                data.get("numero_sello", ""),
                data.get("nombre_guardia", ""),
                data.get("observaciones", ""),
                data.get("area", ""),
            ]
            await _sheet_append_via_api(hoja, row, tid)
            logger.info(f"Sheets embarque registrado: {data.get('placas_unidad')}")

    except Exception as e:
        logger.error(f"sync_to_google_sheets [{tipo}] error: {e}")

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
            pl_norm = re.sub(r"[^A-Z0-9]", "", plates)
            regex = ".*".join(list(pl_norm))
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
            pl_norm = re.sub(r"[^A-Z0-9]", "", plates)
            regex = ".*".join(list(pl_norm))
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
@api_router.post("/admin/repair-links")
async def repair_links(u: Dict[str, Any] = Depends(get_current_user)):
    if not is_admin(u): raise HTTPException(403)

    logger.info("Iniciando RECONSTRUCCIÓN TOTAL desde Inspecciones y Tickets...")

    # 1. Obtener toda la data existente
    all_insps = await db.inspections.find({}, {"_id": 0}).to_list(5000)
    all_tickets = await db.shipping_tickets.find({}, {"_id": 0}).to_list(5000)
    all_records = await db.vehicle_records.find({}, {"_id": 0}).to_list(5000)

    existing_plates = {re.sub(r'[^A-Z0-9]', '', r.get("entry", {}).get("placas_unidad", "")).upper() for r in all_records}

    created_count = 0

    # Recolectar todas las placas que aparecen en inspecciones o tickets pero no en registros
    missing_plates_data = {} # norm_plates -> {plates, type, date, data}

    for insp in all_insps:
        p = insp.get("placas_unidad", "").strip().upper()
        norm = re.sub(r'[^A-Z0-9]', '', p)
        if norm and norm not in existing_plates:
            if norm not in missing_plates_data:
                missing_plates_data[norm] = {"p": p, "date": insp.get("created_at"), "company": insp.get("compania_transportista"), "box": insp.get("numero_trailer"), "sello": insp.get("numero_precinto"), "driver": insp.get("inspector_nombre")}

    for tick in all_tickets:
        p = tick.get("placas_unidad", "").strip().upper()
        norm = re.sub(r'[^A-Z0-9]', '', p)
        if norm and norm not in existing_plates:
            if norm not in missing_plates_data:
                missing_plates_data[norm] = {"p": p, "date": tick.get("created_at"), "company": tick.get("linea_transporte"), "box": tick.get("numero_caja"), "sello": tick.get("numero_sello"), "driver": tick.get("operador")}

    for norm, data in missing_plates_data.items():
        rid = str(uuid.uuid4())
        new_record = {
            "id": rid,
            "user_id": u["id"],
            "status": "inspeccionado",
            "created_at": data["date"],
            "entry": {
                "tipo_unidad": "sencillo",
                "placas_unidad": data["p"],
                "chofer_nombre": data["driver"] or "HISTÓRICO",
                "compania_transporte": data["company"] or "",
                "numero_caja": data["box"] or "",
                "sello_entrada": data["sello"] or "",
                "guardia_caseta_nombre": "RECONSTRUIDO",
                "fecha_entrada": data["date"]
            }
        }
        await db.vehicle_records.insert_one(new_record)
        existing_plates.add(norm)
        created_count += 1

    # Ahora re-vincular todo (incluyendo los nuevos)
    records = await db.vehicle_records.find().to_list(5000)
    for r in records:
        await _ensure_record_links(r)

    return {"status": "success", "reconstructed": created_count, "total_records": len(records)}

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
    notifs = await db.notifications.find(filt).sort("created_at", -1).to_list(100)
    return [{**n, "id": str(n.get("id", n.get("_id")))} for n in notifs]

@api_router.post("/notifications/{id}/read")
async def mark_read(id: str, u: Dict[str, Any] = Depends(get_current_user)):
    await db.notifications.update_one({"id": id}, {"$set": {"read": True}})
    return {"ok": True}

@api_router.post("/notifications/read-all")
async def read_all(u: Dict[str, Any] = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": u["id"]}, {"$set": {"read": True}})
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
    insps = await db.inspections.find({}, {"_id": 0,
        "id": 1, "placas_unidad": 1, "inspector_nombre": 1,
        "status_general": 1, "approval_status": 1, "created_at": 1
    }).sort("created_at", -1).to_list(200)
    for insp in insps:
        activities.append({
            "id": insp["id"],
            "type": "inspection",
            "title": f"Inspección: {insp.get('placas_unidad', '-')}",
            "subtitle": insp.get("inspector_nombre", "-"),
            "status": insp.get("status_general", "bueno"),
            "user_name": insp.get("inspector_nombre", "-"),
            "created_at": insp.get("created_at", ""),
        })

    # Casetas recientes
    recs = await db.vehicle_records.find({}, {"_id": 0,
        "id": 1, "status": 1, "created_at": 1,
        "entry.placas_unidad": 1, "entry.chofer_nombre": 1,
        "entry.guardia_caseta_nombre": 1
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
    tickets = await db.shipping_tickets.find({}, {"_id": 0,
        "id": 1, "placas_unidad": 1, "almacenista": 1, "created_at": 1
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


@api_router.post("/admin/refresh-sheets-token")
async def refresh_sheets_token(body: Dict[str, Any], u: Dict[str, Any] = Depends(get_current_user)):
    """
    Permite inyectar el access token de Google Drive/Sheets al entorno del servidor.
    Se llama desde el sandbox (que sí tiene el token OAuth fresco) para mantener
    la sincronización con Google Sheets activa.
    """
    if not is_admin(u): raise HTTPException(403)
    token = body.get("token", "").strip()
    if not token: raise HTTPException(400, "Token requerido")
    os.environ["GOOGLEDRIVE_ACCESS_TOKEN"] = token
    logger.info("GOOGLEDRIVE_ACCESS_TOKEN actualizado correctamente")
    return {"ok": True, "message": "Token inyectado correctamente"}


@api_router.post("/admin/refresh-gmail-token")
async def refresh_gmail_token(body: Dict[str, Any], u: Dict[str, Any] = Depends(get_current_user)):
    """
    Permite inyectar el access token de Gmail al entorno del servidor.
    Se llama desde el sandbox (que sí tiene el token OAuth fresco, auto-refrescado)
    para poder enviar correos vía la API de Gmail (HTTPS), ya que HuggingFace
    Spaces bloquea los puertos SMTP salientes.
    """
    if not is_admin(u): raise HTTPException(403)
    token = body.get("token", "").strip()
    if not token: raise HTTPException(400, "Token requerido")
    os.environ["GMAIL_ACCESS_TOKEN"] = token
    logger.info("GMAIL_ACCESS_TOKEN actualizado correctamente")
    return {"ok": True, "message": "Token inyectado correctamente"}

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware)

@app.on_event("startup")
async def startup_event():
    logger.info("SRIUC Backend Iniciando...")
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
