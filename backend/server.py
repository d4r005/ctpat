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

# Configuración de Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("SRIUC-CORE")

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

app = FastAPI(title="SRIUC - Sistema de Registro e Inspección API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

@app.on_event("startup")
async def startup_event():
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
        await db.users.create_index([("email", 1)], unique=True)
        await db.activities.create_index([("created_at", -1)])
        logger.info("Base de datos MongoDB Atlas vinculada exitosamente.")
    except Exception as e:
        logger.error(f"Error en startup: {e}")

# ========== Modelos de Datos ==========
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
    push_tokens: List[str] = []

class PushTokenUpdate(BaseModel):
    token: str

# ========== Sistema de Notificaciones Push ==========
async def send_push_notification(user_id: str, title: str, body: str, data: Dict[str, Any] = None):
    """Envía una notificación push real a los dispositivos del usuario vía Expo API"""
    user = await db.users.find_one({"id": user_id})
    if not user or not user.get("push_tokens"):
        return

    tokens = user["push_tokens"]
    payload = []
    for token in tokens:
        if token.startswith("ExponentPushToken"):
            payload.append({
                "to": token,
                "title": title,
                "body": body,
                "data": data or {},
                "sound": "default",
                "priority": "high"
            })

    if payload:
        try:
            requests.post("https://exp.host/--/api/v2/push/send", json=payload, timeout=10)
        except Exception as e:
            logger.error(f"Error enviando Push: {e}")

async def notify_supervisors_push(title: str, body: str, data: Dict[str, Any] = None):
    """Envía push a todos los supervisores y admins"""
    sups = await db.users.find({"role": {"$in": ["supervisor", "admin"]}}).to_list(100)
    for s in sups:
        await send_push_notification(s["id"], title, body, data)

# ========== Auth Routes Modificadas ==========
@api_router.post("/auth/register", response_model=TokenResponse)
async def register(body: UserRegister):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing: raise HTTPException(status_code=400, detail="Usuario ya existe")
    total = await db.users.count_documents({})
    role = "admin" if (total == 0 or body.email.lower() in ["d.trujillo@brancoindustries.com", "d4r005@gmail.com"]) else body.role
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id, "email": body.email.lower(), "name": body.name.upper(),
        "role": role, "active": True, "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "push_tokens": []
    }
    await db.users.insert_one(doc)
    return TokenResponse(access_token=create_token(user_id), user=UserPublic(**doc))

@api_router.post("/users/push-token")
async def register_push_token(body: PushTokenUpdate, u: Dict[str, Any] = Depends(get_current_user)):
    await db.users.update_one({"id": u["id"]}, {"$addToSet": {"push_tokens": body.token}})
    return {"ok": True}

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

class ShippingTicketCreate(BaseModel):
    almacenista: str
    fecha: Optional[str] = None
    area: str = ""
    sellos: str = ""
    cliente: str = ""
    operador: str = ""
    linea_transporte: str = ""
    numero_economico: str = ""
    placas_unidad: str
    numero_caja: str = ""
    placas_caja: str = ""
    hora_llegada: str = ""
    hora_apertura_cortina: str = ""
    hora_cierre_cortina: str = ""
    hora_salida: str = ""
    numero_pallets: str = ""
    numero_sello: str = ""
    observaciones: str = ""
    daño_caja: str = ""
    plano_carga: str = ""
    foto_inicio_carga: str = ""
    foto_media_carga: str = ""
    foto_final_carga: str = ""
    firma_almacenista: str = ""
    firma_guardia: str = ""
    nombre_guardia: str = ""
    record_id: Optional[str] = None

class ShippingTicket(BaseModel):
    id: str
    user_id: str
    almacenista: str
    cliente: str
    placas_unidad: str
    numero_caja: str
    numero_pallets: str
    numero_sello: str
    foto_final_carga: str = ""
    created_at: str

