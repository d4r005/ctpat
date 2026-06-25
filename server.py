from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
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
from PIL import Image, ImageDraw
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'naf-inspection-secret-change-in-prod')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRE_HOURS = 24 * 30

app = FastAPI(title="NAF Inspección 19 Puntos API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()


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
    foto_id_chofer: str = ""
    firma_operador: str = ""  # base64 png
    declaraciones_aceptadas: bool = False
    fecha_entrada: Optional[str] = None

class VehicleExit(BaseModel):
    hora_apertura_cortina: str = ""
    hora_cierre_cortina: str = ""
    cortina_salida: str = ""
    sello_salida: str = ""
    condicion_salida: str = ""  # vacio | carga_cliente | consolidado
    destino: str = ""
    numero_tractor_salida: str = ""
    numero_caja_salida: str = ""
    escolta: EscoltaInfo = EscoltaInfo()
    pallets: str = ""
    cajas: str = ""
    bultos: str = ""
    sello_vvtt_estado: str = ""  # bueno | malo
    sello_vvtt_foto: str = ""   # base64
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

        # Convertir a RGB si es necesario (evita errores con PNG o formatos raros)
        if img.mode != 'RGB':
            img = img.convert('RGB')

        draw = ImageDraw.Draw(img)

        # Configurar texto
        # Usamos horario local o el de la CDMX si es posible, por ahora UTC formateado
        now = datetime.now(timezone.utc).astimezone().strftime('%d/%m/%Y %H:%M')
        text = f"PLANTA NAF | {now}"

        width, height = img.size

        # Dibujar un fondo semi-transparente para legibilidad
        # Rectángulo negro en la parte inferior
        font_height = max(24, int(height / 25))
        draw.rectangle([0, height - font_height - 20, width, height], fill=(0, 0, 0))

        # Escribir el texto (Pillow default font es pequeño, pero seguro)
        draw.text((20, height - font_height - 5), text, fill=(255, 255, 255))

        # Re-codificar a JPEG
        buffered = io.BytesIO()
        img.save(buffered, format="JPEG", quality=80)
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
    return user.get("email") in admins

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


# ========== AppSheet Sync Utility ==========
def flatten_dict(d, parent_key='', sep='_'):
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)

async def sync_to_appsheet(table_name: str, data: Dict[str, Any]):
    app_id = os.environ.get("APPSHEET_APP_ID")
    access_key = os.environ.get("APPSHEET_ACCESS_KEY")
    webhook_url = os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")

    # Special handling for points to include state and photos individually
    data_to_flatten = data.copy()
    if "points" in data_to_flatten:
        points = data_to_flatten.pop("points")
        data_to_flatten["total_puntos"] = len(points)
        data_to_flatten["fallas"] = sum(1 for p in points if p.get("estado") == "malo")
        for p in points:
            p_num = p.get("number")
            data_to_flatten[f"punto_{p_num}_estado"] = p.get("estado")
            data_to_flatten[f"punto_{p_num}_comentarios"] = p.get("comentarios", "")
            # Añadir marca de agua si hay foto
            p_photo = p.get("photo", "")
            if p_photo and "data:image" in p_photo:
                data_to_flatten[f"punto_{p_num}_foto"] = add_watermark(p_photo)
            else:
                data_to_flatten[f"punto_{p_num}_foto"] = p_photo

    flattened = flatten_dict(data_to_flatten)

    # Aplicar marca de agua a fotos conocidas en Caseta y otras tablas
    photo_fields = [
        "entry_foto_frente_unidad", "entry_foto_atras_caja", "entry_foto_id_chofer",
        "exit_sello_vvtt_foto", "plano_carga",
        "foto_inicio_carga", "foto_media_carga", "foto_final_carga"
    ]
    for field in photo_fields:
        if field in flattened and isinstance(flattened[field], str) and "data:image" in flattened[field]:
            flattened[field] = add_watermark(flattened[field])

    # Convert everything to string for AppSheet compatibility if it's not a basic type
    for k, v in flattened.items():
        if isinstance(v, (list, dict)):
            flattened[k] = str(v)

    if app_id and access_key:
        try:
            url = f"https://www.appsheet.com/api/v2/apps/{app_id}/tables/{table_name}/Action"
            payload = {
                "Action": "Add",
                "Properties": { "Locale": "es-MX", "Timezone": "Central Standard Time" },
                "Rows": [flattened]
            }
            headers = { "ApplicationAccessKey": access_key, "Content-Type": "application/json" }
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            if response.status_code == 200:
                logger.info(f"Successfully synced {table_name} to AppSheet API")
                return
            else:
                logger.error(f"AppSheet API Error ({table_name}): {response.text}")
        except Exception as e:
            logger.error(f"Error syncing to AppSheet API ({table_name}): {e}")

    # Option 2: Fallback to Google Sheets Webhook
    if webhook_url:
        try:
            payload = {
                "table": table_name,
                "data": flattened,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            response = requests.post(webhook_url, json=payload, timeout=10)
            if response.status_code == 200:
                print(f"Successfully synced {table_name} to Google Sheets Webhook")
            else:
                print(f"Failed to sync to Webhook: {response.text}")
        except Exception as e:
            print(f"Error syncing to Webhook: {e}")


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
def _serialize_inspection(doc: Dict[str, Any]) -> Inspection:
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
        "inspector_firma": body.inspector_firma,
        "verificador_nombre": body.verificador_nombre,
        "verificador_firma": body.verificador_firma,
        "fecha_hora": fecha_hora,
        "created_at": now,
        "status_general": status_general,
        "approval_status": "pendiente",
        "approval_note": "",
        "approved_by_name": "",
        "approved_at": "",
        "client_uuid": body.client_uuid,
    }
    await db.inspections.insert_one(doc)

    # Sync to AppSheet
    try:
        await sync_to_appsheet("Inspecciones", doc)
    except: pass

    return _serialize_inspection(doc)


