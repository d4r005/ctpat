from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import csv
import io
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt as pyjwt
import aiosmtplib
import requests
import base64
import re
from PIL import Image, ImageDraw
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

# Configuración de Logging al inicio para evitar crashes
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("SRIUC-API")

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=50,
    minPoolSize=10,
    maxIdleTimeMS=10000,
    connectTimeoutMS=5000,
    serverSelectionTimeoutMS=5000
)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'naf-inspection-secret-change-in-prod')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRE_HOURS = 24 * 30

app = FastAPI(title="NAF Inspección 19 Puntos API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()


@app.on_event("startup")
async def startup_event():
    """Configuración inicial al arrancar el servidor"""
    try:
        await db.vehicle_records.create_index([("id", 1)], unique=True)
        await db.vehicle_records.create_index([("created_at", -1)])
        await db.vehicle_records.create_index([("entry.placas_unidad", 1)])
        await db.vehicle_records.create_index([("inspection_id", 1)])
        await db.vehicle_records.create_index([("status", 1)])

        await db.inspections.create_index([("id", 1)], unique=True)
        await db.inspections.create_index([("created_at", -1)])
        await db.inspections.create_index([("placas_unidad", 1)])

        await db.shipping_tickets.create_index([("id", 1)], unique=True)
        await db.shipping_tickets.create_index([("created_at", -1)])
        await db.shipping_tickets.create_index([("placas_unidad", 1)])

        await db.users.create_index([("id", 1)], unique=True)
        await db.users.create_index([("email", 1)], unique=True)

        await db.chat_messages.create_index([("room", 1)])
        await db.chat_messages.create_index([("created_at", -1)])

        logger.info("Servidor SRIUC iniciado. Índices de base de datos verificados.")
    except Exception as e:
        logger.error(f"Error en el evento de inicio: {e}")

# ========== Models ==========
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: Optional[str] = "inspector"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    role: str = "inspector"
    active: bool = True

class ChatMessage(BaseModel):
    id: str
    user_id: str
    user_name: str
    room: str
    text: str
    created_at: str

class ChatMessageCreate(BaseModel):
    room: str
    text: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class InspectionPoint(BaseModel):
    number: int
    name: str
    estado: str
    comentarios: str = ""
    photo: str = ""

class InspectionCreate(BaseModel):
    inspection_type: str = "19_puntos"
    compania_transportista: str
    placas_unidad: str
    numero_trailer: str
    numero_precinto: str
    sello_alta_seguridad: str
    sello_verificado: bool = False
    points: List[InspectionPoint]
    actividad_sospechosa: str = ""
    inspector_nombre: str
    inspector_firma: str = ""
    verificador_nombre: str = ""
    verificador_firma: str = ""
    fecha_hora: Optional[str] = None
    client_uuid: Optional[str] = None
    record_id: Optional[str] = None

class Inspection(BaseModel):
    id: str
    user_id: str
    inspection_type: str = "19_puntos"
    inspector_email: str = ""
    compania_transportista: str
    placas_unidad: str
    numero_trailer: str
    numero_precinto: str
    sello_alta_seguridad: str
    sello_verificado: bool
    points: List[InspectionPoint]
    actividad_sospechosa: str
    inspector_nombre: str
    inspector_firma: str
    verificador_nombre: str
    verificador_firma: str
    fecha_hora: str
    created_at: str
    status_general: str
    approval_status: str = "pendiente"
    approval_note: str = ""
    approved_by_name: str = ""
    approved_by_signature: str = ""
    approved_at: str = ""

class ApprovalBody(BaseModel):
    note: str = ""
    name: str = ""
    signature: str = ""


# ========== Vehicle Record (Caseta) ==========
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


# ========== Helpers ==========
def add_watermark(base64_str: str) -> str:
    """Añade marca de agua y redimensiona agresivamente para emails ligeros"""
    if not base64_str or not isinstance(base64_str, str) or not base64_str.startswith('data:image'):
        return base64_str

    try:
        header, encoded = base64_str.split(",", 1) if "," in base64_str else ("data:image/jpeg;base64", base64_str)
        image_data = base64.b64decode(encoded)
        img = Image.open(io.BytesIO(image_data))

        # Fondo blanco para evitar cuadros negros en PNGs
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            background = Image.new('RGB', img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3] if img.mode == 'RGBA' else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # Redimensionar para email (máximo 600px)
        max_width = 600
        if img.width > max_width:
            ratio = max_width / float(img.width)
            new_height = int(float(img.height) * ratio)
            img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)

        draw = ImageDraw.Draw(img)
        now = datetime.now(timezone.utc).astimezone().strftime('%d/%m/%Y %H:%M')
        text = f"SRIUC | {now}"
        width, height = img.size
        font_height = max(18, int(height / 20))
        draw.rectangle([0, height - font_height - 10, width, height], fill=(0, 0, 0))
        draw.text((10, height - font_height - 2), text, fill=(255, 255, 255))

        buffered = io.BytesIO()
        img.save(buffered, format="JPEG", quality=50, optimize=True)
        new_base64 = base64.b64encode(buffered.getvalue()).decode()
        return f"data:image/jpeg;base64,{new_base64}"
    except Exception as e:
        logger.error(f"Error al procesar imagen: {e}")
        return base64_str

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    try: return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except: return False