# ========== Ayudantes de Procesamiento ==========
def add_watermark(base64_str: str) -> str:
    """Añade marca de agua y redimensiona agresivamente para emails ligeros"""
    if not base64_str or not isinstance(base64_str, str) or not base64_str.startswith('data:image'):
        return base64_str
    try:
        header, encoded = base64_str.split(",", 1) if "," in base64_str else ("data:image/jpeg;base64", base64_str)
        img = Image.open(io.BytesIO(base64.b64decode(encoded)))
        if img.mode != 'RGB': img = img.convert('RGB')

        # Redimensión agresiva para correos ligeros (500px máx)
        max_width = 500
        if img.width > max_width:
            ratio = max_width / float(img.width)
            img = img.resize((max_width, int(float(img.height) * ratio)), Image.LANCZOS)

        draw = ImageDraw.Draw(img)
        text = f"SRIUC | {datetime.now().strftime('%d/%m/%Y %H:%M')}"
        # Ajuste de dibujo de marca de agua
        width, height = img.size
        draw.rectangle([0, height - 20, width, height], fill=(0, 0, 0))
        draw.text((10, height - 16), text, fill=(255, 255, 255))

        buf = io.BytesIO()
        # Calidad bajada al 40% para asegurar el envío rápido
        img.save(buf, format="JPEG", quality=40, optimize=True)
        return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}"
    except Exception as e:
        logger.error(f"Error en watermark: {e}")
        return base64_str
        logger.error(f"Error en watermark: {e}")
        return base64_str

def ensure_clean_image(base64_str: str) -> str:
    """Fuerza fondo blanco y formato JPEG para firmas y fotos de inspección"""
    if not base64_str or len(base64_str) < 100: return base64_str
    try:
        header, encoded = base64_str.split(",", 1) if "," in base64_str else ("data:image/jpeg;base64", base64_str)
        img = Image.open(io.BytesIO(base64.b64decode(encoded)))
        clean_img = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == 'RGBA': clean_img.paste(img, mask=img.split()[3])
        else: clean_img.paste(img)
        buf = io.BytesIO()
        clean_img.save(buf, format="JPEG", quality=70, optimize=True)
        return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}"
    except: return base64_str

