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
    try:
        p = ROOT_DIR / "assets" / "naf_logo.png"
        if p.exists():
            with open(p, "rb") as f:
                return "data:image/png;base64," + base64.b64encode(f.read()).decode()
    except: pass
    return ""

NAF_LOGO_B64 = _load_naf_logo_b64()
load_dotenv(ROOT_DIR / '.env')

app = FastAPI(); api_router = APIRouter(prefix="/api")

# Configuración de base de datos - RUTA DIRECTA DE EMERGENCIA
mongo_url = os.environ.get('MONGO_URL', 'mongodb+srv://NAF:Branco2025@naf.qu9iczt.mongodb.net/')
client = AsyncIOMotorClient(mongo_url, maxPoolSize=50)
db = client['naf_inspection']

@app.on_event("startup")
async def startup_db_client():
    logger.info(f"Servidor SRIUC iniciado. Conectado a: {db.name}")

JWT_SECRET = os.environ.get('JWT_SECRET', 'naf-secret')
JWT_ALGORITHM = 'HS256'
security = HTTPBearer()

# ========== Modelos de Datos de Emergencia (Aceptan cualquier formato de DB) ==========

class BaseConfig(BaseModel):
    class Config:
        extra = "ignore"
        validate_assignment = False

class UserLogin(BaseConfig):
    email: str
    password: str

class UserRegister(BaseConfig):
    email: str
    password: str
    name: str
    role: str = "inspector"

class UserPublic(BaseConfig):
    id: Optional[str] = ""
    email: Optional[str] = ""
    name: Optional[str] = ""
    role: Optional[str] = "inspector"
    active: bool = True

class TokenResponse(BaseConfig):
    access_token: str
    user: Dict[str, Any]

class InspectionPoint(BaseConfig):
    number: int
    name: Optional[str] = ""
    estado: Optional[str] = ""
    comentarios: Optional[str] = ""
    photo: Optional[str] = ""

class Measures(BaseConfig):
    alto: Optional[str] = ""
    ancho: Optional[str] = ""
    largo: Optional[str] = ""
    capacidad: Optional[str] = ""

class Inspection(BaseConfig):
    id: str
    placas_unidad: Optional[Any] = ""
    status_general: Optional[Any] = "bueno"
    inspector_nombre: Optional[Any] = ""
    created_at: Optional[Any] = ""
    points: Optional[List[Any]] = []
    record_id: Optional[Any] = None

class InspectionCreate(BaseConfig):
    inspection_type: Optional[str] = ""
    placas_unidad: Optional[str] = ""
    points: List[Any] = []
    inspector_nombre: Optional[str] = ""
    record_id: Optional[str] = None
    client_uuid: Optional[str] = ""
    box_type: Optional[str] = ""
    measures: Optional[Measures] = None
    guard_name: Optional[str] = ""
    guard_signature: Optional[str] = ""

class VehicleRecord(BaseConfig):
    id: str
    user_id: Optional[Any] = ""
    status: Optional[Any] = "entrada"
    entry: Optional[Dict[str, Any]] = {}
    exit: Optional[Dict[str, Any]] = {}
    created_at: Optional[Any] = ""
    inspection_ids: Optional[List[str]] = []
    has_shipping_ticket: Optional[bool] = False

class ShippingTicketCreate(BaseConfig):
    almacenista: str
    placas_unidad: str
    record_id: Optional[str] = None
    cliente: Optional[str] = ""
    operador: Optional[str] = ""
    linea_transporte: Optional[str] = ""
    numero_economico: Optional[str] = ""
    numero_caja: Optional[str] = ""
    placas_caja: Optional[str] = ""
    numero_pallets: Optional[str] = ""
    numero_sello: Optional[str] = ""
    observaciones: Optional[str] = ""

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
        if img.height > img.width:
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
        return f"data:image/jpeg;base64,{base64.b64encode(out.getvalue()).decode()}"
    except Exception as e:
        logger.error(f"Error procesando imagen: {e}")
        return ""

def _plate_regex_pattern(plates: str) -> str:
    pl = re.sub(r'[^A-Z0-9]', '', (plates or '').upper())
    parts = [_PLATE_OCR_CLASSES.get(ch, re.escape(ch)) for ch in pl]
    return ".*".join(parts)

