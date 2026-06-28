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

app = FastAPI(title="NAF Inspección API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("SRIUC")

@app.on_event("startup")
async def startup_event():
    try:
        await db.vehicle_records.create_index([("id", 1)], unique=True)
        await db.vehicle_records.create_index([("created_at", -1)])
        await db.inspections.create_index([("id", 1)], unique=True)
        await db.users.create_index([("email", 1)], unique=True)
        logger.info("Servidor SRIUC iniciado e índices verificados.")
    except Exception as e:
        logger.error(f"Error en startup: {e}")

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
    if not base64_str or not isinstance(base64_str, str) or not base64_str.startswith('data:image'):
        return base64_str
    try:
        header, encoded = base64_str.split(",", 1) if "," in base64_str else ("data:image/jpeg;base64", base64_str)
        img = Image.open(io.BytesIO(base64.b64decode(encoded)))
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            background = Image.new('RGB', img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3] if img.mode == 'RGBA' else None)
            img = background
        elif img.mode != 'RGB': img = img.convert('RGB')
        max_width = 600
        if img.width > max_width:
            ratio = max_width / float(img.width)
            img = img.resize((max_width, int(float(img.height) * ratio)), Image.LANCZOS)
        draw = ImageDraw.Draw(img)
        text = f"SRIUC | {datetime.now().strftime('%d/%m/%Y %H:%M')}"
        width, height = img.size
        draw.rectangle([0, height - 25, width, height], fill=(0, 0, 0))
        draw.text((10, height - 20), text, fill=(255, 255, 255))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=50, optimize=True)
        return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}"
    except: return base64_str

def ensure_clean_image(base64_str: str) -> str:
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
    except: raise HTTPException(status_code=401, detail="Sesión inválida")

async def sync_to_google_sheets(process_type: str, data: Dict[str, Any], report_html: str = ""):
    webhook_url = os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")
    if not webhook_url: return
    def send():
        try:
            placas = (data.get("placas_unidad") or data.get("entry", {}).get("placas_unidad", "N/A")).upper()
            payload = {
                "proceso": process_type.upper(), "id_vinculo": data.get("id"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "placas_carpeta": placas, "reporte_html": report_html
            }
            requests.post(webhook_url, json=payload, timeout=30)
        except: pass
    import asyncio
    asyncio.create_task(asyncio.to_thread(send))

# ========== Auth ==========
@api_router.post("/auth/register", response_model=TokenResponse)
async def register(body: UserRegister):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing: raise HTTPException(status_code=400, detail="Ya existe")
    user_id = str(uuid.uuid4())
    doc = {"id": user_id, "email": body.email.lower(), "name": body.name.upper(), "role": body.role, "active": True, "password_hash": hash_password(body.password), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.users.insert_one(doc)
    return TokenResponse(access_token=create_token(user_id), user=UserPublic(**doc))

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(body: UserLogin):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]): raise HTTPException(status_code=401, detail="Error")
    return TokenResponse(access_token=create_token(user["id"]), user=UserPublic(**user))

@api_router.get("/auth/me", response_model=UserPublic)
async def me(current_user: Dict[str, Any] = Depends(get_current_user)): return UserPublic(**current_user)

# ========== Records & Logic ==========
async def _ensure_record_links(record: Dict[str, Any]) -> Dict[str, Any]:
    placas = record["entry"].get("placas_unidad", "").strip().upper()
    if not placas: return record
    placas_norm = re.sub(r'[^A-Z0-9]', '', placas)
    if not placas_norm: return record

    updated = False
    if not record.get("inspection_id") or not record.get("inspection_ids"):
        flex_regex = ".*".join(list(placas_norm))
        insp = await db.inspections.find_one({"placas_unidad": {"$regex": f".*{flex_regex}.*", "$options": "i"}}, sort=[("created_at", -1)])
        if insp:
            record["inspection_id"] = insp["id"]
            if "inspection_ids" not in record or not isinstance(record["inspection_ids"], list): record["inspection_ids"] = []
            if insp["id"] not in record["inspection_ids"]: record["inspection_ids"].append(insp["id"])
            if record["status"] == "entrada": record["status"] = "inspeccionado"
            updated = True

    if not record.get("shipping_ticket_id"):
        flex_regex = ".*".join(list(placas_norm))
        tick = await db.shipping_tickets.find_one({"placas_unidad": {"$regex": f".*{flex_regex}.*", "$options": "i"}}, sort=[("created_at", -1)])
        if tick:
            record["shipping_ticket_id"] = tick["id"]
            record["has_shipping_ticket"] = True
            updated = True

    if updated:
        await db.vehicle_records.update_one({"id": record["id"]}, {"$set": {"inspection_id": record.get("inspection_id"), "inspection_ids": record.get("inspection_ids", []), "shipping_ticket_id": record.get("shipping_ticket_id"), "has_shipping_ticket": record.get("has_shipping_ticket", True), "status": record["status"]}})
    return record