def hash_password(plain: str) -> str: return bcrypt.hashpw(plain.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
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
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
        if not user: raise Exception()
        return user
    except: raise HTTPException(status_code=401, detail="Sesión expirada")

async def sync_to_google_sheets(process_type: str, data: Dict[str, Any], report_html: str = ""):
    webhook_url = os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")
    if not webhook_url: return
    def send():
        try:
            placas = (data.get("placas_unidad") or data.get("entry", {}).get("placas_unidad", "N/A")).upper()
            payload = {
                "proceso": process_type.upper(), "id_vinculo": data.get("id"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "placas_carpeta": placas, "reporte_html": report_html,
                "id_unico_proceso": f"{process_type}_{data.get('id')}"
            }
            requests.post(webhook_url, json=payload, timeout=45)
        except: pass
    import asyncio
    asyncio.create_task(asyncio.to_thread(send))

async def _log_activity(type: str, item_id: str, title: str, subtitle: str, user_name: str, status: str = ""):
    doc = {"id": item_id, "type": type, "title": title.upper(), "subtitle": subtitle.upper(), "user_name": user_name.upper(), "status": status, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.activities.insert_one(doc)

# ========== Lógica de Vinculación Robusta ==========
async def _ensure_record_links(record: Dict[str, Any]) -> Dict[str, Any]:
    """Une registros de caseta con inspecciones y tickets por placas (regex flexible)"""
    placas = record["entry"].get("placas_unidad", "").strip().upper()
    if not placas: return record
    placas_norm = re.sub(r'[^A-Z0-9]', '', placas)
    if not placas_norm: return record
    updated = False

    # 1. Buscar Inspecciones
    if not record.get("inspection_id") or not record.get("inspection_ids"):
        flex_regex = ".*".join(list(placas_norm))
        insp = await db.inspections.find_one({"placas_unidad": {"$regex": f".*{flex_regex}.*", "$options": "i"}}, sort=[("created_at", -1)])
        if insp:
            record["inspection_id"] = insp["id"]
            if "inspection_ids" not in record or not isinstance(record["inspection_ids"], list): record["inspection_ids"] = []
            if insp["id"] not in record["inspection_ids"]: record["inspection_ids"].append(insp["id"])
            if record["status"] == "entrada": record["status"] = "inspeccionado"
            updated = True

    # 2. Buscar Ticket de Embarque
    if not record.get("shipping_ticket_id"):
        flex_regex = ".*".join(list(placas_norm))
        tick = await db.shipping_tickets.find_one({"placas_unidad": {"$regex": f".*{flex_regex}.*", "$options": "i"}}, sort=[("created_at", -1)])
        if tick:
            record["shipping_ticket_id"] = tick["id"]
            record["has_shipping_ticket"] = True
            updated = True

    if updated:
        await db.vehicle_records.update_one({"id": record["id"]}, {"$set": {
            "inspection_id": record.get("inspection_id"),
            "inspection_ids": record.get("inspection_ids", []),
            "shipping_ticket_id": record.get("shipping_ticket_id"),
            "has_shipping_ticket": record.get("has_shipping_ticket", True),
            "status": record["status"]
        }})
    return record

# ========== Rutas de Autenticación ==========
@api_router.post("/auth/register", response_model=TokenResponse)
async def register(body: UserRegister):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing: raise HTTPException(status_code=400, detail="Usuario ya existe")
    total = await db.users.count_documents({})
    role = "admin" if (total == 0 or body.email.lower() in ["d.trujillo@brancoindustries.com", "d4r005@gmail.com"]) else body.role
    user_id = str(uuid.uuid4())
    doc = {"id": user_id, "email": body.email.lower(), "name": body.name.upper(), "role": role, "active": True, "password_hash": hash_password(body.password), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.users.insert_one(doc)
    return TokenResponse(access_token=create_token(user_id), user=UserPublic(**doc))

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(body: UserLogin):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]): raise HTTPException(status_code=401, detail="Credenciales inválidas")
    return TokenResponse(access_token=create_token(user["id"]), user=UserPublic(**user))

@api_router.get("/auth/me", response_model=UserPublic)
async def me(current_user: Dict[str, Any] = Depends(get_current_user)): return UserPublic(**current_user)

# ========== Caseta (Vehicle Records) ==========
@api_router.get("/vehicle-records", response_model=List[VehicleRecord])
async def list_records(current_user: Dict[str, Any] = Depends(get_current_user), status: Optional[str] = None):
    filt = {"status": status} if status else {}
    # Proyección para optimizar velocidad (no traer imágenes en la lista)
    proj = {"_id": 0, "entry.foto_frente_unidad": 0, "entry.foto_atras_caja": 0, "entry.foto_id_chofer": 0, "entry.firma_operador": 0}
    docs = await db.vehicle_records.find(filt, proj).sort("created_at", -1).to_list(100)
    res = []
    for d in docs: res.append(VehicleRecord(**(await _ensure_record_links(d))))
    return res

@api_router.post("/vehicle-records", response_model=VehicleRecord)
async def create_record(body: VehicleEntry, current_user: Dict[str, Any] = Depends(get_current_user)):
    p = body.placas_unidad.strip().upper()
    ex = await db.vehicle_records.find_one({"entry.placas_unidad": p, "status": {"$in": ["entrada", "inspeccionado"]}})
    if ex: raise HTTPException(status_code=400, detail=f"Placas {p} ya están en patio activo")

    rid = str(uuid.uuid4())
    doc = {"id": rid, "user_id": current_user["id"], "status": "entrada", "entry": body.dict(), "exit": None, "inspection_id": None, "inspection_ids": [], "shipping_ticket_id": None, "has_shipping_ticket": False, "created_at": datetime.now(timezone.utc).isoformat()}
    doc["entry"]["placas_unidad"] = p
    doc["entry"]["chofer_nombre"] = doc["entry"]["chofer_nombre"].upper()
    doc["entry"]["fecha_entrada"] = doc["entry"].get("fecha_entrada") or doc["created_at"]

    # Limpiar fotos
    for f in ["foto_frente_unidad", "foto_atras_caja", "foto_id_chofer", "firma_operador"]:
        if doc["entry"].get(f): doc["entry"][f] = ensure_clean_image(doc["entry"][f])

    await db.vehicle_records.insert_one(doc)
    await _log_activity("caseta", rid, f"Entrada: {p}", f"Conductor: {body.chofer_nombre}", current_user["name"], "entrada")

    # Notificar Push a Supervisores
    asyncio.create_task(notify_supervisors_push(
        "NUEVA ENTRADA 🚚",
        f"Unidad {p} ingresó a planta. Chofer: {body.chofer_nombre.upper()}",
        {"id": rid, "type": "caseta"}
    ))

    await sync_to_google_sheets("entrada", doc)
    return VehicleRecord(**{k: v for k, v in doc.items() if k != "_id"})

@api_router.get("/vehicle-records/{rec_id}", response_model=VehicleRecord)
async def get_record(rec_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    doc = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
    if not doc: raise HTTPException(status_code=404, detail="No encontrado")
    return VehicleRecord(**(await _ensure_record_links(doc)))

@api_router.patch("/vehicle-records/{rec_id}/exit", response_model=VehicleRecord)
async def exit_record(rec_id: str, body: VehicleExit, current_user: Dict[str, Any] = Depends(get_current_user)):
    x = body.dict(); x["fecha_salida"] = datetime.now(timezone.utc).isoformat()
    if x.get("sello_vvtt_foto"): x["sello_vvtt_foto"] = ensure_clean_image(x["sello_vvtt_foto"])

    await db.vehicle_records.update_one({"id": rec_id}, {"$set": {"exit": x, "status": "salida"}})
    up = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})

    # Notificar Push: SALIDA DE UNIDAD
    asyncio.create_task(notify_supervisors_push(
        "SALIDA REGISTRADA 👋",
        f"La unidad {up['entry']['placas_unidad']} ha salido de la planta con destino a {x.get('destino')}.",
        {"id": rec_id, "type": "salida"}
    ))

    await _log_activity("caseta", rec_id, f"Salida: {up['entry']['placas_unidad']}", f"Destino: {x.get('destino')}", current_user["name"], "salida")

    async def run_reports():
        await _trigger_automatic_report(rec_id)
        await sync_to_google_sheets("salida", up)
    import asyncio; asyncio.create_task(run_reports())
    return VehicleRecord(**up)

@api_router.delete("/vehicle-records/{rec_id}/admin-delete")
async def admin_del_rec(rec_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    if not is_admin(u): raise HTTPException(status_code=403)
    await db.vehicle_records.delete_one({"id": rec_id}); return {"ok": True}

# ========== Inspecciones C-TPAT ==========
@api_router.post("/inspections", response_model=Inspection)
async def create_inspection(body: InspectionCreate, u: Dict[str, Any] = Depends(get_current_user)):
    iid = str(uuid.uuid4()); doc = body.dict()
    doc.update({
        "id": iid, "user_id": u["id"], "inspector_email": u["email"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status_general": "malo" if any(p.estado == "malo" for p in body.points) else "bueno",
        "placas_unidad": body.placas_unidad.upper(), "approval_status": "pendiente"
    })

    def process_imgs():
        doc["inspector_firma"] = ensure_clean_image(doc.get("inspector_firma", ""))
        for p in doc["points"]:
            if p.get("photo"): p["photo"] = ensure_clean_image(p["photo"])
    import asyncio; await asyncio.to_thread(process_imgs)

    await db.inspections.insert_one(doc)
    if body.record_id:
        await db.vehicle_records.update_one({"id": body.record_id}, {"$set": {"inspection_id": iid, "status": "inspeccionado"}, "$addToSet": {"inspection_ids": iid}})

    # Notificar Push a Supervisores: INSPECCIÓN REALIZADA
    asyncio.create_task(notify_supervisors_push(
        "INSPECCIÓN TERMINADA ✅",
        f"La unidad {body.placas_unidad.upper()} ha sido inspeccionada por {u['name'].upper()}. Pendiente de aprobación.",
        {"id": iid, "type": "inspection"}
    ))

    await _log_activity("inspection", iid, f"Inspección: {doc['placas_unidad']}", f"Por {body.inspector_nombre}", u["name"], doc["status_general"])
    await sync_to_google_sheets("inspeccion", doc)
    return _serialize_inspection(doc)

@api_router.get("/inspections", response_model=List[Inspection])
async def list_insps(u: Dict[str, Any] = Depends(get_current_user), scope: str = "mine"):
    filt = {} if scope == "all" and (u["role"] in ["supervisor", "admin"] or is_admin(u)) else {"user_id": u["id"]}
    docs = await db.inspections.find(filt, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [_serialize_inspection(d) for d in docs]

@api_router.get("/inspections/{insp_id}", response_model=Inspection)
async def get_insp(insp_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    doc = await db.inspections.find_one({"id": insp_id}, {"_id": 0})
    if not doc: raise HTTPException(status_code=404)
    return _serialize_inspection(doc)

@api_router.delete("/inspections/{insp_id}/admin-delete")
async def admin_del_insp(insp_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    if not is_admin(u): raise HTTPException(status_code=403)
    await db.inspections.delete_one({"id": insp_id}); return {"ok": True}

def _serialize_inspection(doc: Dict[str, Any]) -> Inspection:
    for f in ["inspector_firma", "verificador_firma", "approved_by_signature"]:
        if doc.get(f) and not doc[f].startswith('data:image'): doc[f] = f"data:image/png;base64,{doc[f]}"
    return Inspection(**doc)

# ========== Embarque (Shipping Tickets) ==========
@api_router.post("/shipping-tickets")
async def create_ticket(body: ShippingTicketCreate, u: Dict[str, Any] = Depends(get_current_user)):
    tid = str(uuid.uuid4()); doc = body.dict()
    doc.update({"id": tid, "user_id": u["id"], "created_at": datetime.now(timezone.utc).isoformat(), "placas_unidad": body.placas_unidad.upper()})

    for f in ["foto_inicio_carga", "foto_media_carga", "foto_final_carga", "firma_almacenista", "firma_guardia"]:
        if doc.get(f): doc[f] = ensure_clean_image(doc[f])

    await db.shipping_tickets.insert_one(doc)
    if body.record_id:
        await db.vehicle_records.update_one({"id": body.record_id}, {"$set": {"shipping_ticket_id": tid, "has_shipping_ticket": True}})

    # Notificar Push: TICKET GENERADO
    asyncio.create_task(notify_supervisors_push(
        "TICKET DE EMBARQUE 📦",
        f"Se generó ticket para la unidad {body.placas_unidad.upper()}. Cliente: {doc['cliente']}.",
        {"id": tid, "type": "embarque"}
    ))

    await _log_activity("embarque", tid, f"Ticket: {doc['placas_unidad']}", f"Cliente: {doc['cliente']}", u["name"], "embarque")
    await sync_to_google_sheets("embarque", doc)
    return {"id": tid}

@api_router.get("/shipping-tickets", response_model=List[Dict[str, Any]])
async def list_tickets(u: Dict[str, Any] = Depends(get_current_user)):
    proj = {"_id": 0, "foto_inicio_carga": 0, "foto_media_carga": 0, "foto_final_carga": 0, "firma_almacenista": 0, "firma_guardia": 0}
    docs = await db.shipping_tickets.find({}, proj).sort("created_at", -1).to_list(100)
    return docs

@api_router.get("/shipping-tickets/{ticket_id}")
async def get_ticket(ticket_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    # 1. Intentar por ID exacto de ticket
    doc = await db.shipping_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not doc:
        # 2. Intentar buscarlo como fallback por record_id
        doc = await db.shipping_tickets.find_one({"record_id": ticket_id}, {"_id": 0})

    if not doc:
        # 3. Intentar por placas si ticket_id es un record_id válido
        rec = await db.vehicle_records.find_one({"id": ticket_id})
        if rec:
            pl = rec["entry"]["placas_unidad"].upper()
            pl_norm = re.sub(r'[^A-Z0-9]', '', pl)
            if pl_norm:
                flex_regex = ".*".join(list(pl_norm))
                doc = await db.shipping_tickets.find_one({"placas_unidad": {"$regex": f".*{flex_regex}.*", "$options": "i"}}, {"_id": 0}, sort=[("created_at", -1)])

    if not doc: raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return doc

@api_router.put("/shipping-tickets/{ticket_id}")
async def update_ticket(ticket_id: str, body: Dict[str, Any], u: Dict[str, Any] = Depends(get_current_user)):
    # Limpiar campos de sistema antes de actualizar
    for k in ["_id", "id", "user_id", "created_at"]:
        if k in body: del body[k]

    # Limpiar imágenes si vienen en el body
    for f in ["foto_inicio_carga", "foto_media_carga", "foto_final_carga", "firma_almacenista", "firma_guardia"]:
        if body.get(f) and body[f].startswith("data:image"):
            body[f] = ensure_clean_image(body[f])

    res = await db.shipping_tickets.update_one({"id": ticket_id}, {"$set": body})
    if res.matched_count == 0:
        # Reintento por record_id
        await db.shipping_tickets.update_one({"record_id": ticket_id}, {"$set": body})

    return {"ok": True}

@api_router.delete("/shipping-tickets/{ticket_id}/admin-delete")
async def del_ticket(ticket_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    if not is_admin(u): raise HTTPException(status_code=403)
    await db.shipping_tickets.delete_one({"id": ticket_id})
    return {"ok": True}

# ========== Reporte y Analítica ==========
async def _trigger_automatic_report(rec_id: str):
    r = await db.vehicle_records.find_one({"id": rec_id}); r = await _ensure_record_links(r)
    inps = []; ids = r.get("inspection_ids") or ([r["inspection_id"]] if r.get("inspection_id") else [])
    for iid in ids:
        i = await db.inspections.find_one({"id": iid})
        if i: inps.append(i)

    e = r["entry"]; pl = e["placas_unidad"].upper()
    e = r["entry"]; pl = e["placas_unidad"].upper()
    tick = await db.shipping_tickets.find_one({"id": r.get("shipping_ticket_id")})
    if not tick:
        # Fallback por placas normalizadas
        pl_norm = re.sub(r'[^A-Z0-9]', '', pl)
        if pl_norm:
            flex_regex = ".*".join(list(pl_norm))
            tick = await db.shipping_tickets.find_one({"placas_unidad": {"$regex": f".*{flex_regex}.*", "$options": "i"}}, sort=[("created_at", -1)])

    def ph(b64, lb):
        if not b64: return ""
        wb = add_watermark(b64)
        return f'<div style="display:inline-block; width:30%; margin:1%; text-align:center;"><p style="font-size:8px;">{lb}</p><img src="{wb}" style="width:100%; border:1px solid #ddd;"/></div>'

    insp_html = ""
    for idx, i in enumerate(inps):
        rows = "".join([f'<tr><td style="border:1px solid #ddd; padding:4px;">{p["number"]}</td><td style="border:1px solid #ddd; padding:4px;">{p["name"]}</td><td style="border:1px solid #ddd; padding:4px; font-weight:bold; color:{"#16a34a" if p["estado"]=="bueno" else "#dc2626"}">{p["estado"].upper()}</td></tr>' for p in i.get("points", [])])
        insp_html += f'<div style="margin-top:15px; border:1px solid #0A2540; padding:10px;"><h3 style="margin:0; background:#f1f5f9; padding:5px;">INSPECCIÓN #{idx+1} - {i.get("numero_trailer")}</h3><table style="width:100%; border-collapse:collapse; font-size:10px;">{rows}</table></div>'

    html = f"""<html><body style="font-family:sans-serif; padding:20px; max-width:800px; margin:auto;">
        <div style="background:#0A2540; color:white; padding:15px; text-align:center;"><h2>Reporte Consolidado SRIUC</h2><p>{pl}</p></div>
        <h3>1. Caseta</h3><p><b>Chofer:</b> {e.get("chofer_nombre")}<br/><b>Entrada:</b> {e.get("fecha_entrada")}<br/><b>Salida:</b> {r.get("exit",{}).get("fecha_salida","PENDIENTE")}</p>
        <h3>2. Inspección</h3>{insp_html}
        {f'<h3>3. Embarque</h3><p><b>Cliente:</b> {tick.get("cliente")}<br/><b>Almacenista:</b> {tick.get("almacenista")}</p>' if tick else ''}
    </body></html>"""

    h, u, pw = os.environ.get("SMTP_HOST"), os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASS")
    if all([h, u, pw]):
        m = MIMEMultipart(); m["From"], m["To"], m["Subject"] = u, os.environ.get("REPORT_RECIPIENT", u), f"REPORTE CONSOLIDADO - {pl}"
        m.attach(MIMEText(html, "html"))
    try:
        await aiosmtplib.send(m, hostname=h, port=587, username=u, password=pw, start_tls=True, timeout=90)
    except Exception as e:
        logger.error(f"Error SMTP: {e}")
    return True

@api_router.get("/activities")
async def acts(u: Dict[str, Any] = Depends(get_current_user)):
    docs = await db.activities.find().sort("created_at", -1).to_list(50); return docs

@api_router.post("/inspections/{inspection_id}/approve", response_model=Inspection)
async def approve_inspection(inspection_id: str, body: ApprovalBody, u: Dict[str, Any] = Depends(get_current_user)):
    doc = await db.inspections.find_one({"id": inspection_id})
    if not doc: raise HTTPException(status_code=404)
    update = {
        "approval_status": "aprobada",
        "approval_note": body.note,
        "approved_by_name": body.name or u["name"],
        "approved_by_signature": ensure_clean_image(body.signature),
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.inspections.update_one({"id": inspection_id}, {"$set": update})

    # Notificar al Inspector: SU INSPECCIÓN FUE APROBADA
    asyncio.create_task(send_push_notification(
        doc["user_id"],
        "INSPECCIÓN APROBADA ✅",
        f"Tu inspección de la unidad {doc['placas_unidad']} ha sido aprobada por {u['name']}.",
        {"id": inspection_id}
    ))

    return _serialize_inspection({**doc, **update})

@api_router.post("/inspections/{inspection_id}/reject", response_model=Inspection)
async def reject_inspection(inspection_id: str, body: ApprovalBody, u: Dict[str, Any] = Depends(get_current_user)):
    doc = await db.inspections.find_one({"id": inspection_id})
    if not doc: raise HTTPException(status_code=404)
    update = {
        "approval_status": "rechazada",
        "approval_note": body.note,
        "approved_by_name": body.name or u["name"],
        "approved_by_signature": ensure_clean_image(body.signature),
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.inspections.update_one({"id": inspection_id}, {"$set": update})

    # Notificar al Inspector: SU INSPECCIÓN FUE RECHAZADA
    asyncio.create_task(send_push_notification(
        doc["user_id"],
        "INSPECCIÓN RECHAZADA 🚨",
        f"ATENCIÓN: Tu inspección de la unidad {doc['placas_unidad']} fue rechazada por {u['name']}. Motivo: {body.note}",
        {"id": inspection_id}
    ))

    return _serialize_inspection({**doc, **update})

@api_router.get("/analytics")
async def anly(u: Dict[str, Any] = Depends(get_current_user)):
    c = await db.inspections.count_documents({}); return {"total": c}

@api_router.post("/inspections/{inspection_id}/send-report")
async def manual_send_report(inspection_id: str, body: Optional[Dict[str, str]] = None, u: Dict[str, Any] = Depends(get_current_user)):
    insp = await db.inspections.find_one({"id": inspection_id})
    if not insp: raise HTTPException(status_code=404)
    placas = insp.get("placas_unidad", "").strip()
    record = await db.vehicle_records.find_one({"$or": [{"inspection_id": inspection_id}, {"inspection_ids": inspection_id}, {"entry.placas_unidad": placas}]})
    if not record: raise HTTPException(status_code=404, detail="No se encontró registro vinculado")
    success = await _trigger_automatic_report(record["id"])
    return {"ok": success}

@api_router.post("/vehicle-records/{rec_id}/send-report")
async def manual_send_record_report(rec_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    success = await _trigger_automatic_report(rec_id)
    if not success: raise HTTPException(status_code=500)
    return {"ok": True, "message": "Reporte enviado exitosamente"}

# ========== Chat e Infraestructura ==========
@api_router.post("/chat/send", response_model=ChatMessage)
async def snd_ch(b: ChatMessageCreate, u: Dict[str, Any] = Depends(get_current_user)):
    d = {"id": str(uuid.uuid4()), "user_id": u["id"], "user_name": u["name"], "room": b.room.upper(), "text": b.text, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.chat_messages.insert_one(d); return ChatMessage(**d)

@api_router.get("/chat/{rm}", response_model=List[ChatMessage])
async def gt_ch(rm: str, u: Dict[str, Any] = Depends(get_current_user)):
    ds = await db.chat_messages.find({"room": rm.upper()}).sort("created_at", -1).to_list(50)
    ds.reverse(); return [ChatMessage(**d) for d in ds]

@api_router.get("/health")
async def hlth(): return {"status": "ok"}

app.include_router(api_router)
app.add_middleware(GZipMiddleware); app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shutdown_db_client(): client.close()
