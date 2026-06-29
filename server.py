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
    numero_trailer: str
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
    inspector_nombre: str
    inspector_firma: str
    fecha_hora: str = ""
    actividad_sospechosa: str = ""
    points: List[InspectionPoint]
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
async def list_records(u: Dict[str, Any] = Depends(get_current_user)):
    # OPTIMIZACIÓN: Solo obtenemos los registros. La vinculación pesada se hace en el Panel Maestro.
    docs = await db.vehicle_records.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return [VehicleRecord(**d) for d in docs]

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
    return VehicleRecord(**full_doc)

@api_router.get("/vehicle-records/{rec_id}", response_model=VehicleRecord)
async def get_record(rec_id: str, u: Dict[str, Any] = Depends(get_current_user)):
    d = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
    if not d: raise HTTPException(404)
    return VehicleRecord(**(await _ensure_record_links(d)))

@api_router.patch("/vehicle-records/{rec_id}/exit", response_model=VehicleRecord)
async def exit_record(rec_id: str, body: VehicleExit, u: Dict[str, Any] = Depends(get_current_user)):
    x = body.dict(); x["fecha_salida"] = datetime.now(timezone.utc).isoformat()
    if x.get("firma_guardia"): x["firma_guardia"] = ensure_clean_image(x["firma_guardia"])
    await db.vehicle_records.update_one({"id": rec_id}, {"$set": {"exit": x, "status": "salida"}})
    up = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
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
        await db.vehicle_records.update_one({"id": body.record_id}, {"$set": {"status": "inspeccionado"}, "$addToSet": {"inspection_ids": iid}})
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

@api_router.post("/inspections/{insp_id}/approve", response_model=Inspection)
async def approve_insp(insp_id: str, body: ApprovalBody, u: Dict[str, Any] = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    update = {"approval_status": "aprobada", "approval_note": body.note, "approved_by": body.name, "approved_by_name": body.name, "approved_sig": ensure_clean_image(body.signature), "approved_by_signature": ensure_clean_image(body.signature), "approved_at": now}
    await db.inspections.update_one({"id": insp_id}, {"$set": update})
    d = await db.inspections.find_one({"id": insp_id}, {"_id": 0})
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
        await db.vehicle_records.update_one({"id": body.record_id}, {"$set": {"shipping_ticket_id": tid, "has_shipping_ticket": True}})
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

# ========== Sincronización Externa (Google Sheets / Drive) ==========

async def sync_to_google_sheets(tipo: str, payload: Any):
    url = os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")
    if not url: return
    try:
        data = payload if isinstance(payload, dict) else payload.dict()
        data["webhook_type"] = tipo
        # Enviar de forma asíncrona usando executor para requests
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: requests.post(url, json=data, timeout=10))
    except Exception as e:
        logger.error(f"Error syncing to Google Sheets: {e}")

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
                {"placas_unidad": {"": f".*{regex}.*", "": "i"}},
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
                {"placas_unidad": {"": f".*{regex}.*", "": "i"}},
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

# --- Actividades ---
@api_router.get("/activities")
async def acts(u: Dict[str, Any] = Depends(get_current_user)):
    return await db.activities.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware)

@app.on_event("shutdown")
async def shutdown_db_client(): client.close()
