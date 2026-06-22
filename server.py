from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt as pyjwt


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT config
JWT_SECRET = os.environ.get('JWT_SECRET', 'naf-inspection-secret-change-in-prod')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRE_HOURS = 24 * 30  # 30 days for field workers

app = FastAPI(title="NAF Inspección 19 Puntos API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()


# ========== Models ==========
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserPublic(BaseModel):
    id: str
    email: str
    name: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class InspectionPoint(BaseModel):
    number: int
    name: str
    estado: str  # "bueno" | "malo" | "na"
    comentarios: str = ""

class InspectionCreate(BaseModel):
    compania_transportista: str
    placas_unidad: str
    numero_trailer: str
    numero_precinto: str
    sello_alta_seguridad: str
    sello_verificado: bool = False
    points: List[InspectionPoint]
    actividad_sospechosa: str = ""
    inspector_nombre: str
    inspector_firma: str = ""  # base64 png
    verificador_nombre: str = ""
    verificador_firma: str = ""  # base64 png
    fecha_hora: Optional[str] = None
    client_uuid: Optional[str] = None  # for offline dedup

class Inspection(BaseModel):
    id: str
    user_id: str
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
    status_general: str  # "bueno" | "malo"


# ========== Helpers ==========
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
    return user


# ========== Routes ==========
@api_router.get("/")
async def root():
    return {"message": "NAF Inspección API", "ok": True}


@api_router.post("/auth/register", response_model=TokenResponse)
async def register(body: UserRegister):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="El correo ya está registrado")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": body.email.lower(),
        "name": body.name,
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_id)
    return TokenResponse(
        access_token=token,
        user=UserPublic(id=user_id, email=body.email.lower(), name=body.name),
    )


@api_router.post("/auth/login", response_model=TokenResponse)
async def login(body: UserLogin):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    token = create_token(user["id"])
    return TokenResponse(
        access_token=token,
        user=UserPublic(id=user["id"], email=user["email"], name=user["name"]),
    )


@api_router.get("/auth/me", response_model=UserPublic)
async def me(current_user: Dict[str, Any] = Depends(get_current_user)):
    return UserPublic(id=current_user["id"], email=current_user["email"], name=current_user["name"])


@api_router.post("/inspections", response_model=Inspection)
async def create_inspection(body: InspectionCreate, current_user: Dict[str, Any] = Depends(get_current_user)):
    # Offline dedup: if client_uuid already exists for this user, return existing
    if body.client_uuid:
        existing = await db.inspections.find_one(
            {"user_id": current_user["id"], "client_uuid": body.client_uuid},
            {"_id": 0}
        )
        if existing:
            return Inspection(**{k: v for k, v in existing.items() if k != "client_uuid"})

    insp_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    fecha_hora = body.fecha_hora or now
    status_general = "malo" if any(p.estado == "malo" for p in body.points) else "bueno"

    doc = {
        "id": insp_id,
        "user_id": current_user["id"],
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
        "client_uuid": body.client_uuid,
    }
    await db.inspections.insert_one(doc)
    return Inspection(**{k: v for k, v in doc.items() if k != "client_uuid" and k != "_id"})


@api_router.get("/inspections", response_model=List[Inspection])
async def list_inspections(current_user: Dict[str, Any] = Depends(get_current_user)):
    docs = await db.inspections.find(
        {"user_id": current_user["id"]},
        {"_id": 0, "client_uuid": 0}
    ).sort("created_at", -1).to_list(1000)
    return [Inspection(**d) for d in docs]


@api_router.get("/inspections/{inspection_id}", response_model=Inspection)
async def get_inspection(inspection_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    doc = await db.inspections.find_one(
        {"id": inspection_id, "user_id": current_user["id"]},
        {"_id": 0, "client_uuid": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")
    return Inspection(**doc)


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