def create_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS), "iat": datetime.now(timezone.utc)}
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def is_admin(user: Dict[str, Any]) -> bool:
    admins = ["d.trujillo@brancoindustries.com", "d4r005@gmail.com"]
    return user.get("email") in admins or user.get("role") == "admin"

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    try:
        payload = pyjwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id: raise HTTPException(status_code=401, detail="Token inválido")
    except: raise HTTPException(status_code=401, detail="Token inválido o expirado")

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user: raise HTTPException(status_code=401, detail="Usuario no encontrado")
    user.setdefault("role", "inspector")
    return user

async def require_supervisor(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user.get("role") not in ["supervisor", "admin"] and not is_admin(user):
        raise HTTPException(status_code=403, detail="Acceso restringido a Supervisores")
    return user

async def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if not is_admin(user): raise HTTPException(status_code=403, detail="Acceso restringido a Administradores")
    return user


async def sync_to_google_sheets(process_type: str, data: Dict[str, Any], report_html: str = ""):
    """Sincronización avanzada con Google Sheets y Drive para evitar duplicados."""
    webhook_url = os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")
    if not webhook_url: return

    def send_request():
        try:
            now = datetime.now(timezone.utc)
            meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
            nombre_mes = meses[now.month - 1]
            placas = (data.get("placas_unidad") or data.get("entry", {}).get("placas_unidad", "SIN_PLACAS")).upper()
            fecha = now.strftime("%d.%m.%Y")
            vinculo_id = data.get("id", str(uuid.uuid4()))

            payload = {
                "proceso": process_type.upper(),
                "sheet_target": process_type,
                "timestamp": now.isoformat(),
                "id_vinculo": vinculo_id,
                "id_unico_proceso": f"{process_type}_{vinculo_id}", # Llave única para evitar duplicar en Drive
                "usuario_accion": data.get("user_id", "sistema"),
                "mes_carpeta": nombre_mes,
                "placas_carpeta": placas,
                "fecha_carpeta": fecha,
                "carpeta_final": f"{placas} {fecha}",
                "reporte_html": report_html
            }

            if process_type == 'entrada':
                e = data.get("entry", {})
                payload.update({
                    "fecha_hora": e.get("fecha_entrada"), "placas_unidad": placas,
                    "chofer": e.get("chofer_nombre", "").upper(), "compania_transporte": e.get("compania_transporte", "").upper(),
                    "numero_caja": e.get("numero_caja", "").upper(), "sello_entrada": e.get("sello_entrada", "").upper(),
                    "foto_frente": e.get("foto_frente_unidad"), "foto_atras": e.get("foto_atras_caja")
                })
            elif process_type == 'inspeccion':
                payload.update({
                    "fecha_hora": data.get("created_at"), "placas_unidad": placas,
                    "numero_trailer": data.get("numero_trailer"), "inspector": data.get("inspector_nombre", "").upper(),
                    "estado_general": data.get("status_general", "").upper(), "approval_status": data.get("approval_status", "").upper()
                })
                for p in data.get("points", []): payload[f"p_{p['number']}"] = p.get("estado", "")
            elif process_type == 'salida':
                x = data.get("exit", {})
                payload.update({
                    "fecha_salida": x.get("fecha_salida"), "placas_unidad": placas,
                    "destino_final": x.get("destino", "").upper(), "sello_salida": x.get("sello_salida", "").upper(),
                    "guardia_salida": x.get("guardia_salida_nombre", "").upper(), "sello_vvtt": x.get("sello_vvtt_estado", "").upper()
                })

            requests.post(webhook_url, json=payload, timeout=60)
        except Exception as e: logger.error(f"Error en sync_to_google_sheets: {e}")

    asyncio.create_task(asyncio.to_thread(send_request))


# ========== Chat Internal ==========
@api_router.post("/chat/send", response_model=ChatMessage)
async def send_chat_message(body: ChatMessageCreate, current_user: Dict[str, Any] = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()), "user_id": current_user["id"], "user_name": current_user["name"].upper(),
        "room": body.room.upper().strip(), "text": body.text.strip(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.chat_messages.insert_one(doc)
    return ChatMessage(**{k: v for k, v in doc.items() if k != "_id"})

@api_router.get("/chat/{room}", response_model=List[ChatMessage])
async def list_chat_messages(room: str, limit: int = 50, current_user: Dict[str, Any] = Depends(get_current_user)):
    docs = await db.chat_messages.find({"room": room.upper().strip()}).sort("created_at", -1).to_list(limit)
    docs.reverse()
    return [ChatMessage(**{k: v for k, v in d.items() if k != "_id"}) for d in docs]


# ========== Auth Routes ==========
@api_router.get("/")
async def root():
    return {"message": "SRIUC API", "status": "online", "database": "connected"}

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(body: UserRegister):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing: raise HTTPException(status_code=400, detail="Correo ya registrado")
    total_users = await db.users.count_documents({})
    role = "admin" if (total_users == 0 or body.email.lower() in ["d.trujillo@brancoindustries.com", "d4r005@gmail.com"]) else "inspector"
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id, "email": body.email.lower(), "name": body.name.upper(),
        "role": role, "active": True, "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(doc)
    return TokenResponse(access_token=create_token(user_id), user=UserPublic(id=user_id, email=body.email.lower(), name=doc["name"], role=role))

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(body: UserLogin):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    return TokenResponse(access_token=create_token(user["id"]), user=UserPublic(**user))


# ========== Inspections ==========
def ensure_clean_image(base64_str: str) -> str:
    """Fuerza fondo blanco y formato JPEG optimizado."""
    if not base64_str or not isinstance(base64_str, str) or len(base64_str) < 100: return base64_str
    try:
        header, encoded = base64_str.split(",", 1) if "," in base64_str else ("data:image/jpeg;base64", base64_str)
        img = Image.open(io.BytesIO(base64.b64decode(encoded)))
        MAX_SIZE = 1280
        if max(img.size) > MAX_SIZE:
            ratio = MAX_SIZE / float(max(img.size))
            img = img.resize((int(img.size[0] * ratio), int(img.size[1] * ratio)), Image.LANCZOS)
        clean_img = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == 'RGBA': clean_img.paste(img, mask=img.split()[3])
        else: clean_img.paste(img)
        buf = io.BytesIO()
        clean_img.save(buf, format="JPEG", quality=70, optimize=True)
        return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}"
    except: return base64_str

def _serialize_inspection(doc: Dict[str, Any]) -> Inspection:
    for f in ["inspector_firma", "verificador_firma", "approved_by_signature"]:
        if doc.get(f) and not doc[f].startswith('data:image'): doc[f] = f"data:image/png;base64,{doc[f]}"
    return Inspection(**{k: v for k, v in doc.items() if k != "_id"})

@api_router.post("/inspections", response_model=Inspection)
async def create_inspection(body: InspectionCreate, current_user: Dict[str, Any] = Depends(get_current_user)):
    insp_id = str(uuid.uuid4())
    doc = body.dict()
    doc.update({
        "id": insp_id, "user_id": current_user["id"], "inspector_email": current_user["email"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status_general": "malo" if any(p.estado == "malo" for p in body.points) else "bueno",
        "approval_status": "pendiente", "placas_unidad": body.placas_unidad.upper()
    })

    # Procesar imágenes en hilo separado
    def clean_assets():
        doc["inspector_firma"] = ensure_clean_image(doc.get("inspector_firma", ""))
        for p in doc["points"]:
            if p.get("photo"): p["photo"] = ensure_clean_image(p["photo"])
    await asyncio.to_thread(clean_assets)

    await db.inspections.insert_one(doc)
    if body.record_id:
        await db.vehicle_records.update_one({"id": body.record_id}, {"$set": {"inspection_id": insp_id, "status": "inspeccionado"}, "$addToSet": {"inspection_ids": insp_id}})

    await _log_activity("inspection", insp_id, f"Inspección: {doc['placas_unidad']}", f"Por {body.inspector_nombre}", current_user["name"], doc["status_general"])
    await sync_to_google_sheets("inspeccion", doc)
    return _serialize_inspection(doc)

@api_router.get("/inspections", response_model=List[Inspection])
async def list_inspections(current_user: Dict[str, Any] = Depends(get_current_user), scope: str = "mine", summary: bool = False):
    filt = {} if scope == "all" and (current_user["role"] in ["supervisor", "admin"] or is_admin(current_user)) else {"user_id": current_user["id"]}
    proj = {"_id": 0, "inspector_firma": 0, "verificador_firma": 0, "approved_by_signature": 0, "points.photo": 0}
    if summary: proj["points"] = 0
    docs = await db.inspections.find(filt, proj).sort("created_at", -1).to_list(100)
    return [_serialize_inspection(d) for d in docs]


# ========== Vehicle Records (Caseta) ==========
@api_router.post("/vehicle-records", response_model=VehicleRecord)
async def create_vehicle_record(body: VehicleEntry, current_user: Dict[str, Any] = Depends(get_current_user)):
    placas = body.placas_unidad.strip().upper()
    existing = await db.vehicle_records.find_one({"entry.placas_unidad": placas, "status": {"$in": ["entrada", "inspeccionado"]}})
    if existing: raise HTTPException(status_code=400, detail=f"Placas {placas} ya están en patio")

    rec_id = str(uuid.uuid4())
    doc = {
        "id": rec_id, "user_id": current_user["id"], "status": "entrada",
        "entry": body.dict(), "exit": None, "inspection_id": None, "created_at": datetime.now(timezone.utc).isoformat()
    }
    doc["entry"]["placas_unidad"] = placas
    doc["entry"]["fecha_entrada"] = doc["entry"].get("fecha_entrada") or doc["created_at"]

    await db.vehicle_records.insert_one(doc)
    await _log_activity("caseta", rec_id, f"Entrada: {placas}", f"Chofer: {body.chofer_nombre.upper()}", current_user["name"], "entrada")
    await sync_to_google_sheets("entrada", doc)
    return VehicleRecord(**{k: v for k, v in doc.items() if k != "_id"})


async def _ensure_record_links(record: Dict[str, Any]) -> Dict[str, Any]:
    placas = record["entry"].get("placas_unidad", "").upper()
    if not record.get("inspection_id"):
        insp = await db.inspections.find_one({"placas_unidad": placas}, sort=[("created_at", -1)])
        if insp:
            record["inspection_id"] = insp["id"]
            if record["status"] == "entrada": record["status"] = "inspeccionado"
    if not record.get("shipping_ticket_id"):
        tick = await db.shipping_tickets.find_one({"placas_unidad": placas}, sort=[("created_at", -1)])
        if tick: record["shipping_ticket_id"] = tick["id"]; record["has_shipping_ticket"] = True
    return record


@api_router.get("/vehicle-records", response_model=List[VehicleRecord])
async def list_vehicle_records(current_user: Dict[str, Any] = Depends(get_current_user), status: Optional[str] = None):
    filt = {"status": status} if status else {}
    proj = {"_id": 0, "entry.foto_frente_unidad": 0, "entry.foto_atras_caja": 0, "entry.foto_id_chofer": 0, "entry.firma_operador": 0}
    docs = await db.vehicle_records.find(filt, proj).sort("created_at", -1).to_list(50)
    return [VehicleRecord(**(await _ensure_record_links(d))) for d in docs]


@api_router.patch("/vehicle-records/{rec_id}/exit", response_model=VehicleRecord)
async def add_exit_to_record(rec_id: str, body: VehicleExit, current_user: Dict[str, Any] = Depends(get_current_user)):
    exit_data = body.dict()
    exit_data["fecha_salida"] = exit_data.get("fecha_salida") or datetime.now(timezone.utc).isoformat()

    await db.vehicle_records.update_one({"id": rec_id}, {"$set": {"exit": exit_data, "status": "salida"}})
    updated = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})

    await _log_activity("caseta", rec_id, f"Salida: {updated['entry']['placas_unidad']}", f"Destino: {exit_data.get('destino')}", current_user["name"], "salida")

    # Enviar reporte consolidado y sync a Drive en segundo plano
    async def post_exit_tasks():
        await _trigger_automatic_report(rec_id)
        await sync_to_google_sheets("salida", updated)
    asyncio.create_task(post_exit_tasks())

    return VehicleRecord(**updated)


