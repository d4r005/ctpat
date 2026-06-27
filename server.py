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
# Optimización de conexión para carga rápida
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
async def startup_db_client():
    # Crear índices para acelerar consultas críticas (menos de 3 segundos)
    await db.vehicle_records.create_index([("id", 1)], unique=True)
    await db.vehicle_records.create_index([("created_at", -1)])
    await db.vehicle_records.create_index([("entry.placas_unidad", 1)])
    await db.vehicle_records.create_index([("inspection_id", 1)])

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

    logging.info("Índices de base de datos creados/verificados correctamente.")

# ========== Models ==========
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: Optional[str] = "inspector"  # inspector | supervisor (only supervisors can register supervisors)

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
    room: str # 'general' or 'plates_XXXX'
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
    photo: str = ""  # base64 data url, optional

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
    approval_status: str = "pendiente"  # pendiente | aprobada | rechazada
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
    tipo_unidad: str = "sencillo" # sencillo | full
    sucursal: str = ""
    direccion: str = ""
    licencia_conductor: str = ""
    placas_unidad: str
    chofer_nombre: str
    compania_transporte: str = ""
    numero_tractor: str = ""
    compania_caja: str = ""
    numero_caja: str = ""  # trailer #
    sello_entrada: str = ""
    # Support for FULL (2nd trailer)
    compania_caja_2: str = ""
    numero_caja_2: str = ""
    sello_entrada_2: str = ""
    escolta: EscoltaInfo = EscoltaInfo()
    cortina_asignada: str = ""
    guardia_caseta_nombre: str
    condicion_carga: str = ""  # vacia | consolidada | otra | descarga
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
    firma_operador: str = ""  # base64 png
    declaraciones_aceptadas: bool = False
    fecha_entrada: Optional[str] = None

class VehicleExit(BaseModel):
    hora_apertura_cortina: str = ""
    hora_cierre_cortina: str = ""
    cortina_salida: str = ""
    sello_salida: str = ""
    sello_salida_2: str = ""
    condicion_salida: str = ""  # vacio | carga_cliente | consolidado
    destino: str = ""
    numero_tractor_salida: str = ""
    numero_caja_salida: str = ""
    numero_caja_salida_2: str = ""
    escolta: EscoltaInfo = EscoltaInfo()
    pallets: str = ""
    cajas: str = ""
    bultos: str = ""
    sello_vvtt_estado: str = ""  # bueno | malo
    sello_vvtt_estado_2: str = "" # bueno | malo
    sello_vvtt_foto: str = ""   # base64
    sello_vvtt_foto_2: str = "" # base64
    guardia_salida_nombre: str = ""
    firma_guardia: str = ""
    fecha_salida: Optional[str] = None

class VehicleRecord(BaseModel):
    id: str
    user_id: str
    status: str  # entrada | inspeccionado | salida
    entry: VehicleEntry
    exit: Optional[VehicleExit] = None
    inspection_id: Optional[str] = None
    inspection_ids: List[str] = []
    shipping_ticket_id: Optional[str] = None
    has_shipping_ticket: bool = False
    created_at: str


# ========== Helpers ==========
def add_watermark(base64_str: str) -> str:
    """Añade marca de agua (Planta NAF, Fecha, Hora) a una imagen base64"""
    if not base64_str or not isinstance(base64_str, str) or not base64_str.startswith('data:image'):
        return base64_str

    try:
        # Extraer base64
        if "," in base64_str:
            header, encoded = base64_str.split(",", 1)
        else:
            header, encoded = "data:image/jpeg;base64", base64_str

        image_data = base64.b64decode(encoded)
        img = Image.open(io.BytesIO(image_data))

        # Solución al cuadro negro: Si tiene transparencia, pegarla sobre fondo blanco
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            background = Image.new('RGB', img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3] if img.mode == 'RGBA' else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # Redimensionar agresivamente para asegurar que el correo sea ligero (Gmail límite 25MB)
        max_width = 600
        if img.width > max_width:
            ratio = max_width / float(img.width)
            new_height = int(float(img.height) * ratio)
            img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)

        draw = ImageDraw.Draw(img)
        # ... (texto marca de agua)
        now = datetime.now(timezone.utc).astimezone().strftime('%d/%m/%Y %H:%M')
        text = f"PLANTA NAF | {now}"
        width, height = img.size
        font_height = max(20, int(height / 25))
        draw.rectangle([0, height - font_height - 15, width, height], fill=(0, 0, 0))
        draw.text((15, height - font_height - 5), text, fill=(255, 255, 255))

        # Re-codificar a JPEG con calidad media para optimizar peso
        buffered = io.BytesIO()
        img.save(buffered, format="JPEG", quality=50, optimize=True)
        new_base64 = base64.b64encode(buffered.getvalue()).decode()
        return f"{header},{new_base64}"
    except Exception as e:
        print(f"Error al añadir marca de agua: {e}")
        return base64_str

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False

def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def is_admin(user: Dict[str, Any]) -> bool:
    admins = ["d.trujillo@brancoindustries.com", "d4r005@gmail.com"]
    return user.get("email") in admins or user.get("role") == "admin"

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    try:
        payload = pyjwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token inválido")
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido")

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Cuenta desactivada")

    # Ensure backward compatibility
    user.setdefault("role", "inspector")
    user.setdefault("active", True)
    return user

async def require_supervisor(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user.get("role") not in ["supervisor", "admin"] and not is_admin(user):
        raise HTTPException(status_code=403, detail="Solo supervisores o administradores pueden realizar esta acción")
    return user

async def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Acceso restringido al Administrador del Sistema")
    return user


import asyncio

async def sync_to_google_sheets(process_type: str, data: Dict[str, Any], report_html: str = ""):
    """
    Envía los datos a Google Sheets para seguimiento en tiempo real con detalle completo por proceso.
    Y organiza archivos en Google Drive por Mes -> Placas + Fecha.
    """
    webhook_url = os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")
    if not webhook_url:
        return

    def send_request():
        try:
            now = datetime.now(timezone.utc)
            # Nombres de meses en español
            meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
            nombre_mes = meses[now.month - 1]

            # Extraer placas y fecha para organización de carpetas
            placas = data.get("placas_unidad") or data.get("entry", {}).get("placas_unidad", "SIN_PLACAS")
            fecha = now.strftime("%d.%m.%Y")

            # Payload base con información de auditoría y metadatos de organización
            payload = {
                "proceso": process_type.upper(),
                "sheet_target": process_type,
                "timestamp": now.isoformat(),
                "id_vinculo": data.get("id", ""),
                "usuario_accion": data.get("user_id", "sistema"),
                "mes_carpeta": nombre_mes,
                "placas_carpeta": placas,
                "fecha_carpeta": fecha,
                "carpeta_final": f"{placas} {fecha}",
                "reporte_html": report_html # HTML para convertir a PDF en Drive
            }

            # 1. REGISTRO DE ENTRADA (CASETA)
            if process_type == 'entrada':
                e = data.get("entry", {})
                payload.update({
                    "fecha_hora": e.get("fecha_entrada"),
                    "placas_unidad": e.get("placas_unidad"),
                    "chofer": e.get("chofer_nombre"),
                    "licencia": e.get("licencia_conductor"),
                    "compania_transporte": e.get("compania_transporte"),
                    "numero_tractor": e.get("numero_tractor"),
                    "compania_caja": e.get("compania_caja"),
                    "numero_caja": e.get("numero_caja"),
                    "sello_entrada": e.get("sello_entrada"),
                    "cortina_asignada": e.get("cortina_asignada"),
                    "condicion_carga": e.get("condicion_carga"),
                    "guia": e.get("numero_guia"),
                    "requerimiento": e.get("numero_requerimiento"),
                    "orden_compra": e.get("numero_orden_compra"),
                    "destino": e.get("destino"),
                    "guardia_entrada": e.get("guardia_caseta_nombre"),
                    "foto_frente": e.get("foto_frente_unidad"),
                    "foto_atras": e.get("foto_atras_caja"),
                    "foto_id": e.get("foto_id_chofer")
                })

            # 2. INSPECCIÓN C-TPAT
            elif process_type == 'inspeccion':
                tipo = data.get("inspection_type", "19_puntos")
                payload.update({
                    "fecha_hora": data.get("created_at"),
                    "tipo_inspeccion": tipo,
                    "placas_unidad": data.get("placas_unidad"),
                    "numero_trailer": data.get("numero_trailer"),
                    "numero_precinto": data.get("numero_precinto"),
                    "sello_alta_seguridad": data.get("sello_alta_seguridad"),
                    "inspector": data.get("inspector_nombre"),
                    "estado_general": data.get("status_general"),
                    "puntos_malos": len([p for p in data.get("points", []) if p.get("estado") == 'malo']),
                    "estatus_aprobacion": data.get("approval_status"),
                    "supervisor": data.get("approved_by_name"),
                    "fecha_aprobacion": data.get("approved_at"),
                    "nota_aprobacion": data.get("approval_note")
                })
                # Enviar estados de los puntos individualmente para el Excel (p_1, p_2, etc.)
                for p in data.get("points", []):
                    payload[f"p_{p['number']}"] = p.get("estado", "")
                    if p.get("estado") == 'malo' and p.get("photo"):
                        payload[f"foto_falla_punto_{p['number']}"] = p["photo"]

            # 3. TICKET DE EMBARQUE
            elif process_type == 'embarque':
                payload.update({
                    "fecha_hora": data.get("created_at"),
                    "cliente": data.get("cliente"),
                    "almacenista": data.get("almacenista"),
                    "chofer_operador": data.get("operador"),
                    "placas_unidad": data.get("placas_unidad"),
                    "numero_caja": data.get("numero_caja"),
                    "pallets": data.get("numero_pallets"),
                    "sello_final": data.get("numero_sello"),
                    "area_embarque": data.get("area"),
                    "hora_llegada": data.get("hora_llegada"),
                    "hora_apertura": data.get("hora_apertura_cortina"),
                    "hora_cierre": data.get("hora_cierre_cortina"),
                    "hora_salida": data.get("hora_salida"),
                    "guardia_seguridad": data.get("nombre_guardia"),
                    "foto_inicio": data.get("foto_inicio_carga"),
                    "foto_media": data.get("foto_media_carga"),
                    "foto_final": data.get("foto_final_carga")
                })

            # 4. REGISTRO DE SALIDA (CASETA FINAL)
            elif process_type == 'salida':
                e = data.get("entry", {})
                x = data.get("exit", {})
                payload.update({
                    "fecha_entrada": e.get("fecha_entrada"),
                    "fecha_salida": x.get("fecha_salida"),
                    "placas_unidad": e.get("placas_unidad"),
                    "chofer": e.get("chofer_nombre"),
                    "destino_final": x.get("destino"),
                    "condicion_salida": x.get("condicion_salida"),
                    "pallets_salida": x.get("pallets"),
                    "sello_salida": x.get("sello_salida"),
                    "guardia_salida": x.get("guardia_salida_nombre"),
                    "sello_vvtt": x.get("sello_vvtt_estado"),
                    "foto_sello_vvtt": x.get("sello_vvtt_foto")
                })

            requests.post(webhook_url, json=payload, timeout=60)
        except Exception as e:
            logger.error(f"Error en sincronización Excel/Drive Avanzada: {e}")

    # Ejecutar en un hilo separado para no bloquear la respuesta principal del servidor
    asyncio.create_task(asyncio.to_thread(send_request))


# ========== Chat Internal ==========
@api_router.post("/chat/send", response_model=ChatMessage)
async def send_chat_message(body: ChatMessageCreate, current_user: Dict[str, Any] = Depends(get_current_user)):
    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    doc = {
        "id": msg_id,
        "user_id": current_user["id"],
        "user_name": current_user["name"],
        "room": body.room.upper().strip(),
        "text": body.text.strip(),
        "created_at": now
    }

    await db.chat_messages.insert_one(doc)
    return ChatMessage(**{k: v for k, v in doc.items() if k != "_id"})

@api_router.get("/chat/{room}", response_model=List[ChatMessage])
async def list_chat_messages(room: str, limit: int = 50, current_user: Dict[str, Any] = Depends(get_current_user)):
    docs = await db.chat_messages.find({"room": room.upper().strip()})\
        .sort("created_at", -1)\
        .to_list(limit)

    # Devolver en orden cronológico (el más viejo primero para el chat)
    docs.reverse()
    return [ChatMessage(**{k: v for k, v in d.items() if k != "_id"}) for d in docs]


# ========== Auth Routes ==========
@api_router.get("/")
async def root():
    try:
        # Verifica conexión a la base de datos
        await db.command("ping")
        db_status = "online"
    except Exception as e:
        db_status = f"offline: {str(e)}"

    return {
        "message": "NAF Inspección API",
        "status": "running",
        "database": db_status,
        "environment": os.environ.get("ENV_NAME", "production")
    }


@api_router.post("/auth/register", response_model=TokenResponse)
async def register(body: UserRegister):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="El correo ya está registrado")

    # First user or specific emails become admin automatically
    total_users = await db.users.count_documents({})
    is_admin_email = body.email.lower() in ["d.trujillo@brancoindustries.com", "d4r005@gmail.com"]
    role = "admin" if (total_users == 0 or is_admin_email) else "inspector"

    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": body.email.lower(),
        "name": body.name,
        "role": role,
        "active": True,
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_id)
    return TokenResponse(
        access_token=token,
        user=UserPublic(id=user_id, email=body.email.lower(), name=body.name, role=role, active=True),
    )


