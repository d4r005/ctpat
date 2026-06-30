from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query, File, UploadFile
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

class InspectionCreate(BaseModel):
    inspection_type: str
    compania_transportista: str
    placas_unidad: str
    numero_trailer: str
    numero_precinto: str
    sello_alta_seguridad: str
    sello_verificado: bool
    points: List[InspectionPoint]
    actividad_sospechosa: str = ""
    inspector_nombre: str
    inspector_firma: str
    record_id: Optional[str] = None

class Inspection(BaseModel):
    id: str
    user_id: str
    created_at: str
    inspection_type: str
    compania_transportista: str = ""
    placas_unidad: str
    numero_trailer: str = ""
    numero_precinto: str = ""
    sello_alta_seguridad: str = ""
    sello_verificado: bool = False
    status_general: str
    approval_status: str = "pendiente"
    approval_note: str = ""
    approved_by: str = ""
    approved_by_name: str = ""
    approved_by_signature: str = ""
    approved_sig: str = ""
    approved_at: str = ""
    inspector_nombre: str = "Admin"
    inspector_firma: str = ""
    fecha_hora: str = ""
    actividad_sospechosa: str = ""
    points: List[InspectionPoint] = []
    record_id: Optional[str] = None

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
        img = Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")
        img.thumbnail((1200, 1200))
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=75)
        return f"data:image/jpeg;base64,{base64.b64encode(out.getvalue()).decode()}"
    except: return b64

def add_watermark(b64: str) -> str:
    if not b64 or not b64.startswith("data:image"): return b64
    try:
        header, data = b64.split(",", 1)
        img = Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")
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

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    try:
        p = pyjwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        u = await db.users.find_one({"id": p.get("sub")}, {"_id": 0, "password_hash": 0})
        if not u: raise HTTPException(401)
        return u
    except: raise HTTPException(401)

# ========== Endpoints de API ==========

app = FastAPI(); api_router = APIRouter(prefix="/api")

import google.generativeai as genai

# Configuración AI
GEMINI_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)
    ai_model = genai.GenerativeModel('gemini-1.5-flash')
else:
    ai_model = None

# ========== Modelos de Datos ==========
class OCRRequest(BaseModel):
    image_b64: str
    context: str # 'entry', 'inspection', 'ticket'

# ========== Ayudantes y Utilidades ==========
async def analyze_document_ai(image_b64: str, context: str) -> Dict[str, Any]:
    if not ai_model:
        return {"error": "AI_NOT_CONFIGURED"}

    # Extraer pura data de la imagen
    if "," in image_b64:
        image_b64 = image_b64.split(",")[1]

    img_data = base64.b64decode(image_b64)

    prompts = {
        "entry": "Extract data from this vehicle entry log. Return JSON: {placas_unidad, chofer_nombre, compania_transporte, numero_tractor, numero_caja, sello_entrada, destino}",
        "inspection": "Extract data from this C-TPAT inspection sheet. Return JSON: {placas_unidad, status_general (bueno/malo), points (list of {number, name, estado (bueno/malo), comentarios})}",
        "ticket": "Extract data from this shipping ticket. Return JSON: {placas_unidad, cliente, operador, numero_caja, numero_pallets, numero_sello}"
    }

    prompt = prompts.get(context, "Extract all readable fields into JSON.")

    try:
        response = ai_model.generate_content([
            prompt,
            {"mime_type": "image/jpeg", "data": img_data}
        ])

        # Extraer el JSON del texto de respuesta (Gemini suele ponerlo entre ```json ... ```)
        text = response.text
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            import json
            return json.loads(json_match.group())
        return {"error": "JSON_NOT_FOUND", "raw": text}
    except Exception as e:
        logger.error(f"Error en AI OCR: {e}")
        return {"error": str(e)}

@api_router.post("/ocr/analyze")
async def ocr_analyze(body: OCRRequest, u: Dict[str, Any] = Depends(get_current_user)):
    """Analiza una foto de un documento físico y devuelve los campos rellenos"""
    data = await analyze_document_ai(body.image_b64, body.context)
    return data

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(body: UserLogin):
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not bcrypt.checkpw(body.password.encode(), u["password_hash"]): raise HTTPException(401, "Credenciales inválidas")
    token = pyjwt.encode({"sub": u["id"], "exp": datetime.now(timezone.utc) + timedelta(days=30)}, JWT_SECRET)
    return TokenResponse(access_token=token, user=UserPublic(**u))

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
async def create_record(body: VehicleEntry, u: Dict[str, Any] = Depends(get_current_user)):
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
    asyncio.create_task(sync_to_google_sheets("entrada", full_doc))
    return VehicleRecord(**full_doc)