@api_router.get("/vehicle-records", response_model=List[VehicleRecord])
async def list_vehicle_records(current_user: Dict[str, Any] = Depends(get_current_user), status: Optional[str] = None):
    filt = {"status": status} if status else {}
    docs = await db.vehicle_records.find(filt, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [VehicleRecord(**(await _ensure_record_links(d))) for d in docs]

@api_router.post("/vehicle-records", response_model=VehicleRecord)
async def create_record(body: VehicleEntry, current_user: Dict[str, Any] = Depends(get_current_user)):
    rec_id = str(uuid.uuid4())
    doc = {"id": rec_id, "user_id": current_user["id"], "status": "entrada", "entry": body.dict(), "created_at": datetime.now(timezone.utc).isoformat()}
    doc["entry"]["placas_unidad"] = doc["entry"]["placas_unidad"].upper()
    await db.vehicle_records.insert_one(doc)
    await sync_to_google_sheets("entrada", doc)
    return VehicleRecord(**{k: v for k, v in doc.items() if k != "_id"})

@api_router.get("/vehicle-records/{rec_id}", response_model=VehicleRecord)
async def get_record(rec_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    doc = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
    if not doc: raise HTTPException(status_code=404)
    return VehicleRecord(**(await _ensure_record_links(doc)))

@api_router.patch("/vehicle-records/{rec_id}/exit", response_model=VehicleRecord)
async def exit_record(rec_id: str, body: VehicleExit, current_user: Dict[str, Any] = Depends(get_current_user)):
    exit_data = body.dict()
    exit_data["fecha_salida"] = datetime.now(timezone.utc).isoformat()
    await db.vehicle_records.update_one({"id": rec_id}, {"$set": {"exit": exit_data, "status": "salida"}})
    updated = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})

    async def post_tasks():
        await _trigger_automatic_report(rec_id)
        await sync_to_google_sheets("salida", updated)
    import asyncio
    asyncio.create_task(post_tasks())
    return VehicleRecord(**updated)

# ========== Inspections ==========
@api_router.post("/inspections", response_model=Inspection)
async def create_insp(body: InspectionCreate, current_user: Dict[str, Any] = Depends(get_current_user)):
    id_insp = str(uuid.uuid4())
    doc = body.dict()
    doc.update({"id": id_insp, "user_id": current_user["id"], "created_at": datetime.now(timezone.utc).isoformat(), "status_general": "malo" if any(p.estado == "malo" for p in body.points) else "bueno", "placas_unidad": body.placas_unidad.upper()})

    doc["inspector_firma"] = ensure_clean_image(doc.get("inspector_firma", ""))
    for p in doc["points"]:
        if p.get("photo"): p["photo"] = ensure_clean_image(p["photo"])

    await db.inspections.insert_one(doc)
    if body.record_id:
        await db.vehicle_records.update_one({"id": body.record_id}, {"$set": {"inspection_id": id_insp, "status": "inspeccionado"}, "$addToSet": {"inspection_ids": id_insp}})

    await sync_to_google_sheets("inspeccion", doc)
    return Inspection(**{k: v for k, v in doc.items() if k != "_id"})

@api_router.get("/inspections", response_model=List[Inspection])
async def list_insp(current_user: Dict[str, Any] = Depends(get_current_user), scope: str = "mine"):
    filt = {} if scope == "all" and is_admin(current_user) else {"user_id": current_user["id"]}
    docs = await db.inspections.find(filt, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [Inspection(**d) for d in docs]

@api_router.get("/inspections/{insp_id}", response_model=Inspection)
async def get_insp(insp_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    doc = await db.inspections.find_one({"id": insp_id}, {"_id": 0})
    if not doc: raise HTTPException(status_code=404)
    return Inspection(**doc)

# ========== Shipping ==========
class ShippingTicket(BaseModel):
    id: str; user_id: str; cliente: str; placas_unidad: str; created_at: str; almacenista: str; operador: str

@api_router.post("/shipping-tickets")
async def create_tick(body: Any, current_user: Dict[str, Any] = Depends(get_current_user)):
    tid = str(uuid.uuid4()); doc = body if isinstance(body, dict) else body.dict()
    doc.update({"id": tid, "user_id": current_user["id"], "created_at": datetime.now(timezone.utc).isoformat(), "placas_unidad": doc.get("placas_unidad", "").upper()})
    await db.shipping_tickets.insert_one(doc)
    if doc.get("record_id"): await db.vehicle_records.update_one({"id": doc["record_id"]}, {"$set": {"shipping_ticket_id": tid, "has_shipping_ticket": True}})
    await sync_to_google_sheets("embarque", doc)
    return {"id": tid}

@api_router.get("/shipping-tickets", response_model=List[Dict[str, Any]])
async def list_ticks(current_user: Dict[str, Any] = Depends(get_current_user)):
    docs = await db.shipping_tickets.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs

# ========== Admin & Report ==========
async def _trigger_automatic_report(rec_id: str):
    rec = await db.vehicle_records.find_one({"id": rec_id})
    if not rec: return False
    rec = await _ensure_record_links(rec)
    insp = await db.inspections.find_one({"id": rec.get("inspection_id")})
    tick = await db.shipping_tickets.find_one({"id": rec.get("shipping_ticket_id")})

    subject = f"REPORTE SRIUC - {rec['entry']['placas_unidad']}"
    html = f"<html><body><h1>Reporte Final</h1><p>Unidad: {rec['entry']['placas_unidad']}</p></body></html>"

    h, u, p = os.environ.get("SMTP_HOST"), os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASS")
    if all([h,u,p]):
        msg = MIMEMultipart(); msg["From"], msg["To"], msg["Subject"] = u, os.environ.get("REPORT_RECIPIENT", u), subject
        msg.attach(MIMEText(html, "html"))
        try: await aiosmtplib.send(msg, hostname=h, port=587, username=u, password=p, start_tls=True)
        except: pass
    return True

@api_router.get("/activities")
async def acts(current_user: Dict[str, Any] = Depends(get_current_user)):
    docs = await db.activities.find().sort("created_at", -1).to_list(50)
    return docs

@api_router.get("/analytics")
async def analytics(current_user: Dict[str, Any] = Depends(require_admin)):
    insps = await db.inspections.find().to_list(1000)
    return {"total": len(insps)}

app.include_router(api_router)
app.add_middleware(GZipMiddleware); app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