async def _trigger_automatic_report(rec_id: str, recipient_override: Optional[str] = None):
    record = await db.vehicle_records.find_one({"id": rec_id})
    if not record: return False
    record = await _ensure_record_links(record)

    inspections = []
    ids = record.get("inspection_ids") or ([record["inspection_id"]] if record.get("inspection_id") else [])
    for iid in ids:
        insp = await db.inspections.find_one({"id": iid})
        if insp: inspections.append(insp)

    ticket = await db.shipping_tickets.find_one({"id": record.get("shipping_ticket_id")})
    e = record.get("entry", {})
    placas = e.get("placas_unidad", "N/A").upper()

    def get_photo_html(b64, label):
        if not b64: return ""
        # Compresión para evitar correos pesados
        p_b64 = add_watermark(b64)
        return f'<div style="display:inline-block; width:30%; margin:1%; text-align:center;"><p style="font-size:8px; margin:2px;">{label}</p><img src="{p_b64}" style="width:100%; border:1px solid #ddd;"/></div>'

    insp_html = ""
    for idx, insp in enumerate(inspections):
        rows = "".join([f'<tr><td style="border:1px solid #ddd; padding:4px;">{p["number"]}</td><td style="border:1px solid #ddd; padding:4px;">{p["name"]}</td><td style="border:1px solid #ddd; padding:4px; font-weight:bold; color:{"#16a34a" if p["estado"]=="bueno" else "#dc2626"}">{p["estado"].upper()}</td></tr>' for p in insp.get("points", [])])
        photos = "".join([get_photo_html(p["photo"], f"PUNTO {p['number']}") for p in insp.get("points", []) if p.get("photo")])
        insp_html += f'<div style="margin-top:15px; border:1px solid #0A2540; padding:10px;"><h3 style="margin:0; background:#f1f5f9; padding:5px;">INSPECCIÓN #{idx+1} - {insp.get("numero_trailer")}</h3><table style="width:100%; border-collapse:collapse; font-size:10px; margin-top:5px;">{rows}</table><div style="margin-top:10px;">{photos}</div></div>'

    subject = f"REPORTE CONSOLIDADO SRIUC - {placas}"
    recipient = recipient_override or os.environ.get("REPORT_RECIPIENT", "d.trujillo@brancoindustries.com")
    html = f"""<html><body style="font-family:sans-serif; padding:20px; max-width:800px; margin:auto; border:1px solid #eee;">
        <div style="background:#0A2540; color:white; padding:15px; text-align:center;"><h1 style="margin:0;">Reporte Consolidado Final</h1><p>{placas}</p></div>
        <h2 style="border-bottom:2px solid #0A2540; color:#0A2540;">1. Movimiento de Caseta</h2>
        <p><b>Chofer:</b> {e.get("chofer_nombre")}<br/><b>Entrada:</b> {e.get("fecha_entrada")}<br/><b>Salida:</b> {record.get("exit", {}).get("fecha_salida", "PENDIENTE")}</p>
        <h2 style="border-bottom:2px solid #0A2540; color:#0A2540;">2. Inspecciones C-TPAT</h2>{insp_html}
        {f'<h2 style="border-bottom:2px solid #0A2540; color:#0A2540;">3. Embarque</h2><p><b>Cliente:</b> {ticket.get("cliente")}<br/><b>Almacenista:</b> {ticket.get("almacenista")}</p>' if ticket else ''}
        <p style="text-align:center; color:#999; font-size:10px; margin-top:30px;">Generado por Sistema SRIUC - Branco Industries</p>
    </body></html>"""

    await sync_to_google_sheets("entrada", record, report_html=html)
    return await send_automatic_report(subject, recipient, html)