@api_router.get("/vehicle-records/{rec_id}", response_model=VehicleRecord)
async def get_record(rec_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    d = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
    if not d: raise HTTPException(404)
    return VehicleRecord(**(await _ensure_record_links(d)))

@api_router.put("/vehicle-records/{rec_id}")
async def update_record(rec_id: str, body: Dict[str, Any], u: Dict[str, Any] = Depends(get_current_user)):
    for k in ["_id", "id", "user_id", "created_at"]:
        if k in body: del body[k]
    # Limpiar fotos
    if "entry" in body:
        for f in ["foto_frente_unidad", "foto_atras_caja", "foto_atras_caja_2", "foto_id_chofer", "firma_operador"]:
            if body["entry"].get(f) and body["entry"][f].startswith("data:image"):
                body["entry"][f] = ensure_clean_image(body["entry"][f])
    if "exit" in body and body["exit"]:
        for f in ["sello_vvtt_foto", "sello_vvtt_foto_2", "firma_guardia"]:
            if body["exit"].get(f) and body["exit"][f].startswith("data:image"):
                body["exit"][f] = ensure_clean_image(body["exit"][f])

    await db.vehicle_records.update_one({"id": rec_id}, {"$set": body})
    return {"ok": True}

@api_router.delete("/vehicle-records/{rec_id}")
async def delete_record(rec_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    if not is_admin(u): raise HTTPException(403)
    await db.vehicle_records.delete_one({"id": rec_id})
    return {"ok": True}


# ========== Email: Reporte Consolidado ==========

async def _build_report_html(record_id: str) -> tuple:
    """
    Construye el HTML del reporte consolidado para un record_id.
    Devuelve (html: str, placas: str) o (None, None) si no se encuentra.
    """
    rec = await db.vehicle_records.find_one({"id": record_id}, {"_id": 0})
    if not rec: return None, None

    placas = rec.get("entry", {}).get("placas_unidad", "")

    # Inspecciones vinculadas
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

    # Ticket
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

    # ── HTML del reporte (inline, compatible con email) ──
    entry = rec.get("entry", {})
    ex    = rec.get("exit", {}) or {}
    first_insp = inspections[0] if inspections else {}
    created_at = rec.get("created_at", "")

    def fmt_date(d):
        try: return datetime.fromisoformat(d).strftime("%d/%m/%Y %H:%M") if d else "-"
        except: return d or "-"

    def sig_img(src_b64):
        if src_b64 and src_b64.startswith("data:image"):
            # Incluir firma solo si es razonablemente pequeña (< 50KB en base64 ~ 68K chars)
            if len(src_b64) < 68000:
                return f'<img src="{src_b64}" style="max-height:50px;max-width:140px;object-fit:contain;" />'
            return '<span style="color:#10B981;font-size:9px;font-weight:bold;">✓ Firma registrada</span>'
        return '<span style="color:#bbb;font-size:9px;">Sin firma</span>'

    def photo_block(url, label):
        if not url:
            return ""
        # Las fotos base64 son muy pesadas para email — solo mostrar si es URL HTTP
        if url.startswith("http"):
            return f'<div style="display:inline-block;width:30%;margin:1%;vertical-align:top;text-align:center;"><p style="margin:0 0 3px 0;font-size:9px;font-weight:bold;color:#444;">{label}</p><img src="{url}" style="width:100%;height:90px;object-fit:cover;border:1px solid #ddd;" /></div>'
        if url.startswith("data:image"):
            return f'<div style="display:inline-block;width:30%;margin:1%;vertical-align:top;text-align:center;padding:8px;border:1px solid #eee;"><p style="margin:0 0 3px 0;font-size:9px;font-weight:bold;color:#444;">{label}</p><p style="font-size:9px;color:#10B981;">📎 Foto registrada en sistema</p></div>'
        return ""

    # Puntos de inspección
    points_rows = ""
    for p in first_insp.get("points", []):
        estado = p.get("estado", "-")
        color  = "#10B981" if estado == "bueno" else "#EF4444" if estado == "malo" else "#6B7280"
        points_rows += f'<tr><td style="padding:3px 6px;border:1px solid #ddd;font-size:9px;">{p.get("number","")}</td><td style="padding:3px 6px;border:1px solid #ddd;font-size:9px;">{p.get("name","")}</td><td style="padding:3px 6px;border:1px solid #ddd;text-align:center;"><span style="color:{color};font-weight:bold;font-size:9px;">{estado.upper()}</span></td><td style="padding:3px 6px;border:1px solid #ddd;font-size:9px;">{p.get("comentarios","")}</td></tr>'

    ticket_html = ""
    if ticket:
        ticket_html = f"""
        <h2 style="background:#0A2540;color:#FFF;padding:8px 12px;font-size:12px;margin:20px 0 8px 0;">3. TICKET DE EMBARQUE</h2>
        <table style="width:100%;border-collapse:collapse;font-size:10px;">
            <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;width:35%;">Cliente</td><td style="padding:4px 8px;border:1px solid #ddd;">{ticket.get("cliente","")}</td><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;width:35%;">Almacenista</td><td style="padding:4px 8px;border:1px solid #ddd;">{ticket.get("almacenista","")}</td></tr>
            <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">Caja</td><td style="padding:4px 8px;border:1px solid #ddd;">{ticket.get("numero_caja","")}</td><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">Pallets</td><td style="padding:4px 8px;border:1px solid #ddd;">{ticket.get("numero_pallets","")}</td></tr>
            <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">Sello Final</td><td style="padding:4px 8px;border:1px solid #ddd;">{ticket.get("numero_sello","")}</td><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">Guardia</td><td style="padding:4px 8px;border:1px solid #ddd;">{ticket.get("nombre_guardia","")}</td></tr>
            <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">Observaciones</td><td colspan="3" style="padding:4px 8px;border:1px solid #ddd;">{ticket.get("observaciones","")}</td></tr>
        </table>
        <div style="margin-top:12px;display:flex;gap:20px;">
            <div style="text-align:center;flex:1;"><div style="height:55px;display:flex;align-items:flex-end;justify-content:center;border-bottom:2px solid #0A2540;margin-bottom:3px;">{sig_img(ticket.get("firma_almacenista",""))}</div><p style="margin:0;font-size:8px;font-weight:bold;">ALMACENISTA</p></div>
            <div style="text-align:center;flex:1;"><div style="height:55px;display:flex;align-items:flex-end;justify-content:center;border-bottom:2px solid #0A2540;margin-bottom:3px;">{sig_img(ticket.get("firma_guardia",""))}</div><p style="margin:0;font-size:8px;font-weight:bold;">GUARDIA</p></div>
        </div>
        """

    fotos_html = "".join([
        photo_block(entry.get("foto_frente_unidad"), "Frente"),
        photo_block(entry.get("foto_atras_caja"), "Atrás"),
        photo_block(entry.get("foto_id_chofer"), "ID Chofer"),
    ])

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>body{{font-family:Arial,sans-serif;font-size:10px;color:#1a1a1a;margin:20px;}}
table{{width:100%;border-collapse:collapse;}}
h2{{font-size:12px;margin:16px 0 6px 0;}}
</style></head><body>
<div style="text-align:center;background:#0A2540;padding:14px;color:#FFF;margin-bottom:16px;">
  <h1 style="margin:0;font-size:16px;letter-spacing:2px;">REPORTE CONSOLIDADO C-TPAT</h1>
  <p style="margin:4px 0 0 0;font-size:10px;">NAF INDUSTRIES · Generado: {fmt_date(datetime.now(timezone.utc).isoformat())}</p>
</div>

<h2 style="background:#0A2540;color:#FFF;padding:8px 12px;font-size:12px;margin:0 0 8px 0;">1. REGISTRO DE CASETA</h2>
<table><tr>
  <td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;width:25%;">Placas</td><td style="padding:4px 8px;border:1px solid #ddd;">{entry.get("placas_unidad","")}</td>
  <td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;width:25%;">Chofer</td><td style="padding:4px 8px;border:1px solid #ddd;">{entry.get("chofer_nombre","")}</td>
</tr><tr>
  <td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">Compañía</td><td style="padding:4px 8px;border:1px solid #ddd;">{entry.get("compania_transporte","")}</td>
  <td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">Tractor</td><td style="padding:4px 8px;border:1px solid #ddd;">{entry.get("numero_tractor","")}</td>
</tr><tr>
  <td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">Caja</td><td style="padding:4px 8px;border:1px solid #ddd;">{entry.get("numero_caja","")}</td>
  <td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">Sello Entrada</td><td style="padding:4px 8px;border:1px solid #ddd;">{entry.get("sello_entrada","")}</td>
</tr><tr>
  <td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">Fecha Entrada</td><td style="padding:4px 8px;border:1px solid #ddd;">{fmt_date(entry.get("fecha_entrada") or created_at)}</td>
  <td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">Fecha Salida</td><td style="padding:4px 8px;border:1px solid #ddd;">{fmt_date(ex.get("fecha_salida",""))}</td>
</tr></table>
<div style="margin-top:12px;text-align:center;">
  <div style="display:inline-block;min-width:150px;text-align:center;">
    <div style="height:55px;display:flex;align-items:flex-end;justify-content:center;border-bottom:2px solid #0A2540;margin-bottom:3px;">{sig_img(entry.get("firma_operador",""))}</div>
    <p style="margin:0;font-size:8px;font-weight:bold;">OPERADOR / {entry.get("chofer_nombre","")}</p>
  </div>
</div>
{f'<div style="margin-top:10px;">{fotos_html}</div>' if fotos_html else ""}

<h2 style="background:#0A2540;color:#FFF;padding:8px 12px;font-size:12px;margin:20px 0 8px 0;">2. INSPECCIÓN C-TPAT</h2>
{"".join([f'<p style="font-size:10px;margin:4px 0;"><b>Tipo:</b> {ins.get("inspection_type","")} &nbsp; <b>Inspector:</b> {ins.get("inspector_nombre","")} &nbsp; <b>Resultado:</b> <span style="color:{"#10B981" if ins.get("status_general")=="bueno" else "#EF4444"};font-weight:bold;">{ins.get("status_general","").upper()}</span></p>' for ins in inspections] or ['<p style="color:#888;">Sin inspecciones vinculadas</p>'])}
<table style="margin-top:6px;">
  <thead><tr style="background:#F3F4F6;"><th style="padding:4px 6px;border:1px solid #ddd;font-size:9px;">#</th><th style="padding:4px 6px;border:1px solid #ddd;font-size:9px;text-align:left;">Punto</th><th style="padding:4px 6px;border:1px solid #ddd;font-size:9px;">Estado</th><th style="padding:4px 6px;border:1px solid #ddd;font-size:9px;text-align:left;">Comentarios</th></tr></thead>
  <tbody>{points_rows}</tbody>
</table>
{"".join([f'<div style="margin-top:8px;display:inline-block;min-width:150px;text-align:center;margin-right:20px;"><div style="height:55px;display:flex;align-items:flex-end;justify-content:center;border-bottom:2px solid #0A2540;margin-bottom:3px;">{sig_img(ins.get("inspector_firma",""))}</div><p style="margin:0;font-size:8px;font-weight:bold;">INSPECTOR / {ins.get("inspector_nombre","")}</p></div>' for ins in inspections])}

{ticket_html}

</body></html>"""
    return html, placas


async def send_report_email(record_id: str, extra_emails: List[str] = []):
    """
    Envía el reporte consolidado por correo.
    Siempre incluye REPORT_RECIPIENT + los extra_emails opcionales.
    """
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")
    default_recipient = os.environ.get("REPORT_RECIPIENT", "d.trujillo@brancoindustries.com")

    if not smtp_user or not smtp_pass:
        logger.error("send_report_email: credenciales SMTP no configuradas")
        return False, "Credenciales SMTP no configuradas"

    html, placas = await _build_report_html(record_id)
    if not html:
        return False, "Registro no encontrado"

    # Lista de destinatarios única
    all_recipients = list({default_recipient.lower()} | {e.strip().lower() for e in extra_emails if e.strip()})

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Reporte CTPAT - Unidad {placas} - {datetime.now().strftime('%d/%m/%Y %H:%M')}"
        msg["From"]    = smtp_user
        msg["To"]      = ", ".join(all_recipients)
        msg.attach(MIMEText(html, "html"))

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: _sync_send_email(smtp_host, smtp_port, smtp_user, smtp_pass, all_recipients, msg))
        logger.info(f"Reporte enviado a {all_recipients} para unidad {placas}")
        return True, f"Reporte enviado a {len(all_recipients)} destinatario(s)"
    except Exception as e:
        logger.error(f"Error enviando email: {e}")
        return False, str(e)


def _sync_send_email(host, port, user, password, recipients, msg):
    """Envío SMTP síncrono (se ejecuta en executor)."""
    import smtplib
    with smtplib.SMTP(host, port) as s:
        s.ehlo()
        s.starttls()
        s.login(user, password)
        s.sendmail(user, recipients, msg.as_string())

@api_router.patch("/vehicle-records/{rec_id}/exit", response_model=VehicleRecord)
async def exit_record(rec_id: str, body: VehicleExit, u: Dict[str, Any] = Depends(get_current_user)):
    x = body.dict(); x["fecha_salida"] = datetime.now(timezone.utc).isoformat()
    if x.get("firma_guardia"): x["firma_guardia"] = ensure_clean_image(x["firma_guardia"])
    await db.vehicle_records.update_one({"id": rec_id}, {"$set": {"exit": x, "status": "salida"}})
    up = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
    # Sincronizar salida automáticamente al sheet
    if up: asyncio.create_task(sync_to_google_sheets("salida", up))
    # Enviar reporte automático por correo si el proceso está completo
    if up:
        has_inspection = bool(up.get("inspection_id") or up.get("inspection_ids"))
        has_ticket     = bool(up.get("shipping_ticket_id"))
        if has_inspection and has_ticket:
            asyncio.create_task(send_report_email(rec_id))
            logger.info(f"Reporte automático disparado para record {rec_id}")
        else:
            logger.info(f"Salida registrada para {rec_id} pero proceso incompleto (insp={has_inspection}, ticket={has_ticket}) — email omitido")
    return VehicleRecord(**up)

# --- Inspecciones ---
@api_router.post("/inspections", response_model=Inspection)
async def create_inspection(body: InspectionCreate, u: Dict[str, Any] = Depends(get_current_user)):
    iid = str(uuid.uuid4()); doc = body.dict()
    doc.update({
        "id": iid, "user_id": u["id"], "created_at": datetime.now(timezone.utc).isoformat(),
        "status_general": "malo" if any(p.estado == "malo" for p in body.points) else "bueno",
        "approval_status": "pendiente"
    })
    doc["inspector_firma"] = ensure_clean_image(doc.get("inspector_firma", ""))
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
    asyncio.create_task(sync_to_google_sheets("inspeccion", doc))

    # Notificar si hay fallas (alerta global para supervisores)
    if doc["status_general"] == "malo":
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()), "user_id": u["id"], "global": True, "read": False,
            "title": f"FALLA: {body.placas_unidad}",
            "message": f"Inspección con fallas reportada por {u['name']}.",
            "inspection_id": iid, "created_at": datetime.now(timezone.utc).isoformat()
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
            "title": "Inspección Aprobada",
            "message": f"Tu inspección de la unidad {d.get('placas_unidad')} ha sido aprobada por {u['name']}.",
            "inspection_id": insp_id, "created_at": datetime.now(timezone.utc).isoformat()
        })

    return Inspection(**d)

# --- Embarque ---
@api_router.post("/shipping-tickets")
async def create_ticket(body: ShippingTicketCreate, u: Dict[str, Any] = Depends(get_current_user)):
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
    asyncio.create_task(sync_to_google_sheets("embarque", doc))
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
async def send_email_endpoint(body: SendReportEmailBody, u: Dict[str, Any] = Depends(get_current_user)):
    """
    Dispara el envío del reporte consolidado en background.
    Responde inmediatamente para no generar timeout en el cliente.
    """
    # Validar que el registro existe antes de responder
    rec = await db.vehicle_records.find_one({"id": body.record_id}, {"_id": 0, "entry": 1})
    if not rec:
        raise HTTPException(404, "Registro no encontrado")

    # Lanzar el envío en background — el cliente no espera
    asyncio.create_task(send_report_email(body.record_id, body.extra_emails))

    plates = rec.get("entry", {}).get("placas_unidad", "")
    recipients_count = 1 + len([e for e in body.extra_emails if e.strip()])
    return {
        "ok": True,
        "message": f"Reporte de {plates} en cola de envío a {recipients_count} destinatario(s). Llegará en unos momentos.",
        "async": True
    }

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

@api_router.post("/users/push-token")
async def save_push_token(body: Dict[str, str], u: Dict[str, Any] = Depends(get_current_user)):
    token = body.get("token")
    if token:
        await db.users.update_one({"id": u["id"]}, {"$set": {"push_token": token}})
    return {"ok": True}

# --- Chat (Interno Team Chat) ---
@api_router.get("/chat/{room}")
async def get_chat(room: str, u: Dict[str, Any] = Depends(get_current_user)):
    msgs = await db.chat_messages.find({"room": room}).sort("created_at", 1).to_list(200)
    return [{**m, "id": str(m.get("_id"))} for m in msgs]

@api_router.post("/chat/send")
async def send_chat(body: Dict[str, Any], u: Dict[str, Any] = Depends(get_current_user)):
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

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware)

@app.on_event("shutdown")
async def shutdown_db_client(): client.close()