@api_router.get("/inspections", response_model=List[Inspection])
async def list_inspections(
    current_user: Dict[str, Any] = Depends(get_current_user),
    scope: str = Query("mine", description="mine | all (all requires supervisor)"),
    inspector_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    filt: Dict[str, Any] = {}
    if scope == "all":
        if current_user.get("role") != "supervisor":
            raise HTTPException(status_code=403, detail="Solo supervisores pueden ver todas las inspecciones")
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

    docs = await db.inspections.find(filt, {"_id": 0, "client_uuid": 0}).sort("created_at", -1).to_list(2000)
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
    if current_user.get("role") != "supervisor":
        filt["user_id"] = current_user["id"]
    doc = await db.inspections.find_one(filt, {"_id": 0, "client_uuid": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")
    return _serialize_inspection(doc)


@api_router.put("/inspections/{inspection_id}", response_model=Inspection)
async def update_inspection(
    inspection_id: str, body: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(require_supervisor),
):
    doc = await db.inspections.find_one({"id": inspection_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")

    # Update only allowed fields
    update_data = {k: v for k, v in body.items() if k in [
        "compania_transportista", "placas_unidad", "numero_trailer",
        "numero_precinto", "sello_alta_seguridad", "sello_verificado",
        "actividad_sospechosa", "inspector_nombre", "verificador_nombre",
        "points", "status_general"
    ]}

    if "points" in update_data:
        update_data["status_general"] = "malo" if any(p.get("estado") == "malo" for p in update_data["points"]) else "bueno"

    await db.inspections.update_one({"id": inspection_id}, {"$set": update_data})
    updated_doc = await db.inspections.find_one({"id": inspection_id}, {"_id": 0})

    # Sync to AppSheet
    try:
        await sync_to_appsheet("Inspecciones", updated_doc)
    except Exception as e:
        logger.error(f"Error syncing update to AppSheet: {e}")

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
        record = await db.vehicle_records.find_one(
            {"entry.placas_unidad": placas},
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
            raise HTTPException(status_code=500, detail="El servidor SMTP no está configurado o falló el envío")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al enviar reporte: {str(e)}")


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
            raise HTTPException(status_code=500, detail="Error al enviar reporte")
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
        "approved_by_signature": body.signature,
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.inspections.update_one({"id": inspection_id}, {"$set": update})
    doc.update(update)
    await _create_notification(
        user_id=doc["user_id"],
        title="Inspección aprobada",
        message=f"Tu inspección {doc.get('placas_unidad','')} fue APROBADA por {current_user['name']}." + (f" Nota: {body.note}" if body.note else ""),
        inspection_id=inspection_id,
    )

    # Sync update to AppSheet
    try:
        await sync_to_appsheet("Inspecciones", doc)
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
        "approved_by_signature": body.signature,
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.inspections.update_one({"id": inspection_id}, {"$set": update})
    doc.update(update)
    await _create_notification(
        user_id=doc["user_id"],
        title="Inspección rechazada",
        message=f"Tu inspección {doc.get('placas_unidad','')} fue RECHAZADA por {current_user['name']}." + (f" Motivo: {body.note}" if body.note else ""),
        inspection_id=inspection_id,
    )

    # Sync update to AppSheet
    try:
        await sync_to_appsheet("Inspecciones", doc)
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


# ========== Email Utility ==========
async def send_automatic_report(subject: str, recipient: str, body_html: str):
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", 587))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASS")

    if not all([smtp_host, smtp_user, smtp_pass]):
        print("SMTP not configured. Skipping email.")
        return

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
            timeout=15,
        )
        logger.info(f"Reporte enviado exitosamente a {recipient}")
    except Exception as e:
        logger.error(f"Error al enviar correo a {recipient}: {e}")


@api_router.get("/notifications", response_model=List[Notification])
async def list_notifications(current_user: Dict[str, Any] = Depends(get_current_user)):
    docs = await db.notifications.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return [Notification(**d) for d in docs]


@api_router.post("/test-appsheet")
async def test_appsheet(current_user: Dict[str, Any] = Depends(require_admin)):
    """Ruta para probar la conexión con AppSheet API"""
    test_data = {
        "id": str(uuid.uuid4()),
        "test": True,
        "message": "Prueba de conexión desde SRIUC API",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await sync_to_appsheet("Test", test_data)
    return {"message": "Petición de prueba enviada a AppSheet. Revisa los logs del servidor."}


@api_router.post("/test-email")
async def test_email(current_user: Dict[str, Any] = Depends(require_admin)):
    """Ruta para probar la configuración SMTP"""
    recipient = os.environ.get("REPORT_RECIPIENT", "d4r005@gmail.com")
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
        raise HTTPException(status_code=500, detail=f"Error al enviar correo: {str(e)}")


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
    rec_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    entry_data = body.dict()
    entry_data["fecha_entrada"] = entry_data.get("fecha_entrada") or now
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

    # Sync to AppSheet
    try:
        await sync_to_appsheet("Caseta", doc)
    except: pass

    return VehicleRecord(**{k: v for k, v in doc.items() if k != "_id"})


@api_router.get("/vehicle-records", response_model=List[VehicleRecord])
async def list_vehicle_records(
    current_user: Dict[str, Any] = Depends(get_current_user),
    status: Optional[str] = None,
):
    filt: Dict[str, Any] = {}
    if current_user.get("role") != "supervisor":
        filt["user_id"] = current_user["id"]
    if status:
        filt["status"] = status
    docs = await db.vehicle_records.find(filt, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [VehicleRecord(**d) for d in docs]


@api_router.get("/vehicle-records/{rec_id}", response_model=VehicleRecord)
async def get_vehicle_record(rec_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    filt: Dict[str, Any] = {"id": rec_id}
    if current_user.get("role") != "supervisor":
        filt["user_id"] = current_user["id"]
    doc = await db.vehicle_records.find_one(filt, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return VehicleRecord(**doc)


@api_router.put("/vehicle-records/{rec_id}", response_model=VehicleRecord)
async def update_vehicle_record(
    rec_id: str, body: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(require_supervisor),
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

    # Sync to AppSheet
    try:
        await sync_to_appsheet("Caseta", updated_doc)
    except: pass

    return VehicleRecord(**updated_doc)


@api_router.patch("/vehicle-records/{rec_id}/exit", response_model=VehicleRecord)
async def add_exit_to_record(rec_id: str, body: VehicleExit, current_user: Dict[str, Any] = Depends(get_current_user)):
    doc = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    exit_data = body.dict()
    exit_data["fecha_salida"] = exit_data.get("fecha_salida") or datetime.now(timezone.utc).isoformat()

    await db.vehicle_records.update_one(
        {"id": rec_id},
        {"$set": {"exit": exit_data, "status": "salida"}},
    )
    doc["exit"] = exit_data
    doc["status"] = "salida"

    # Intentar enviar reporte automático al finalizar la salida
    try:
        await _trigger_automatic_report(rec_id)
        # Sync update to AppSheet
        await sync_to_appsheet("Caseta", doc)
    except Exception as e:
        print(f"Error al disparar reporte o sync: {e}")

    return VehicleRecord(**doc)


async def _trigger_automatic_report(rec_id: str, recipient_override: Optional[str] = None):
    logger.info(f"Generando reporte consolidado para ID: {rec_id}")
    record = await db.vehicle_records.find_one({"id": rec_id})
    if not record:
        logger.error(f"Reporte cancelado: No existe el registro {rec_id}")
        return False

    placas = record["entry"].get("placas_unidad", "").strip()

    # Buscar inspección vinculada o por placas (respaldo)
    inspection = None
    if record.get("inspection_id"):
        inspection = await db.inspections.find_one({"id": record["inspection_id"]})

    if not inspection and placas:
        logger.info(f"Buscando inspección de respaldo para placas: {placas}")
        inspection = await db.inspections.find_one(
            {"placas_unidad": placas},
            sort=[("created_at", -1)]
        )

    # Buscar ticket de embarque
    fecha_inicio = record["created_at"]
    # If no exit yet, use current time as limit
    fecha_fin = record.get("exit", {}).get("fecha_salida") or datetime.now(timezone.utc).isoformat()

    # Expand search a bit to be sure
    start_dt = datetime.fromisoformat(fecha_inicio.replace('Z', '+00:00')) - timedelta(hours=1)
    end_dt = datetime.fromisoformat(fecha_fin.replace('Z', '+00:00')) + timedelta(hours=1)

    ticket = await db.shipping_tickets.find_one({
        "placas_unidad": placas,
        "created_at": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()}
    })

    logger.info(f"Datos encontrados - Inspección: {'SI' if inspection else 'NO'}, Ticket: {'SI' if ticket else 'NO'}")

    subject = f"REPORTE CONSOLIDADO SRIUC - UNIDAD: {placas}"
    recipient = recipient_override or os.environ.get("REPORT_RECIPIENT", "d.trujillo@brancoindustries.com")

    # Si el estado general de la inspección es malo, marcarlo fuerte en el correo
    color_header = "#0A2540"
    if inspection and inspection.get("status_general") == "malo":
        color_header = "#dc2626" # Rojo si hay falla

    html = f"""
    <html>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 800px; margin: auto; border: 1px solid #eee; padding: 20px;">
            <div style="background-color: {color_header}; padding: 20px; text-align: center; color: white;">
                <h1 style="margin: 0;">Reporte Consolidado de Unidad</h1>
                <p style="margin: 5px 0 0 0; opacity: 0.8;">Sistema de Registro e Inspección (SRIUC)</p>
                {f'<p style="background: white; color: {color_header}; display: inline-block; padding: 2px 10px; font-weight: bold; margin-top: 10px;">¡ALERTA: FALLA DETECTADA!</p>' if inspection and inspection.get("status_general") == "malo" else ''}
            </div>

            <div style="padding: 20px;">
                <h2 style="border-bottom: 2px solid #0A2540; color: #0A2540; padding-bottom: 5px;">1. Movimiento de Caseta</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px; font-weight: bold; width: 30%;">Placas Unidad:</td><td style="padding: 8px;">{record['entry']['placas_unidad']}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Conductor:</td><td style="padding: 8px;">{record['entry']['chofer_nombre']}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Compañía:</td><td style="padding: 8px;">{record['entry'].get('compania_transporte', 'N/A')}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Fecha Entrada:</td><td style="padding: 8px;">{record['entry'].get('fecha_entrada', 'N/A')}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; color: #16A34A;">Fecha Salida:</td><td style="padding: 8px; color: #16A34A; font-weight: bold;">{record['exit'].get('fecha_salida', 'N/A') if record.get('exit') else 'No registrada (En Patio)'}</td></tr>
                    {f'''
                    <tr><td style="padding: 8px; font-weight: bold;">Sello VVTT (Salida):</td><td style="padding: 8px; text-transform: uppercase;">{record['exit'].get('sello_vvtt_estado', 'N/A')}</td></tr>
                    ''' if record.get('exit') else ''}
                </table>

                <h2 style="border-bottom: 2px solid #0A2540; color: #0A2540; padding-bottom: 5px; margin-top: 30px;">2. Inspección C-TPAT (19 Puntos)</h2>
                {f'''
                <div style="background-color: {"#f0fdf4" if inspection.get("status_general") == "bueno" else "#fef2f2"}; padding: 15px; border-radius: 5px; border-left: 5px solid {"#16a34a" if inspection.get("status_general") == "bueno" else "#dc2626"};">
                    <p style="margin: 0;">Estado General: <b style="color: {"#16a34a" if inspection.get("status_general") == "bueno" else "#dc2626"};">{inspection.get('status_general', 'N/A').upper()}</b></p>
                    <p style="margin: 5px 0 0 0;">Inspector: {inspection.get('inspector_nombre', 'N/A')}</p>
                    <p style="margin: 5px 0 0 0;">Aprobación: <b>{inspection.get('approval_status', 'pendiente').upper()}</b></p>
                    <p style="margin: 5px 0 0 0;">Autorizado por: {inspection.get('approved_by_name', 'N/A') if inspection.get('approval_status') != 'pendiente' else 'Pendiente'}</p>
                </div>
                ''' if inspection else "<p style='color: #666; font-style: italic;'>No se realizó inspección digital para esta unidad.</p>"}

                <h2 style="border-bottom: 2px solid #0A2540; color: #0A2540; padding-bottom: 5px; margin-top: 30px;">3. Ticket de Embarque</h2>
                {f'''
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px; font-weight: bold; width: 30%;">Cliente:</td><td style="padding: 8px;">{ticket.get('cliente', 'N/A')}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Almacenista:</td><td style="padding: 8px;">{ticket.get('almacenista', 'N/A')}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Pallets:</td><td style="padding: 8px;">{ticket.get('numero_pallets', 'N/A')}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Sellos:</td><td style="padding: 8px;">{ticket.get('sellos', 'N/A')}</td></tr>
                </table>
                ''' if ticket else "<p style='color: #666; font-style: italic;'>No se generó ticket de embarque para este movimiento.</p>"}
            </div>

            <div style="margin-top: 40px; padding: 20px; background-color: #f9fafb; text-align: center; font-size: 12px; color: #666;">
                <p>Este es un reporte automático generado por el Sistema SRIUC.</p>
                <p>&copy; {datetime.now().year} Branco Industries - Todos los derechos reservados.</p>
            </div>
        </body>
    </html>
    """

    try:
        await send_automatic_report(subject, recipient, html)
        return True
    except Exception as e:
        logger.error(f"Fallo al enviar reporte automático: {e}")
        return False


@api_router.patch("/vehicle-records/{rec_id}/link-inspection")
async def link_inspection(rec_id: str, inspection_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    doc = await db.vehicle_records.find_one({"id": rec_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    new_status = "inspeccionado" if doc.get("status") == "entrada" else doc.get("status")
    await db.vehicle_records.update_one(
        {"id": rec_id},
        {"$set": {"inspection_id": inspection_id, "status": new_status}},
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


@api_router.post("/shipping-tickets", response_model=ShippingTicket)
async def create_ticket(body: ShippingTicketCreate, current_user: Dict[str, Any] = Depends(get_current_user)):
    tid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = body.dict()
    doc["id"] = tid
    doc["user_id"] = current_user["id"]
    doc["fecha"] = doc.get("fecha") or now
    doc["created_at"] = now
    await db.shipping_tickets.insert_one(doc)

    # Sync to AppSheet
    try:
        await sync_to_appsheet("Embarque", doc)
    except: pass

    return ShippingTicket(**{k: v for k, v in doc.items() if k != "_id"})


@api_router.get("/shipping-tickets", response_model=List[ShippingTicket])
async def list_tickets(current_user: Dict[str, Any] = Depends(get_current_user)):
    filt: Dict[str, Any] = {}
    if current_user.get("role") != "supervisor":
        filt["user_id"] = current_user["id"]
    docs = await db.shipping_tickets.find(filt, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [ShippingTicket(**d) for d in docs]


@api_router.get("/shipping-tickets/{ticket_id}", response_model=ShippingTicket)
async def get_ticket(ticket_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    filt: Dict[str, Any] = {"id": ticket_id}
    if current_user.get("role") != "supervisor":
        filt["user_id"] = current_user["id"]
    doc = await db.shipping_tickets.find_one(filt, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return ShippingTicket(**doc)


@api_router.put("/shipping-tickets/{ticket_id}", response_model=ShippingTicket)
async def update_shipping_ticket(
    ticket_id: str, body: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(require_supervisor),
):
    doc = await db.shipping_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    # Update doc with provided body fields (excluding id and user_id)
    update_data = {k: v for k, v in body.items() if k not in ["id", "user_id", "created_at"]}

    await db.shipping_tickets.update_one({"id": ticket_id}, {"$set": update_data})
    updated_doc = await db.shipping_tickets.find_one({"id": ticket_id}, {"_id": 0})

    # Sync to AppSheet
    try:
        await sync_to_appsheet("Embarque", updated_doc)
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


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
