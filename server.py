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
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'naf-inspection-secret-change-in-prod')
JWT_ALGORITHM = 'HS256'

security = HTTPBearer()

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
    active: bool

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
    placas_unidad: str
    numero_trailer: str
    status_general: str
    approval_status: str = "pendiente"
    inspector_nombre: str
    inspector_firma: str
    points: List[InspectionPoint]
    record_id: Optional[str] = None

async def _ensure_record_links(record: Dict[str, Any]) -> Dict[str, Any]:
    if not record: return record
    # Asegurar campos requeridos
    if "inspection_ids" not in record: record["inspection_ids"] = []
    if "has_shipping_ticket" not in record: record["has_shipping_ticket"] = False

    placas = record.get("entry", {}).get("placas_unidad", "").strip().upper()
    if not placas: return record
    pl_norm = re.sub(r'[^A-Z0-9]', '', placas)
    if not pl_norm: return record

    try:
        regex = ".*".join(list(pl_norm))
        # Buscar inspección si no tiene
        if not record.get("inspection_id"):
            i = await db.inspections.find_one({"placas_unidad": {"$regex": f".*{regex}.*", "$options": "i"}}, sort=[("created_at", -1)])
            if i:
                record["inspection_id"] = i["id"]
                record["inspection_ids"] = [i["id"]]
                if record["status"] == "entrada": record["status"] = "inspeccionado"

        # Buscar ticket si no tiene
        if not record.get("shipping_ticket_id"):
            t = await db.shipping_tickets.find_one({"placas_unidad": {"$regex": f".*{regex}.*", "$options": "i"}}, sort=[("created_at", -1)])
            if t:
                record["shipping_ticket_id"] = t["id"]
                record["has_shipping_ticket"] = True
    except: pass
    return record

def is_admin(u: Dict[str, Any]):
    return u.get("role") == "admin" or u.get("email") in ["d.trujillo@brancoindustries.com", "d4r005@gmail.com"]

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    try:
        p = pyjwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
        u = await db.users.find_one({"id": p.get("sub")}, {"_id": 0, "password_hash": 0})
        if not u: raise HTTPException(401)
        return u
    except: raise HTTPException(401)

app = FastAPI(); api_router = APIRouter(prefix="/api")

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(body: UserLogin):
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not bcrypt.checkpw(body.password.encode(), u["password_hash"]): raise HTTPException(401)
    token = pyjwt.encode({"sub": u["id"], "exp": datetime.now(timezone.utc) + timedelta(days=30)}, JWT_SECRET)
    return TokenResponse(access_token=token, user=UserPublic(**u))

@api_router.get("/vehicle-records", response_model=List[Dict[str, Any]])
async def list_recs(u: Dict[str, Any] = Depends(get_current_user)):
    docs = await db.vehicle_records.find({}, {"_id": 0, "entry.foto_frente_unidad": 0, "entry.foto_atras_caja": 0, "entry.foto_id_chofer": 0, "entry.firma_operador": 0}).sort("created_at", -1).to_list(100)
    res = []
    for d in docs:
        res.append(await _ensure_record_links(d))
    return res

@api_router.get("/vehicle-records/{id}", response_model=Dict[str, Any])
async def get_rec(id: str, u: Dict[str, Any] = Depends(get_current_user)):
    d = await db.vehicle_records.find_one({"id": id}, {"_id": 0})
    if not d: raise HTTPException(404)
    return await _ensure_record_links(d)

@api_router.patch("/vehicle-records/{id}/exit", response_model=VehicleRecord)
async def exit_rec(id: str, body: VehicleExit, u: Dict[str, Any] = Depends(get_current_user)):
    x = body.dict(); x["fecha_salida"] = datetime.now(timezone.utc).isoformat()
    await db.vehicle_records.update_one({"id": id}, {"$set": {"exit": x, "status": "salida"}})
    d = await db.vehicle_records.find_one({"id": id}, {"_id": 0})
    return VehicleRecord(**d)

@api_router.get("/inspections", response_model=List[Dict[str, Any]])
async def list_insps(u: Dict[str, Any] = Depends(get_current_user), scope: str = "mine"):
    filt = {} if scope == "all" and (u["role"] in ["supervisor", "admin"] or is_admin(u)) else {"user_id": u["id"]}
    docs = await db.inspections.find(filt, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs

@api_router.get("/shipping-tickets", response_model=List[Dict[str, Any]])
async def list_ticks(u: Dict[str, Any] = Depends(get_current_user)):
    return await db.shipping_tickets.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api_router.get("/shipping-tickets/{id}")
async def get_tick(id: str, u: Dict[str, Any] = Depends(get_current_user)):
    d = await db.shipping_tickets.find_one({"id": id}, {"_id": 0})
    if not d:
        # Fallback by record_id or plates
        d = await db.shipping_tickets.find_one({"record_id": id}, {"_id": 0})
    if not d: raise HTTPException(404)
    return d

@api_router.get("/activities")
async def acts(u: Dict[str, Any] = Depends(get_current_user)):
    return await db.activities.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