@api_router.post("/auth/login", response_model=TokenResponse)
async def login(body: UserLogin):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Cuenta desactivada")

    # Auto-upgrade specific emails to admin if it isn't already
    if body.email.lower() in ["d.trujillo@brancoindustries.com", "d4r005@gmail.com"] and user.get("role") != "admin":
        await db.users.update_one({"id": user["id"]}, {"$set": {"role": "admin"}})
        user["role"] = "admin"

    token = create_token(user["id"])
    return TokenResponse(
        access_token=token,
        user=UserPublic(
            id=user["id"], email=user["email"], name=user["name"],
            role=user.get("role", "inspector"), active=user.get("active", True),
        ),
    )


@api_router.get("/auth/me", response_model=UserPublic)
async def me(current_user: Dict[str, Any] = Depends(get_current_user)):
    return UserPublic(
        id=current_user["id"], email=current_user["email"], name=current_user["name"],
        role=current_user.get("role", "inspector"), active=current_user.get("active", True),
    )


# ========== User Management (admin only) ==========
@api_router.get("/users", response_model=List[UserPublic])
async def list_users(current_user: Dict[str, Any] = Depends(require_admin)):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    return [
        UserPublic(
            id=d["id"], email=d["email"], name=d["name"],
            role=d.get("role", "inspector"), active=d.get("active", True),
        )
        for d in docs
    ]