_PLATE_OCR_CANON = {'Z':'2','2':'2','O':'0','0':'0','I':'1','1':'1','S':'5','5':'5','B':'8','8':'8','G':'6','6':'6'}
_PLATE_OCR_CLASSES = {'Z':'[Z2]','2':'[Z2]','O':'[O0]','0':'[O0]','I':'[I1]','1':'[I1]','S':'[S5]','5':'[S5]','B':'[B8]','8':'[B8]','G':'[G6]','6':'[G6]'}

def _canon_plate(plates: str) -> str:
    pl = re.sub(r'[^A-Z0-9]', '', (plates or '').upper())
    return "".join(_PLATE_OCR_CANON.get(ch, ch) for ch in pl)

# ========== Autenticacion ==========

def is_admin(u: Dict[str, Any]) -> bool:
    return u.get("role") == "admin" or u.get("email") in ["d.trujillo@brancoindustries.com", "d4r005@gmail.com"]

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    try:
        p = pyjwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        u = await db.users.find_one({"id": p.get("sub")}, {"_id": 0, "password_hash": 0})
        if not u: raise HTTPException(401)
        return u
    except: raise HTTPException(401)

# ========== Endpoints ==========

@api_router.get("/health")
async def health():
    return {"status": "ok", "db": db.name}

@api_router.post("/auth/register")
async def register(body: UserRegister):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing: raise HTTPException(400, "Email ya registrado")
    user_id = str(uuid.uuid4())
    hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    new_user = {"id": user_id, "email": body.email.lower(), "name": body.name, "password_hash": hashed, "role": body.role, "active": True, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.users.insert_one(new_user)
    token = pyjwt.encode({"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=30)}, JWT_SECRET, algorithm=JWT_ALGORITHM)
    del new_user["password_hash"]
    return {"access_token": token, "user": new_user}

@api_router.post("/auth/login")
async def login(body: UserLogin):
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not bcrypt.checkpw(body.password.encode(), u["password_hash"].encode()):
        raise HTTPException(401, "Credenciales invalidas")
    if not u.get("active", True): raise HTTPException(403, "Cuenta desactivada")
    token = pyjwt.encode({"sub": u["id"], "exp": datetime.now(timezone.utc) + timedelta(days=30)}, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {"access_token": token, "user": {"id": u["id"], "email": u["email"], "name": u["name"], "role": u["role"]}}

@api_router.get("/vehicle-records", response_model=List[VehicleRecord])
async def list_records(u: Dict[str, Any] = Depends(get_current_user), status: Optional[str] = None):
    filt = {}
    if status: filt["status"] = status
    docs = await db.vehicle_records.find(filt).sort("created_at", -1).to_list(100)
    return docs

@api_router.get("/inspections", response_model=List[Inspection])
async def list_inspections(u: Dict[str, Any] = Depends(get_current_user)):
    docs = await db.inspections.find({}).sort("created_at", -1).to_list(100)
    return docs

@api_router.post("/vehicle-records")
async def create_record(body: Dict[str, Any], u: Dict[str, Any] = Depends(get_current_user)):
    body["id"] = str(uuid.uuid4())
    body["user_id"] = u["id"]
    body["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.vehicle_records.insert_one(body)
    return body

@api_router.get("/vehicle-records/{id}")
async def get_record(id: str):
    r = await db.vehicle_records.find_one({"id": id}, {"_id": 0})
    if not r: raise HTTPException(404)
    return r

@api_router.post("/inspections")
async def create_insp(body: InspectionCreate, u: Dict[str, Any] = Depends(get_current_user)):
    d = body.dict()
    d["id"] = str(uuid.uuid4())
    d["user_id"] = u["id"]
    d["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.inspections.insert_one(d)
    return d

@api_router.post("/shipping-tickets")
async def create_ticket(body: ShippingTicketCreate, u: Dict[str, Any] = Depends(get_current_user)):
    d = body.dict()
    d["id"] = str(uuid.uuid4())
    d["user_id"] = u["id"]
    d["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.shipping_tickets.insert_one(d)
    return d

app.include_router(api_router)