# ========== Shipping Tickets ==========
@api_router.post("/shipping-tickets")
async def create_ticket(body: ShippingTicketCreate, current_user: Dict[str, Any] = Depends(get_current_user)):
    tid = str(uuid.uuid4())
    doc = body.dict()
    doc.update({"id": tid, "user_id": current_user["id"], "created_at": datetime.now(timezone.utc).isoformat(), "placas_unidad": body.placas_unidad.upper()})

    def clean_ticket():
        for f in ["foto_inicio_carga", "foto_media_carga", "foto_final_carga", "firma_almacenista", "firma_guardia"]:
            if doc.get(f): doc[f] = ensure_clean_image(doc[f])
    await asyncio.to_thread(clean_ticket)

    await db.shipping_tickets.insert_one(doc)
    if body.record_id: await db.vehicle_records.update_one({"id": body.record_id}, {"$set": {"shipping_ticket_id": tid, "has_shipping_ticket": True}})

    await _log_activity("embarque", tid, f"Ticket: {doc['placas_unidad']}", f"Cliente: {body.cliente.upper()}", current_user["name"], "embarque")
    await sync_to_google_sheets("embarque", doc)
    return ShippingTicket(**{k: v for k, v in doc.items() if k != "_id"})


# ========== Utils ==========
async def send_automatic_report(subject: str, recipient: str, body_html: str):
    h, u, p = os.environ.get("SMTP_HOST"), os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASS")
    if not all([h, u, p]): return False
    msg = MIMEMultipart(); msg["From"], msg["To"], msg["Subject"] = u, recipient, subject
    msg.attach(MIMEText(body_html, "html"))
    try:
        await aiosmtplib.send(msg, hostname=h, port=int(os.environ.get("SMTP_PORT", 587)), username=u, password=p, use_tls=False, start_tls=True, timeout=60)
        return True
    except Exception as e: logger.error(f"Error SMTP: {e}"); return False

async def _log_activity(type: str, item_id: str, title: str, subtitle: str, user_name: str, status: str = ""):
    await db.activities.insert_one({"id": item_id, "type": type, "title": title.upper(), "subtitle": subtitle.upper(), "user_name": user_name.upper(), "status": status, "created_at": datetime.now(timezone.utc).isoformat()})


# ========== Routes Analytics, Notifications, etc (Mantener igual) ==========
@api_router.get("/activities")
async def get_recent_activities(limit: int = 50, current_user: Dict[str, Any] = Depends(get_current_user)):
    docs = await db.activities.find().sort("created_at", -1).to_list(limit)
    return [d for d in docs]

@api_router.get("/health")
async def health(): return {"status": "ok"}

app.include_router(api_router)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shutdown_db_client(): client.close()