@api_router.post("/users/{user_id}/toggle-active", response_model=UserPublic)
async def toggle_user_active(user_id: str, current_user: Dict[str, Any] = Depends(require_admin)):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    new_active = not user.get("active", True)
    await db.users.update_one({"id": user_id}, {"$set": {"active": new_active}})
    return UserPublic(
        id=user["id"], email=user["email"], name=user["name"],
        role=user.get("role", "inspector"), active=new_active,
    )


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: Dict[str, Any] = Depends(require_admin)):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")
    res = await db.users.delete_one({"id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"ok": True}


@api_router.patch("/users/{user_id}")
async def update_user(user_id: str, body: Dict[str, Any], current_user: Dict[str, Any] = Depends(require_admin)):
    update_data = {}
    if "name" in body: update_data["name"] = body["name"]
    if "role" in body: update_data["role"] = body["role"]
    if "active" in body: update_data["active"] = body["active"]

    if not update_data:
        raise HTTPException(status_code=400, detail="No hay datos para actualizar")

    res = await db.users.update_one({"id": user_id}, {"$set": update_data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"ok": True}


@api_router.post("/users/create-inspector", response_model=UserPublic)
async def create_inspector(body: UserRegister, current_user: Dict[str, Any] = Depends(require_admin)):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="El correo ya está registrado")
    user_id = str(uuid.uuid4())
    role = body.role if body.role in ("inspector", "supervisor") else "inspector"
    doc = {
        "id": user_id, "email": body.email.lower(), "name": body.name,
        "role": role, "active": True,
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return UserPublic(id=user_id, email=doc["email"], name=doc["name"], role=role, active=True)


# ========== Inspections ==========
def ensure_clean_image(base64_str: str) -> str:
    """Solución definitiva para cuadros negros: Fuerza fondo blanco y formato JPEG.
    Ahora también maneja firmas antiguas que podrían no tener el encabezado data:image."""
    if not base64_str or not isinstance(base64_str, str) or len(base64_str) < 10:
        return base64_str

    # Si no tiene el encabezado, intentamos agregarlo para procesarla
    processed_b64 = base64_str
    if not base64_str.startswith('data:image'):
        processed_b64 = f"data:image/png;base64,{base64_str}"

    try:
        # 1. Extraer el contenido base64 puro
        pure_base64 = processed_b64.split(",")[-1]
        img_data = base64.b64decode(pure_base64)
        img = Image.open(io.BytesIO(img_data))

        # 2. Crear una imagen nueva BLANCA (esto mata cualquier transparencia que se vea negra)
        clean_img = Image.new("RGB", img.size, (255, 255, 255))

        # 3. Pegar la firma/foto encima.
        if img.mode == 'RGBA':
            clean_img.paste(img, mask=img.split()[3])
        elif img.mode in ('P', 'L'):
            temp_rgba = img.convert('RGBA')
            clean_img.paste(temp_rgba, mask=temp_rgba.split()[3])
        else:
            clean_img.paste(img)

        # 4. Guardar como JPEG ligero
        buf = io.BytesIO()
        clean_img.save(buf, format="JPEG", quality=85) # Un poco más de calidad para firmas
        new_encoded = base64.b64encode(buf.getvalue()).decode()

        return f"data:image/jpeg;base64,{new_encoded}"
    except Exception as e:
        logger.error(f"Error reparando imagen/firma: {e}")
        # Si falló y no tenía encabezado, al menos devolvemos el intento con encabezado
        # para que el <img> lo intente renderizar
        return processed_b64

def _serialize_inspection(doc: Dict[str, Any]) -> Inspection:
    # Reparar solo si detectamos que no tiene el encabezado (compatibilidad)
    # pero evitamos procesar con Pillow en cada GET para mantener la velocidad
    for f in ["inspector_firma", "verificador_firma", "approved_by_signature"]:
        val = doc.get(f)
        if val and isinstance(val, str) and not val.startswith('data:image') and len(val) > 50:
            doc[f] = f"data:image/png;base64,{val}"

    return Inspection(
        id=doc["id"],
        user_id=doc["user_id"],
        inspection_type=doc.get("inspection_type", "19_puntos"),
        inspector_email=doc.get("inspector_email", ""),
        compania_transportista=doc["compania_transportista"],
        placas_unidad=doc["placas_unidad"],
        numero_trailer=doc["numero_trailer"],
        numero_precinto=doc["numero_precinto"],
        sello_alta_seguridad=doc["sello_alta_seguridad"],
        sello_verificado=doc.get("sello_verificado", False),
        points=[InspectionPoint(**p) for p in doc.get("points", [])],
        actividad_sospechosa=doc.get("actividad_sospechosa", ""),
        inspector_nombre=doc.get("inspector_nombre", ""),
        inspector_firma=doc.get("inspector_firma", ""),
        verificador_nombre=doc.get("verificador_nombre", ""),
        verificador_firma=doc.get("verificador_firma", ""),
        fecha_hora=doc.get("fecha_hora", ""),
        created_at=doc.get("created_at", ""),
        status_general=doc.get("status_general", "bueno"),
        approval_status=doc.get("approval_status", "pendiente"),
        approval_note=doc.get("approval_note", ""),
        approved_by_name=doc.get("approved_by_name", ""),
        approved_by_signature=doc.get("approved_by_signature", ""),
        approved_at=doc.get("approved_at", ""),
    )


@api_router.post("/inspections", response_model=Inspection)
async def create_inspection(body: InspectionCreate, current_user: Dict[str, Any] = Depends(get_current_user)):
    if body.client_uuid:
        existing = await db.inspections.find_one(
            {"user_id": current_user["id"], "client_uuid": body.client_uuid},
            {"_id": 0}
        )
        if existing:
            return _serialize_inspection(existing)

    insp_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    fecha_hora = body.fecha_hora or now
    status_general = "malo" if any(p.estado == "malo" for p in body.points) else "bueno"

    doc = {
        "id": insp_id,
        "user_id": current_user["id"],
        "inspection_type": body.inspection_type,
        "inspector_email": current_user["email"],
        "compania_transportista": body.compania_transportista,
        "placas_unidad": body.placas_unidad,
        "numero_trailer": body.numero_trailer,
        "numero_precinto": body.numero_precinto,
        "sello_alta_seguridad": body.sello_alta_seguridad,
        "sello_verificado": body.sello_verificado,
        "points": [p.dict() for p in body.points],
        "actividad_sospechosa": body.actividad_sospechosa,
        "inspector_nombre": body.inspector_nombre,
        "inspector_firma": ensure_clean_image(body.inspector_firma), # Clean on save!
        "verificador_nombre": body.verificador_nombre,
        "verificador_firma": ensure_clean_image(body.verificador_firma), # Clean on save!
        "fecha_hora": fecha_hora,
        "created_at": now,
        "status_general": status_general,
        "approval_status": "pendiente",
        "approval_note": "",
        "approved_by_name": "",
        "approved_at": "",
        "client_uuid": body.client_uuid,
    }

    # Process point photos to avoid black boxes and reduce size
    for p in doc["points"]:
        if p.get("photo"):
            p["photo"] = ensure_clean_image(p["photo"])

    await db.inspections.insert_one(doc)

    # Autolink to vehicle record if record_id provided
    if body.record_id:
        try:
            # Maintain both legacy field and new list field for backward compatibility
            await db.vehicle_records.update_one(
                {"id": body.record_id},
                {
                    "$set": {"inspection_id": insp_id, "status": "inspeccionado"},
                    "$addToSet": {"inspection_ids": insp_id}
                }
            )
            logger.info(f"Auto-linked inspection {insp_id} to record {body.record_id}")
        except Exception as e:
            logger.error(f"Error auto-linking inspection: {e}")

    # Log Activity
    await _log_activity(
        "inspection", insp_id,
        f"Nueva Inspección: {body.placas_unidad}",
        f"Realizada por {body.inspector_nombre}",
        current_user["name"],
        status_general
    )

    # Notificar a Supervisores: SE REQUIERE APROBACIÓN
    await _notify_supervisors(
        title="Aprobación Necesaria",
        message=f"La unidad {body.placas_unidad} ha sido inspeccionada por {body.inspector_nombre} y requiere aprobación.",
        inspection_id=insp_id
    )

    # Sync to Google Sheets
    try:
        await sync_to_google_sheets("inspeccion", doc)
    except: pass

    return _serialize_inspection(doc)


@api_router.get("/inspections", response_model=List[Inspection])
async def list_inspections(
    current_user: Dict[str, Any] = Depends(get_current_user),
    scope: str = Query("mine", description="mine | all (all requires supervisor)"),
    inspector_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    summary: bool = Query(False)
):
    filt: Dict[str, Any] = {}
    if scope == "all":
        if current_user.get("role") not in ["supervisor", "admin"] and not is_admin(current_user):
            raise HTTPException(status_code=403, detail="Solo supervisores o administradores pueden ver todas las inspecciones")
        if inspector_id:
            filt["user_id"] = inspector_id
    else:
        filt["user_id"] = current_user["id"]

    if date_from or date_to:
        date_filt: Dict[str, Any] = {}
        if date_from:
            date_filt["$gte"] = date_from
        if date_to:
            date_filt["$lte"] = date_to + "T23:59:59.999999"
        filt["created_at"] = date_filt

    projection = {"_id": 0, "client_uuid": 0}
    if summary:
        projection["points"] = 0
        projection["inspector_firma"] = 0
        projection["verificador_firma"] = 0
        projection["approved_by_signature"] = 0

    docs = await db.inspections.find(filt, projection).sort("created_at", -1).to_list(1000 if summary else 500)
    return [_serialize_inspection(d) for d in docs]


@api_router.get("/inspections/export")
async def export_csv(
    mode: str = Query("summary", description="summary | detailed"),
    scope: str = Query("mine", description="mine | all"),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    filt: Dict[str, Any] = {}
    if scope == "all":
        if current_user.get("role") != "supervisor":
            raise HTTPException(status_code=403, detail="Solo supervisores")
    else:
        filt["user_id"] = current_user["id"]

    if date_from or date_to:
        date_filt: Dict[str, Any] = {}
        if date_from:
            date_filt["$gte"] = date_from
        if date_to:
            date_filt["$lte"] = date_to + "T23:59:59.999999"
        filt["created_at"] = date_filt

    docs = await db.inspections.find(filt, {"_id": 0, "client_uuid": 0}).sort("created_at", -1).to_list(5000)

    buf = io.StringIO()
    writer = csv.writer(buf)

    if mode == "detailed":
        writer.writerow([
            "ID Inspeccion", "Fecha", "Inspector", "Compania", "Placas", "Trailer", "Precinto",
            "Punto #", "Punto", "Estado", "Comentarios", "Estado General", "Aprobacion"
        ])
        for d in docs:
            for p in d.get("points", []):
                writer.writerow([
                    d["id"], d.get("fecha_hora", ""), d.get("inspector_nombre", ""),
                    d.get("compania_transportista", ""), d.get("placas_unidad", ""),
                    d.get("numero_trailer", ""), d.get("numero_precinto", ""),
                    p.get("number"), p.get("name"), p.get("estado"), p.get("comentarios", ""),
                    d.get("status_general", ""), d.get("approval_status", "pendiente"),
                ])
    else:
        writer.writerow([
            "ID Inspeccion", "Fecha", "Inspector", "Compania", "Placas", "Trailer",
            "Precinto", "Sello Alta Seg", "Sello Verificado",
            "Estado General", "Fallas", "Aprobacion", "Aprobado Por", "Actividad Sospechosa"
        ])
        for d in docs:
            fallas = sum(1 for p in d.get("points", []) if p.get("estado") == "malo")
            writer.writerow([
                d["id"], d.get("fecha_hora", ""), d.get("inspector_nombre", ""),
                d.get("compania_transportista", ""), d.get("placas_unidad", ""),
                d.get("numero_trailer", ""), d.get("numero_precinto", ""),
                d.get("sello_alta_seguridad", ""), "SI" if d.get("sello_verificado") else "NO",
                d.get("status_general", ""), fallas,
                d.get("approval_status", "pendiente"), d.get("approved_by_name", ""),
                d.get("actividad_sospechosa", "").replace("\n", " "),
            ])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="naf_inspecciones_{mode}.csv"'},
    )


@api_router.get("/inspections/{inspection_id}", response_model=Inspection)
async def get_inspection(inspection_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    filt: Dict[str, Any] = {"id": inspection_id}
    # Permitir que supervisores y admins vean cualquier inspección
    if current_user.get("role") not in ["supervisor", "admin"] and not is_admin(current_user):
        filt["user_id"] = current_user["id"]
    doc = await db.inspections.find_one(filt, {"_id": 0, "client_uuid": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")
    return _serialize_inspection(doc)


@api_router.put("/inspections/{inspection_id}", response_model=Inspection)
async def update_inspection(
    inspection_id: str, body: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(require_admin),
):
    doc = await db.inspections.find_one({"id": inspection_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")

    # Update only allowed fields
    update_data = {k: v for k, v in body.items() if k in [
        "compania_transportista", "placas_unidad", "numero_trailer",
        "numero_precinto", "sello_alta_seguridad", "sello_verificado",
        "actividad_sospechosa", "inspector_nombre", "inspector_firma",
        "verificador_nombre", "verificador_firma",
        "approved_by_name", "approved_by_signature", "approval_status", "approval_note",
        "points", "status_general", "inspection_type"
    ]}

    if "points" in update_data:
        update_data["status_general"] = "malo" if any(p.get("estado") == "malo" for p in update_data["points"]) else "bueno"

    await db.inspections.update_one({"id": inspection_id}, {"$set": update_data})
    updated_doc = await db.inspections.find_one({"id": inspection_id}, {"_id": 0})

    # Sync update to Google Sheets
    try:
        await sync_to_google_sheets("inspeccion", updated_doc)
    except Exception as e:
        logger.error(f"Error syncing update to Google Sheets: {e}")

    return _serialize_inspection(updated_doc)


@api_router.post("/inspections/{inspection_id}/send-report")
async def manual_send_report(
    inspection_id: str,
    body: Optional[Dict[str, str]] = None,
    current_user: Dict[str, Any] = Depends(require_supervisor),
):
    # This manually triggers the consolidated report for the unity related to this inspection
    recipient = body.get("recipient") if body else None
    insp = await db.inspections.find_one({"id": inspection_id})
    if not insp:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")

    placas = insp.get("placas_unidad", "").strip()
    # Look for the vehicle record that corresponds to this inspection
    record = await db.vehicle_records.find_one({"inspection_id": inspection_id})
    if not record and placas:
        # Intento exacto
        record = await db.vehicle_records.find_one(
            {"entry.placas_unidad": placas},
            sort=[("created_at", -1)]
        )
        if not record:
            # Intento flexible
            norm_placas = re.sub(r'[^a-zA-Z0-9]', '', placas)
            if norm_placas:
                flex_regex = ".*".join(list(norm_placas))
                record = await db.vehicle_records.find_one(
                    {"entry.placas_unidad": {"$regex": flex_regex, "$options": "i"}},
                    sort=[("created_at", -1)]
                )

    if not record:
        raise HTTPException(status_code=404, detail="No se encontró registro de caseta vinculado para generar reporte consolidado")

    try:
        # Trigger the existing report logic
        success = await _trigger_automatic_report(record["id"], recipient)
        if success:
            return {"ok": True, "message": f"Reporte enviado exitosamente a {recipient or 'destinatario predeterminado'}"}
        else:
            # Si success es False, es que send_automatic_report falló (SMTP configurado pero falló el envío)
            raise HTTPException(status_code=500, detail="Error: Fallo en el servidor de correo (SMTP). Posiblemente el reporte es muy pesado.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Manual report error: {e}")
        raise HTTPException(status_code=500, detail=f"Fallo técnico al enviar: {str(e)}")


@api_router.post("/vehicle-records/{rec_id}/send-report")
async def manual_send_record_report(
    rec_id: str,
    body: Optional[Dict[str, str]] = None,
    current_user: Dict[str, Any] = Depends(require_supervisor),
):
    recipient = body.get("recipient") if body else None
    try:
        success = await _trigger_automatic_report(rec_id, recipient)
        if success:
            return {"ok": True, "message": "Reporte enviado exitosamente"}
        else:
            raise HTTPException(status_code=500, detail="Error: Fallo en el servidor de correo (SMTP). Posiblemente el reporte es muy pesado.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Manual report error: {e}")
        raise HTTPException(status_code=500, detail=f"Fallo técnico al enviar: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/inspections/{inspection_id}/approve", response_model=Inspection)
async def approve_inspection(
    inspection_id: str, body: ApprovalBody,
    current_user: Dict[str, Any] = Depends(require_supervisor),
):
    doc = await db.inspections.find_one({"id": inspection_id}, {"_id": 0, "client_uuid": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")
    update = {
        "approval_status": "aprobada",
        "approval_note": body.note,
        "approved_by_name": body.name or current_user["name"],
        "approved_by_signature": ensure_clean_image(body.signature), # Clean signature!
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.inspections.update_one({"id": inspection_id}, {"$set": update})
    doc.update(update)

    await _log_activity(
        "inspection", inspection_id,
        f"Inspección Aprobada: {doc.get('placas_unidad')}",
        f"Aprobada por {body.name or current_user['name']}",
        current_user["name"],
        "bueno"
    )

    await _create_notification(
        user_id=doc["user_id"],
        title="Inspección aprobada ✓",
        message=f"¡Atención! Tu inspección de la unidad {doc.get('placas_unidad','')} ha sido APROBADA por {current_user['name']}.",
        inspection_id=inspection_id,
    )

    # Sync update to Google Sheets
    try:
        await sync_to_google_sheets("inspeccion", doc)
    except: pass

    return _serialize_inspection(doc)


@api_router.post("/inspections/{inspection_id}/reject", response_model=Inspection)
async def reject_inspection(
    inspection_id: str, body: ApprovalBody,
    current_user: Dict[str, Any] = Depends(require_supervisor),
):
    doc = await db.inspections.find_one({"id": inspection_id}, {"_id": 0, "client_uuid": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")
    update = {
        "approval_status": "rechazada",
        "approval_note": body.note,
        "approved_by_name": body.name or current_user["name"],
        "approved_by_signature": ensure_clean_image(body.signature), # Clean signature!
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.inspections.update_one({"id": inspection_id}, {"$set": update})
    doc.update(update)

    await _log_activity(
        "inspection", inspection_id,
        f"Inspección RECHAZADA: {doc.get('placas_unidad')}",
        f"Rechazada por {body.name or current_user['name']}. Motivo: {body.note}",
        current_user["name"],
        "malo"
    )

    await _create_notification(
        user_id=doc["user_id"],
        title="Inspección RECHAZADA 🚨",
        message=f"URGENTE: La unidad {doc.get('placas_unidad','')} ha sido RECHAZADA por {current_user['name']}. Motivo: {body.note}",
        inspection_id=inspection_id,
    )

    # ALERTA AUTOMÁTICA POR RECHAZO (Seguridad) - En segundo plano
    async def bg_reject_alert():
        try:
            record = await db.vehicle_records.find_one({"inspection_id": inspection_id})
            if record:
                await _trigger_automatic_report(record["id"])
            else:
                await send_automatic_report(
                    f"ALERTA DE SEGURIDAD: Inspección RECHAZADA - {doc.get('placas_unidad')}",
                    os.environ.get("REPORT_RECIPIENT", "d.trujillo@brancoindustries.com"),
                    f"La inspección para la unidad <b>{doc.get('placas_unidad')}</b> ha sido RECHAZADA.<br/>Motivo: {body.note}"
                )
        except Exception as e:
            logger.error(f"Error enviando alerta de rechazo: {e}")

    asyncio.create_task(bg_reject_alert())

    # Sync update to Google Sheets
    try:
        await sync_to_google_sheets("inspeccion", doc)
    except: pass

    return _serialize_inspection(doc)


# ========== Notifications ==========
class Notification(BaseModel):
    id: str
    user_id: str
    title: str
    message: str
    inspection_id: Optional[str] = None
    read: bool = False
    created_at: str


async def _create_notification(user_id: str, title: str, message: str, inspection_id: Optional[str] = None):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "title": title,
        "message": message,
        "inspection_id": inspection_id,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.notifications.insert_one(doc)

async def _notify_supervisors(title: str, message: str, inspection_id: Optional[str] = None):
    """Envía una notificación a todos los supervisores y administradores"""
    supervisors = await db.users.find({"role": {"$in": ["supervisor", "admin"]}}).to_list(100)
    for sup in supervisors:
        await _create_notification(sup["id"], title, message, inspection_id)

async def _log_activity(type: str, item_id: str, title: str, subtitle: str, user_name: str, status: str = ""):
    """Registra actividad para el panel de inicio"""
    doc = {
        "id": item_id,
        "type": type, # inspection | caseta | embarque
        "title": title,
        "subtitle": subtitle,
        "user_name": user_name,
        "status": status,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.activities.insert_one(doc)


# ========== Email Utility ==========
async def send_automatic_report(subject: str, recipient: str, body_html: str):
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", 587))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASS")

    if not all([smtp_host, smtp_user, smtp_pass]):
        logger.error("SMTP not configured. Skipping email.")
        return False

    message = MIMEMultipart()
    message["From"] = smtp_user
    message["To"] = recipient
    message["Subject"] = subject
    message.attach(MIMEText(body_html, "html"))

    try:
        await aiosmtplib.send(
            message,
            hostname=smtp_host,
            port=smtp_port,
            username=smtp_user,
            password=smtp_pass,
            use_tls=(smtp_port == 465),
            start_tls=(smtp_port == 587),
            timeout=60,
        )
        logger.info(f"Reporte enviado exitosamente a {recipient}")
        return True
    except Exception as e:
        logger.error(f"Error al enviar correo a {recipient}: {e}")
        return False


@api_router.get("/notifications", response_model=List[Notification])
async def list_notifications(current_user: Dict[str, Any] = Depends(get_current_user)):
    docs = await db.notifications.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return [Notification(**d) for d in docs]

@api_router.get("/activities")
async def get_recent_activities(
    limit: int = Query(50, le=100),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Retorna una lista unificada de las actividades más recientes (inspecciones, caseta, embarque)."""
    # 1. Inspections (Excluding large fields like photos)
    insp_filt = {}
    if current_user["role"] not in ["supervisor", "admin"]:
        insp_filt["user_id"] = current_user["id"]
    inspections = await db.inspections.find(insp_filt, {"_id": 0, "points": 0, "inspector_firma": 0, "verificador_firma": 0}).sort("created_at", -1).to_list(limit)

    # 2. Vehicle Records
    vec_filt = {}
    if current_user["role"] not in ["supervisor", "admin"]:
        vec_filt["user_id"] = current_user["id"]
    records = await db.vehicle_records.find(vec_filt, {"_id": 0, "entry.foto_frente_unidad": 0, "entry.foto_atras_caja": 0, "entry.foto_id_chofer": 0, "exit.sello_vvtt_foto": 0, "entry.firma_operador": 0}).sort("created_at", -1).to_list(limit)

    # 3. Shipping Tickets
    ship_filt = {}
    if current_user["role"] not in ["supervisor", "admin"]:
        ship_filt["user_id"] = current_user["id"]
    tickets = await db.shipping_tickets.find(ship_filt, {"_id": 0, "foto_inicio_carga": 0, "foto_media_carga": 0, "foto_final_carga": 0, "firma_almacenista": 0, "firma_guardia": 0}).sort("created_at", -1).to_list(limit)

    # Unify
    activities = []
    for i in inspections:
        activities.append({
            "id": i["id"],
            "type": "inspection",
            "title": f"Inspección: {i.get('placas_unidad')}",
            "subtitle": f"{i.get('compania_transportista')} · {i.get('numero_trailer')}",
            "status": i.get("status_general"),
            "created_at": i["created_at"],
            "user_name": i.get("inspector_nombre", "Inspector"),
            "inspection_type": i.get("inspection_type")
        })

    for r in records:
        title = "Entrada Vehículo" if r["status"] == "entrada" else "Salida Vehículo"
        activities.append({
            "id": r["id"],
            "type": "caseta",
            "title": f"{title}: {r['entry'].get('placas_unidad')}",
            "subtitle": f"{r['entry'].get('chofer_nombre')} · {r['entry'].get('compania_transporte', '')}",
            "status": r["status"],
            "created_at": r["created_at"],
            "user_name": r['entry'].get('guardia_caseta_nombre', "Guardia")
        })

    for t in tickets:
        activities.append({
            "id": t["id"],
            "type": "embarque",
            "title": f"Ticket Embarque: {t.get('placas_unidad')}",
            "subtitle": f"Cliente: {t.get('cliente')} · {t.get('operador')}",
            "status": "ticket",
            "created_at": t["created_at"],
            "user_name": t.get("almacenista")
        })

    # Sort all by created_at descending
    activities.sort(key=lambda x: x["created_at"], reverse=True)
    return activities[:limit]


@api_router.post("/test-sheets")
async def test_sheets(current_user: Dict[str, Any] = Depends(require_admin)):
    """Ruta para probar la conexión con Google Sheets"""
    test_data = {
        "id": str(uuid.uuid4()),
        "test": True,
        "message": "Prueba de conexión desde SRIUC API a Google Sheets",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await sync_to_google_sheets("entrada", {"id": test_data["id"], "entry": {"placas_unidad": "TEST-123", "chofer_nombre": "PRUEBA", "compania_transporte": "NAF", "numero_caja": "000"}})
    return {"message": "Petición de prueba enviada a Google Sheets. Revisa tu Excel."}


@api_router.post("/test-email")
async def test_email(current_user: Dict[str, Any] = Depends(require_admin)):
    """Ruta para probar la configuración SMTP"""
    recipient = os.environ.get("REPORT_RECIPIENT", "d.trujillo@brancoindustries.com")
    subject = "🧪 Prueba de Conexión SMTP - SRIUC"
    html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #0A2540;">Prueba de Sistema SRIUC</h2>
            <p>Este es un correo de prueba para verificar que la configuración SMTP es correcta.</p>
            <p><b>Servidor:</b> {os.environ.get('SMTP_HOST')}</p>
            <p><b>Usuario:</b> {os.environ.get('SMTP_USER')}</p>
            <p><b>Fecha/Hora:</b> {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}</p>
            <hr>
            <p style="font-size: 12px; color: #666;">Si recibiste este correo, el envío de reportes automáticos debería funcionar correctamente.</p>
        </body>
    </html>
    """
    try:
        await send_automatic_report(subject, recipient, html)
        return {"message": f"Correo de prueba enviado exitosamente a {recipient}"}
    except Exception as e:
        logger.error(f"Error en test-email: {e}")
        raise HTTPException(status_code=500, detail=f"Error al enviar correo: {str(e)}")

# ========== ADMIN MASTER PANEL ROUTES ==========

@api_router.patch("/inspections/{inspection_id}/admin-update")
async def admin_update_inspection(
    inspection_id: str, body: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(require_admin)
):
    # Permite modificar cualquier campo de la inspección
    if "_id" in body: del body["_id"]
    res = await db.inspections.update_one({"id": inspection_id}, {"$set": body})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")
    return {"ok": True, "updated_fields": list(body.keys())}

@api_router.patch("/vehicle-records/{rec_id}/admin-update")
async def admin_update_vehicle_record(
    rec_id: str, body: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(require_admin)
):
    if "_id" in body: del body["_id"]
    res = await db.vehicle_records.update_one({"id": rec_id}, {"$set": body})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return {"ok": True}

@api_router.patch("/shipping-tickets/{ticket_id}/admin-update")
async def admin_update_shipping_ticket(
    ticket_id: str, body: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(require_admin)
):
    if "_id" in body: del body["_id"]
    res = await db.shipping_tickets.update_one({"id": ticket_id}, {"$set": body})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return {"ok": True}

# --- DELETE ROUTES FOR ADMIN ---

@api_router.delete("/inspections/{inspection_id}/admin-delete")
async def admin_delete_inspection(inspection_id: str, current_user: Dict[str, Any] = Depends(require_admin)):
    res = await db.inspections.delete_one({"id": inspection_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")
    return {"ok": True}

@api_router.delete("/vehicle-records/{rec_id}/admin-delete")
async def admin_delete_vehicle_record(rec_id: str, current_user: Dict[str, Any] = Depends(require_admin)):
    res = await db.vehicle_records.delete_one({"id": rec_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return {"ok": True}

@api_router.delete("/shipping-tickets/{ticket_id}/admin-delete")
async def admin_delete_shipping_ticket(ticket_id: str, current_user: Dict[str, Any] = Depends(require_admin)):
    res = await db.shipping_tickets.delete_one({"id": ticket_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return {"ok": True}

@api_router.post("/vehicle-records/{rec_id}/resend-report")
async def resend_consolidated_report(rec_id: str, current_user: Dict[str, Any] = Depends(require_admin)):
    """Dispara manualmente el envío del reporte consolidado"""
    try:
        await _trigger_automatic_report(rec_id)
        return {"ok": True, "message": "Reporte enviado a cola de correo"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/reports/consolidated-export")
async def export_consolidated_csv(current_user: Dict[str, Any] = Depends(require_admin)):
    """Exporta un CSV uniendo Caseta, Inspección y Embarque"""
    records = await db.vehicle_records.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)

    buf = io.StringIO()
    writer = csv.writer(buf)

    # Headers
    writer.writerow([
        "ID Registro", "Status", "Fecha Entrada", "Fecha Salida", "Placas", "Chofer", "Compañia",
        "Inspeccion ID", "Inspeccion Tipo", "Inspeccion Status", "Fallas",
        "Ticket Embarque", "Cliente", "Pallets", "Sellos"
    ])

    for r in records:
        # Buscar inspección vinculada
        placas = r["entry"].get("placas_unidad", "")
        insp = None
        if r.get("inspection_id"):
            insp = await db.inspections.find_one({"id": r["inspection_id"]})
        if not insp:
            insp = await db.inspections.find_one({"placas_unidad": placas}, sort=[("created_at", -1)])

        # Buscar ticket
        ticket = await db.shipping_tickets.find_one({
            "placas_unidad": placas,
            "created_at": {"$gte": r["created_at"]}
        })

        fallas = sum(1 for p in insp.get("points", [])) if insp and "points" in insp else 0

        writer.writerow([
            r["id"], r.get("status"), r["entry"].get("fecha_entrada"), r.get("exit", {}).get("fecha_salida", "N/A"),
            placas, r["entry"].get("chofer_nombre"), r["entry"].get("compania_transporte"),
            insp.get("id", "N/A") if insp else "N/A",
            insp.get("inspection_type", "N/A") if insp else "N/A",
            insp.get("status_general", "N/A") if insp else "N/A",
            fallas,
            ticket.get("id", "N/A") if ticket else "N/A",
            ticket.get("cliente", "N/A") if ticket else "N/A",
            ticket.get("numero_pallets", "N/A") if ticket else "N/A",
            ticket.get("sellos", "N/A") if ticket else "N/A",
        ])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="reporte_consolidado_maestro.csv"'},
    )


@api_router.post("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    res = await db.notifications.update_one(
        {"id": notif_id, "user_id": current_user["id"]},
        {"$set": {"read": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    return {"ok": True}


@api_router.post("/notifications/read-all")
async def mark_all_read(current_user: Dict[str, Any] = Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": current_user["id"], "read": False},
        {"$set": {"read": True}},
    )
    return {"ok": True}


# ========== Vehicle Records (Caseta) ==========
@api_router.post("/vehicle-records", response_model=VehicleRecord)
async def create_vehicle_record(body: VehicleEntry, current_user: Dict[str, Any] = Depends(get_current_user)):
    # EVITAR DUPLICADOS: Si ya hay una unidad con las mismas placas en patio (entrada o inspeccionado), no crear una nueva.
    existing = await db.vehicle_records.find_one({
        "entry.placas_unidad": body.placas_unidad.strip().upper(),
        "status": {"$in": ["entrada", "inspeccionado"]}
    })

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"La unidad con placas {body.placas_unidad} ya se encuentra registrada en el patio."
        )

    rec_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    entry_data = body.dict()
    entry_data["fecha_entrada"] = entry_data.get("fecha_entrada") or now

    # Clean images on entry
    image_fields = ["foto_frente_unidad", "foto_atras_caja", "foto_atras_caja_2", "foto_id_chofer", "firma_operador"]
    for field in image_fields:
        if entry_data.get(field):
            entry_data[field] = ensure_clean_image(entry_data[field])

    doc = {
        "id": rec_id,
        "user_id": current_user["id"],
        "status": "entrada",
        "entry": entry_data,
        "exit": None,
        "inspection_id": None,
        "created_at": now,
    }
    await db.vehicle_records.insert_one(doc)

    await _log_activity(
        "caseta", rec_id,
        f"Entrada Vehículo: {body.placas_unidad}",
        f"Conductor: {body.chofer_nombre}",
        current_user["name"],
        "entrada"
    )

    # Notificar proceso
    await _notify_supervisors(
        title="Nueva Entrada",
        message=f"Unidad {body.placas_unidad} ha ingresado a planta (Caseta)."
    )

    # Sync to Google Sheets
    try:
        await sync_to_google_sheets("entrada", doc)
    except: pass

    return VehicleRecord(**{k: v for k, v in doc.items() if k != "_id"})


async def _ensure_record_links(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Busca y vincula inspecciones y tickets de embarque si no están vinculados directamente.
    Optimizada para evitar consultas innecesarias.
    """
    rec_id = record["id"]
    placas = record["entry"].get("placas_unidad", "").strip()
    if not placas:
        return record

    # Si ya tiene todo vinculado, no hacemos nada para no alentar la respuesta
    if record.get("inspection_id") and record.get("shipping_ticket_id"):
        return record

    updated = False
    now = datetime.now(timezone.utc)

    # 1. Vincular Inspección (si falta)
    if not record.get("inspection_id"):
        try:
            # Buscamos inspecciones creadas en las últimas 48 horas relacionadas a estas placas
            start_search = now - timedelta(hours=48)
            insp = await db.inspections.find_one({
                "placas_unidad": placas,
                "created_at": {"$gte": start_search.isoformat()}
            }, sort=[("created_at", -1)])

            if insp:
                record["inspection_id"] = insp["id"]
                if record["status"] == "entrada":
                    record["status"] = "inspeccionado"
                updated = True
        except: pass

    # 2. Vincular Ticket de Embarque (si falta)
    if not record.get("shipping_ticket_id"):
        try:
            start_search = now - timedelta(hours=48)
            ticket = await db.shipping_tickets.find_one({
                "placas_unidad": placas,
                "created_at": {"$gte": start_search.isoformat()}
            }, sort=[("created_at", -1)])

            if ticket:
                record["shipping_ticket_id"] = ticket["id"]
                record["has_shipping_ticket"] = True
                updated = True
        except: pass

    if updated:
        await db.vehicle_records.update_one(
            {"id": rec_id},
            {"$set": {
                "inspection_id": record.get("inspection_id"),
                "shipping_ticket_id": record.get("shipping_ticket_id"),
                "has_shipping_ticket": record.get("has_shipping_ticket", True if record.get("shipping_ticket_id") else False),
                "status": record["status"]
            }}
        )

    return record


@api_router.get("/vehicle-records", response_model=List[VehicleRecord])
async def list_vehicle_records(
    current_user: Dict[str, Any] = Depends(get_current_user),
    status: Optional[str] = None,
):
    filt: Dict[str, Any] = {}
    if current_user.get("role") not in ["supervisor", "admin"] and not is_admin(current_user):
        filt["$or"] = [
            {"user_id": current_user["id"]},
            {"status": {"$in": ["entrada", "inspeccionado"]}}
        ]

    if status:
        filt["status"] = status

    docs = await db.vehicle_records.find(filt, {"_id": 0}).sort("created_at", -1).to_list(50)

    if not docs:
        return []

    res = []
    allowed_keys = VehicleRecord.__fields__.keys()

    for d in docs:
        try:
            # OPTIMIZACIÓN: Solo vincular si es estrictamente necesario y la unidad está activa
            # Esto evita cientos de consultas innecesarias a la BD
            if d.get("status") != "salida" and (not d.get("inspection_id") or not d.get("shipping_ticket_id")):
                d = await _ensure_record_links(d)

            clean_doc = {k: v for k, v in d.items() if k in allowed_keys}
            res.append(VehicleRecord(**clean_doc))
        except Exception as e:
            logger.error(f"Error serializing record {d.get('id', 'unknown')}: {e}")
            try:
                clean_doc = {k: v for k, v in d.items() if k in allowed_keys}
                res.append(VehicleRecord(**clean_doc))
            except: continue

    return res


@api_router.get("/vehicle-records/{rec_id}", response_model=VehicleRecord)
async def get_vehicle_record(rec_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    filt: Dict[str, Any] = {"id": rec_id}
    # Permitir que supervisores y admins vean cualquier registro
    if current_user.get("role") not in ["supervisor", "admin"] and not is_admin(current_user):
        filt["user_id"] = current_user["id"]
    doc = await db.vehicle_records.find_one(filt, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    # Asegurar vínculos antes de devolver
    doc = await _ensure_record_links(doc)

    # Limpieza de imágenes en tiempo real para reportes
    if "entry" in doc:
        for f in ["foto_frente_unidad", "foto_atras_caja", "foto_id_chofer", "firma_operador"]:
            if doc["entry"].get(f):
                doc["entry"][f] = ensure_clean_image(doc["entry"][f])
    if doc.get("exit"):
        for f in ["sello_vvtt_foto", "firma_guardia"]:
            if doc["exit"].get(f):
                doc["exit"][f] = ensure_clean_image(doc["exit"][f])

    return VehicleRecord(**doc)


@api_router.put("/vehicle-records/{rec_id}", response_model=VehicleRecord)
async def update_vehicle_record(
    rec_id: str, body: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(require_admin),
):
    doc = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    # Update only allowed fields
    update_data = {}
    if "entry" in body: update_data["entry"] = body["entry"]
    if "exit" in body: update_data["exit"] = body["exit"]
    if "status" in body: update_data["status"] = body["status"]
    if "inspection_id" in body: update_data["inspection_id"] = body["inspection_id"]

    await db.vehicle_records.update_one({"id": rec_id}, {"$set": update_data})
    updated_doc = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})

    # Sync to Google Sheets
    try:
        await sync_to_google_sheets("salida", updated_doc)
    except: pass

    return VehicleRecord(**updated_doc)


@api_router.patch("/vehicle-records/{rec_id}/exit", response_model=VehicleRecord)
async def add_exit_to_record(rec_id: str, body: VehicleExit, current_user: Dict[str, Any] = Depends(get_current_user)):
    doc = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    exit_data = body.dict()
    exit_data["fecha_salida"] = exit_data.get("fecha_salida") or datetime.now(timezone.utc).isoformat()

    # Clean exit images
    image_fields = ["sello_vvtt_foto", "sello_vvtt_foto_2", "firma_guardia"]
    for field in image_fields:
        if exit_data.get(field):
            exit_data[field] = ensure_clean_image(exit_data[field])

    await db.vehicle_records.update_one(
        {"id": rec_id},
        {"$set": {"exit": exit_data, "status": "salida"}},
    )
    doc["exit"] = exit_data
    doc["status"] = "salida"

    await _log_activity(
        "caseta", rec_id,
        f"Salida Vehículo: {doc['entry']['placas_unidad']}",
        f"Destino: {exit_data.get('destino')}",
        current_user["name"],
        "salida"
    )

    # Notificar salida
    await _notify_supervisors(
        title="Salida de Unidad",
        message=f"La unidad {doc['entry']['placas_unidad']} ha salido de planta."
    )

    # Ejecutar en segundo plano para no demorar la respuesta a la App
    async def bg_report():
        try:
            await _trigger_automatic_report(rec_id)
            await sync_to_google_sheets("salida", doc)
        except Exception as e:
            logger.error(f"Error en reporte/sync background: {e}")

    asyncio.create_task(bg_report())

    return VehicleRecord(**doc)


def compress_image_base64(base64_str: str, max_size=(600, 600)) -> str:
    """Comprime y redimensiona una imagen en base64 para que el correo no sea pesado."""
    try:
        if not base64_str or "data:image" not in base64_str:
            return base64_str

        # Extraer el contenido base64
        header, encoded = base64_str.split(",", 1)
        image_data = base64.b64decode(encoded)
        image = Image.open(io.BytesIO(image_data))

        # Convertir a RGB si es necesario (para evitar problemas con PNG transparentes en JPEG)
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")

        # Redimensionar manteniendo proporción
        image.thumbnail(max_size, Image.Resampling.LANCZOS)

        # Guardar comprimido
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=60, optimize=True)

        # Convertir de nuevo a base64
        compressed_base64 = base64.b64encode(buffer.getvalue()).decode()
        return f"data:image/jpeg;base64,{compressed_base64}"
    except Exception as e:
        logger.error(f"Error comprimiendo imagen: {e}")
        return base64_str

async def _trigger_automatic_report(rec_id: str, recipient_override: Optional[str] = None):
    logger.info(f"Generando reporte consolidado para ID: {rec_id}")
    record = await db.vehicle_records.find_one({"id": rec_id})
    if not record:
        logger.error(f"Reporte cancelado: No existe el registro {rec_id}")
        return False

    # ASEGURAR VÍNCULOS (REPARACIÓN DE TRAZABILIDAD)
    # Esto busca inspecciones y tickets por placas si no están vinculados explícitamente
    record = await _ensure_record_links(record)

    # Cargar los objetos vinculados
    inspection = None
    if record.get("inspection_id"):
        inspection = await db.inspections.find_one({"id": record["inspection_id"]})

    ticket = None
    if record.get("shipping_ticket_id"):
        ticket = await db.shipping_tickets.find_one({"id": record["shipping_ticket_id"]})

    e = record.get("entry") or {}
    placas = e.get("placas_unidad", "").strip()
    logger.info(f"Reporte Consolidado - Placas: {placas} - Inspección: {'SI' if inspection else 'NO'}, Ticket: {'SI' if ticket else 'NO'}")

    # PRE-PROCESAR FIRMAS PARA EVITAR CUADROS NEGROS Y ASEGURAR VISIBILIDAD DE FIRMAS ANTIGUAS
    f_operador = ensure_clean_image(e.get("firma_operador", ""))
    f_guardia_salida = ""
    x = record.get("exit") or {}
    if x:
        f_guardia_salida = ensure_clean_image(x.get("firma_guardia", ""))

    f_inspector = ""
    f_supervisor = ""
    if inspection:
        f_inspector = ensure_clean_image(inspection.get("inspector_firma", ""))
        f_supervisor = ensure_clean_image(inspection.get("approved_by_signature", ""))

    f_almacenista = ""
    f_guardia_embarque = ""
    if ticket:
        f_almacenista = ensure_clean_image(ticket.get("firma_almacenista", ""))
        f_guardia_embarque = ensure_clean_image(ticket.get("firma_guardia", ""))

    subject = f"REPORTE CONSOLIDADO SRIUC - UNIDAD: {placas}"
    recipient = recipient_override or os.environ.get("REPORT_RECIPIENT", "d.trujillo@brancoindustries.com")

    # Si el estado general de la inspección es malo, marcarlo fuerte en el correo
    color_header = "#0A2540"
    if inspection and inspection.get("status_general") == "malo":
        color_header = "#dc2626" # Rojo si hay falla

    # Helper para generar HTML de fotos con redimensionamiento agresivo
    def get_photo_html(b64, label):
        if not b64 or not isinstance(b64, str) or "data:image" not in b64:
            return ""
        # add_watermark ya redimensiona a 600px y baja calidad al 50%
        watermarked_b64 = add_watermark(b64)
        return f'''
        <div style="display: inline-block; width: 45%; margin: 1%; vertical-align: top; border: 1px solid #eee; padding: 5px; background: #f9fafb; text-align: center;">
            <p style="margin: 0 0 5px 0; font-size: 9px; font-weight: bold; color: #666; text-transform: uppercase;">{label}</p>
            <img src="{watermarked_b64}" style="width: 100%; border: 1px solid #ddd;" />
        </div>
        '''

    # Fotos de Caseta
    caseta_photos = []
    e = record.get("entry") or {}
    if e.get("foto_frente_unidad"):
        caseta_photos.append(get_photo_html(e["foto_frente_unidad"], "FRONTAL"))
    if e.get("foto_atras_caja"):
        caseta_photos.append(get_photo_html(e["foto_atras_caja"], "TRASERA"))
    caseta_photos_html = "".join(caseta_photos)

    # Fotos de Inspección: SOLO INCLUIR LAS QUE TIENEN FALLA PARA EVITAR PESO EXCESIVO
    inspection_rows = ""
    inspection_photos = []
    if inspection and inspection.get("points"):
        for p in inspection["points"]:
            status_text = "BUENO" if p["estado"] == "bueno" else "FALLA"
            status_color = "#16a34a" if p["estado"] == "bueno" else "#dc2626"
            inspection_rows += f'''
            <tr>
                <td style="padding: 5px; border: 1px solid #ddd; width: 30px;">{p['number']}</td>
                <td style="padding: 5px; border: 1px solid #ddd;">{p['name']}</td>
                <td style="padding: 5px; border: 1px solid #ddd; font-weight: bold; color: {status_color};">{status_text}</td>
                <td style="padding: 5px; border: 1px solid #ddd;">{p.get('comentarios', '-')}</td>
            </tr>
            '''
            # Solo adjuntamos foto si es MALA (falla) para ahorrar espacio
            if p.get("photo") and p.get("estado") == "malo":
                inspection_photos.append(get_photo_html(p["photo"], f"FALLA EN PUNTO {p['number']}"))
    inspection_photos_html = "".join(inspection_photos)

    # Fotos de Embarque: Solo la final para ahorrar espacio
    ticket_photos_html = ""
    if ticket and ticket.get("foto_final_carga"):
        ticket_photos_html = get_photo_html(ticket["foto_final_carga"], "CARGA FINALIZADA")

    # Reglamento y Declaraciones Bilingüe
    reglas_data = [
        ('1. No romper el sello hasta que la cortina asignada esté abierta y el almacenista responsable esté presente.', '1. 在指定的卸货门打开且负责的仓库人员到场之前，请勿破坏封条。'),
        ('2. No pasar materiales/equipos ajenos a NAF por la cortina.', '2. 请勿通过卸货门运送不属于 NAF 的材料/设备。'),
        ('3. Prohibido brincar rampas y entrar al almacén sin autorización.', '3. 禁止未经授权跳过坡道或进入仓库。'),
        ('4. Prohibidos drogas, armas, agentes biológicos, aerosoles, cámaras de video/foto, pornografía y bebidas alcohólicas.', '4. 禁止携带毒品、武器、生物制剂、气雾剂、摄相机、色情制品和酒精饮料。'),
        ('5. Prohibido dar propinas, premios o incentivos al personal de seguridad/almacén NAF.', '5. 禁止向 NAF 安保或仓库人员提供小费、奖品或奖励。'),
        ('6. No menores de edad ni personal ajeno a NAF en el patio de maniobras.', '6. 禁止未成年人或非 NAF 人员进入操作场区。'),
        ('7. Prohibido tirar basura en el patio de maniobras.', '7. 禁止在操作场区乱扔垃圾。'),
        ('8. Velocidad máxima 10 km/h.', '8. 最高时速 10 公里/小时。')
    ]
    declaraciones_data = [
        ('1. Declaro NO transportar drogas, agentes biológicos, bioterrorismo, municiones, armas, contrabando ni personas indocumentadas.', '1. 我声明不运输毒品、生物制剂、生物恐怖主义物品、弹药、武器、走私品或无证人员。'),
        ('2. Declaro estar en condición física adecuada y buen estado de salud.', '2. 我声明身体状况良好，健康状态佳。'),
        ('3. Declaro NO haber consumido alcohol o drogas recientemente y NO estar bajo su influencia.', '3. 我声明最近没有饮酒或吸毒，且不受其影响。'),
        ('4. Declaro que al estar en instalaciones NAF he leído, entendido y aceptado plenamente estas instrucciones.', '4. 我声明在 NAF 设施内已阅读、理解并完全接受这些指令。')
    ]

    reglas_html = "".join([f"<div style='margin-bottom:4px;'>{es}<br/><span style='color:#666; font-size:8px;'>{zh}</span></div>" for es, zh in reglas_data])
    declaraciones_html = "".join([f"<div style='margin-bottom:4px;'>{es}<br/><span style='color:#666; font-size:8px;'>{zh}</span></div>" for es, zh in declaraciones_data])

    html = f"""
    <html>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a1a; line-height: 1.4; max-width: 800px; margin: auto; border: 1px solid #eee; padding: 20px; font-size: 11px;">
            <div style="background-color: {color_header}; padding: 20px; text-align: center; color: white;">
                <h1 style="margin: 0;">Reporte Consolidado de Unidad / 综合报告</h1>
                <p style="margin: 5px 0 0 0; opacity: 0.8;">Sistema de Registro e Inspección (SRIUC) / 注册、检查和运输系统</p>
                {f'<p style="background: white; color: {color_header}; display: inline-block; padding: 2px 10px; font-weight: bold; margin-top: 10px;">¡ALERTA: FALLA DETECTADA! / 警报：检测到故障！</p>' if inspection and inspection.get("status_general") == "malo" else ''}
            </div>

            <div style="padding: 20px;">
                <h2 style="border-bottom: 2px solid #0A2540; color: #0A2540; padding-bottom: 5px;">1. Movimiento de Caseta / 门卫室记录</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px; font-weight: bold; width: 40%;">Placas Unidad / 车牌号:</td><td style="padding: 8px;">{e.get('placas_unidad', 'N/A')}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Conductor / 司机姓名:</td><td style="padding: 8px;">{e.get('chofer_nombre', 'N/A')}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Compañía / 运输公司:</td><td style="padding: 8px;">{e.get('compania_transporte', 'N/A')}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Fecha Entrada / 进场时间:</td><td style="padding: 8px;">{e.get('fecha_entrada', 'N/A')}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; color: #16A34A;">Fecha Salida / 出场时间:</td><td style="padding: 8px; color: #16A34A; font-weight: bold;">{x.get('fecha_salida', 'N/A') if x else 'No registrada (En Patio) / 未登记（在场）'}</td></tr>
                </table>

                <div style="background: #f1f5f9; padding: 10px; border: 1px solid #ddd; margin-top: 10px; font-size: 9px;">
                    <p style="margin: 0 0 5px 0; font-weight: bold; color: #0A2540;">REGLAMENTO Y SEGURIDAD / 安全条例:</p>
                    {reglas_html}
                    <p style="margin: 10px 0 5px 0; font-weight: bold; color: #0A2540;">DECLARACIONES / 司机声明:</p>
                    {declaraciones_html}
                    <p style="margin-top: 5px; font-weight: bold; color: #16a34a;">ACEPTADO / 已接受 ✓</p>
                </div>

                <div style="margin-top: 15px; display: flex; gap: 20px;">
                    {f'<div style="flex: 1;"><p style="font-size:8px; margin:0; color:#666;">FIRMA CONDUCTOR (ENTRADA) / 司机签字:</p><img src="{f_operador}" style="height:60px; border-bottom:1px solid #0A2540;" /></div>' if f_operador else ''}
                    {f'<div style="flex: 1;"><p style="font-size:8px; margin:0; color:#666;">FIRMA GUARDIA (SALIDA) / 警卫签字:</p><img src="{f_guardia_salida}" style="height:60px; border-bottom:1px solid #0A2540;" /></div>' if f_guardia_salida else ''}
                </div>
                <div style="margin-top: 10px;">{caseta_photos_html}</div>

                <h2 style="border-bottom: 2px solid #0A2540; color: #0A2540; padding-bottom: 5px; margin-top: 30px;">2. Inspección C-TPAT / C-TPAT 检查 ({inspection.get('inspection_type', 'N/A').replace('_', ' ').upper()})</h2>
                {f'''
                <div style="background-color: {"#f0fdf4" if inspection.get("status_general") == "bueno" else "#fef2f2"}; padding: 15px; border-radius: 5px; border-left: 5px solid {"#16a34a" if inspection.get("status_general") == "bueno" else "#dc2626"}; margin-bottom: 10px;">
                    <p style="margin: 0;">Estado General / 总体状态: <b style="color: {"#16a34a" if inspection.get("status_general") == "bueno" else "#dc2626"};">{inspection.get('status_general', 'N/A').upper()} / {"良好" if inspection.get("status_general") == "bueno" else "故障"}</b></p>
                    <p style="margin: 5px 0 0 0;">Estado Aprobación / 批准状态: <b>{inspection.get('approval_status', 'pendiente').upper()} / {"已批准" if inspection.get('approval_status') == "aprobada" else "已拒绝" if inspection.get('approval_status') == "rechazada" else "待定"}</b></p>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                        <tr>
                            <td style="width: 50%; vertical-align: top;">
                                <p style="margin: 0; font-weight: bold;">Inspector / 检查员:</p>
                                <p style="margin: 2px 0;">{inspection.get('inspector_nombre', 'N/A')}</p>
                                {f'<img src="{f_inspector}" style="height:45px; border-bottom:1px solid #0A2540;" />' if f_inspector else ''}
                            </td>
                            <td style="width: 50%; vertical-align: top;">
                                <p style="margin: 0; font-weight: bold;">Supervisor / 主管:</p>
                                <p style="margin: 2px 0;">{inspection.get('approved_by_name', 'N/A')}</p>
                                {f'<img src="{f_supervisor}" style="height:45px; border-bottom:1px solid #0A2540;" />' if f_supervisor else ''}
                            </td>
                        </tr>
                    </table>
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                    <tr style="background: #f1f5f9; font-weight: bold;">
                        <td style="padding: 5px; border: 1px solid #ddd; width: 30px;">#</td>
                        <td style="padding: 5px; border: 1px solid #ddd;">Punto / 检查点</td>
                        <td style="padding: 5px; border: 1px solid #ddd; width: 100px;">Estado / 状态</td>
                        <td style="padding: 5px; border: 1px solid #ddd;">Comentarios / 备注</td>
                    </tr>
                    {inspection_rows}
                </table>
                <div style="margin-top: 10px; border-top: 1px solid #eee; padding-top: 10px;">
                    <p style="font-size: 10px; color: #666;">(Solo se incluyen fotos de puntos con falla detectada / 仅包含检测到故障点的照片)</p>
                    {inspection_photos_html}
                </div>
                ''' if inspection else "<p style='color: #666; font-style: italic;'>No se realizó inspección digital para esta unidad / 该单位未进行数字检查。</p>"}

                <h2 style="border-bottom: 2px solid #0A2540; color: #0A2540; padding-bottom: 5px; margin-top: 30px;">3. Ticket de Embarque / 运输单</h2>
                {f'''
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px; font-weight: bold; width: 40%;">Cliente / 客户:</td><td style="padding: 8px;">{ticket.get('cliente', 'N/A')}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Pallets / 托盘数量:</td><td style="padding: 8px;">{ticket.get('numero_pallets', 'N/A')}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Sellos / 封条:</td><td style="padding: 8px;">{ticket.get('sellos', 'N/A')}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Almacenista / 仓管员:</td><td style="padding: 8px;">{ticket.get('almacenista', 'N/A')}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Guardia / 警卫:</td><td style="padding: 8px;">{ticket.get('nombre_guardia', 'N/A')}</td></tr>
                </table>
                <div style="margin-top: 15px; display: flex; gap: 20px;">
                    {f'<div><p style="font-size:8px; margin:0; color:#666;">FIRMA ALMACENISTA / 仓管员签字:</p><img src="{f_almacenista}" style="height:60px; border-bottom:1px solid #0A2540;" /></div>' if f_almacenista else ''}
                    {f'<div><p style="font-size:8px; margin:0; color:#666;">FIRMA GUARDIA / 警卫签字:</p><img src="{f_guardia_embarque}" style="height:60px; border-bottom:1px solid #0A2540;" /></div>' if f_guardia_embarque else ''}
                </div>
                <div style="margin-top: 10px;">{ticket_photos_html}</div>
                ''' if ticket else "<p style='color: #666; font-style: italic;'>No se generó ticket de embarque para este movimiento / 本次操作未生成运输单。</p>"}
            </div>

            <div style="margin-top: 40px; padding: 20px; background-color: #f9fafb; text-align: center; font-size: 12px; color: #666;">
                <p>Este es un reporte automático generado por el Sistema SRIUC / 这是由 SRIUC 系统生成的自动报告。</p>
                <p>&copy; {datetime.now().year} Branco Industries - Todos los derechos reservados / 版权所有。</p>
            </div>
        </body>
    </html>
    """

    try:
        # Sincronizar también con Google Drive (PDF)
        # Usamos el tipo "inspeccion" o "entrada" como base para la carpeta
        await sync_to_google_sheets("entrada", record, report_html=html)

        success = await send_automatic_report(subject, recipient, html)
        return success
    except Exception as e:
        logger.error(f"Fallo al enviar reporte automático o sincronizar Drive: {e}")
        return False


@api_router.patch("/vehicle-records/{rec_id}/link-inspection")
async def link_inspection(rec_id: str, inspection_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    doc = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    # Update status logic
    new_status = "inspeccionado" if doc.get("status") == "entrada" else doc.get("status")

    # Maintain both legacy field and new list field
    await db.vehicle_records.update_one(
        {"id": rec_id},
        {
            "$set": {"inspection_id": inspection_id, "status": new_status},
            "$addToSet": {"inspection_ids": inspection_id}
        },
    )
    return {"ok": True}


@api_router.patch("/vehicle-records/{rec_id}/link-ticket")
async def link_shipping_ticket(rec_id: str, ticket_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    doc = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    await db.vehicle_records.update_one(
        {"id": rec_id},
        {"$set": {"shipping_ticket_id": ticket_id, "has_shipping_ticket": True}},
    )
    return {"ok": True}


# ========== Shipping Tickets (Ticket de Embarque) ==========
class ShippingTicket(BaseModel):
    id: str
    user_id: str
    almacenista: str
    fecha: str
    area: str = ""
    sellos: str = ""
    cliente: str = ""
    operador: str = ""
    linea_transporte: str = ""
    numero_economico: str = ""
    placas_unidad: str = ""
    numero_caja: str = ""
    placas_caja: str = ""
    hora_llegada: str = ""
    hora_apertura_cortina: str = ""
    hora_cierre_cortina: str = ""
    hora_salida: str = ""
    numero_pallets: str = ""
    numero_sello: str = ""
    observaciones: str = ""
    daño_caja: str = ""  # description of damage
    plano_carga: str = ""  # base64 image of loading diagram
    foto_inicio_carga: str = ""
    foto_media_carga: str = ""
    foto_final_carga: str = ""
    firma_almacenista: str = ""
    firma_guardia: str = ""
    nombre_guardia: str = ""
    record_id: Optional[str] = None
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
    placas_unidad: str = ""
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


@api_router.post("/shipping-tickets", response_model=ShippingTicket)
async def create_ticket(body: ShippingTicketCreate, current_user: Dict[str, Any] = Depends(get_current_user)):
    tid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = body.dict()
    doc["id"] = tid
    doc["user_id"] = current_user["id"]
    doc["fecha"] = doc.get("fecha") or now
    doc["created_at"] = now

    # Clean ticket images
    image_fields = ["plano_carga", "foto_inicio_carga", "foto_media_carga", "foto_final_carga", "firma_almacenista", "firma_guardia"]
    for field in image_fields:
        if doc.get(field):
            doc[field] = ensure_clean_image(doc[field])

    await db.shipping_tickets.insert_one(doc)

    # Autolink to vehicle record if record_id provided
    if body.record_id:
        try:
            await db.vehicle_records.update_one(
                {"id": body.record_id},
                {"$set": {"shipping_ticket_id": tid, "has_shipping_ticket": True}}
            )
            logger.info(f"Auto-linked shipping ticket {tid} to record {body.record_id}")
        except Exception as e:
            logger.error(f"Error auto-linking shipping ticket: {e}")

    await _log_activity(
        "embarque", tid,
        f"Ticket Embarque: {body.placas_unidad}",
        f"Cliente: {body.cliente}",
        current_user["name"],
        "embarque"
    )

    # Notificar embarque
    await _notify_supervisors(
        title="Ticket de Embarque Generado",
        message=f"Se ha generado un ticket de embarque para la unidad {body.placas_unidad} (Cliente: {body.cliente})."
    )

    # Sync to Google Sheets
    try:
        await sync_to_google_sheets("embarque", doc)
    except: pass

    return ShippingTicket(**{k: v for k, v in doc.items() if k != "_id"})


@api_router.get("/shipping-tickets", response_model=List[ShippingTicket])
async def list_tickets(current_user: Dict[str, Any] = Depends(get_current_user)):
    filt: Dict[str, Any] = {}
    if current_user.get("role") != "supervisor":
        filt["user_id"] = current_user["id"]

    # projection removida para asegurar que detalles (firmas/fotos) se vean en la app
    docs = await db.shipping_tickets.find(filt, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [ShippingTicket(**d) for d in docs]


@api_router.get("/shipping-tickets/{ticket_id}", response_model=ShippingTicket)
async def get_ticket(ticket_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    filt: Dict[str, Any] = {"id": ticket_id}
    # Permitir que supervisores y admins vean cualquier ticket
    if current_user.get("role") not in ["supervisor", "admin"] and not is_admin(current_user):
        filt["user_id"] = current_user["id"]
    doc = await db.shipping_tickets.find_one(filt, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    # Limpieza de imágenes para reportes
    for f in ["foto_inicio_carga", "foto_media_carga", "foto_final_carga", "firma_almacenista", "firma_guardia"]:
        if doc.get(f):
            doc[f] = ensure_clean_image(doc[f])

    return ShippingTicket(**doc)


@api_router.put("/shipping-tickets/{ticket_id}", response_model=ShippingTicket)
async def update_shipping_ticket(
    ticket_id: str, body: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(require_admin),
):
    doc = await db.shipping_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    # Update doc with provided body fields (excluding id and user_id)
    update_data = {k: v for k, v in body.items() if k not in ["id", "user_id", "created_at"]}

    await db.shipping_tickets.update_one({"id": ticket_id}, {"$set": update_data})
    updated_doc = await db.shipping_tickets.find_one({"id": ticket_id}, {"_id": 0})

    # Sync update to Google Sheets
    try:
        await sync_to_google_sheets("embarque", updated_doc)
    except: pass

    return ShippingTicket(**updated_doc)


# ========== Analytics (admin only) ==========
@api_router.get("/analytics")
async def analytics(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    filt: Dict[str, Any] = {}
    if date_from or date_to:
        date_filt: Dict[str, Any] = {}
        if date_from:
            date_filt["$gte"] = date_from
        if date_to:
            date_filt["$lte"] = date_to + "T23:59:59.999999"
        filt["created_at"] = date_filt

    docs = await db.inspections.find(filt, {"_id": 0, "client_uuid": 0}).to_list(5000)

    total = len(docs)
    approval = {"pendiente": 0, "aprobada": 0, "rechazada": 0}
    status_general = {"bueno": 0, "malo": 0}
    by_inspector: Dict[str, Dict[str, Any]] = {}
    point_failures: Dict[str, Dict[str, Any]] = {}

    for d in docs:
        approval[d.get("approval_status", "pendiente")] = approval.get(d.get("approval_status", "pendiente"), 0) + 1
        status_general[d.get("status_general", "bueno")] = status_general.get(d.get("status_general", "bueno"), 0) + 1

        insp_name = d.get("inspector_nombre", "Desconocido")
        if insp_name not in by_inspector:
            by_inspector[insp_name] = {"name": insp_name, "total": 0, "fallas": 0, "aprobadas": 0, "rechazadas": 0}
        by_inspector[insp_name]["total"] += 1
        if d.get("status_general") == "malo":
            by_inspector[insp_name]["fallas"] += 1
        if d.get("approval_status") == "aprobada":
            by_inspector[insp_name]["aprobadas"] += 1
        elif d.get("approval_status") == "rechazada":
            by_inspector[insp_name]["rechazadas"] += 1

        for p in d.get("points", []):
            if p.get("estado") == "malo":
                key = f"{p.get('number')}. {p.get('name')}"
                if key not in point_failures:
                    point_failures[key] = {"name": key, "count": 0}
                point_failures[key]["count"] += 1

    by_inspector_list = sorted(by_inspector.values(), key=lambda x: x["total"], reverse=True)
    point_failures_list = sorted(point_failures.values(), key=lambda x: x["count"], reverse=True)[:10]

    approval_rate = 0
    decided = approval["aprobada"] + approval["rechazada"]
    if decided > 0:
        approval_rate = round((approval["aprobada"] / decided) * 100, 1)

    return {
        "total": total,
        "approval_breakdown": approval,
        "status_breakdown": status_general,
        "approval_rate_pct": approval_rate,
        "by_inspector": by_inspector_list,
        "top_failed_points": point_failures_list,
    }


@api_router.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}

app.include_router(api_router)

# Compresión GZip para transferencia ultra rápida de datos
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],  # Esto permite que Cloudflare o cualquier origen se conecte
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def ensure_indexes():
    """Asegura que la base de datos tenga índices para búsquedas instantáneas"""
    try:
        # Índices para Inspecciones
        await db.inspections.create_index([("created_at", -1)])
        await db.inspections.create_index([("id", 1)], unique=True)
        await db.inspections.create_index([("user_id", 1)])
        await db.inspections.create_index([("placas_unidad", 1)])

        # Índices para Caseta
        await db.vehicle_records.create_index([("created_at", -1)])
        await db.vehicle_records.create_index([("id", 1)], unique=True)
        await db.vehicle_records.create_index([("status", 1)])

        logger.info("Índices de base de datos verificados y activos.")
    except Exception as e:
        logger.error(f"Error al crear índices: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
