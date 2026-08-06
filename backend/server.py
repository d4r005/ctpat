from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from dotenv import load_dotenv
import os
import logging
import re
import base64
from pathlib import Path
from pydantic import BaseModel
from typing import Optional, Dict, Any

# Configuración de Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("SRIUC-MINIMAL")

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

security = HTTPBearer()

try:
    import google.generativeai as genai
    HAS_GOOGLE_AI = True
except ImportError:
    HAS_GOOGLE_AI = False
    genai = None

# Configuración AI
GEMINI_KEY = os.environ.get("GEMINI_API_KEY")
if HAS_GOOGLE_AI and GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)
    ai_model = genai.GenerativeModel('gemini-2.5-flash')
else:
    ai_model = None

class OCRRequest(BaseModel):
    image_b64: str
    context: str # 'entry', 'inspection', 'ticket'
    mime_type: Optional[str] = None

app = FastAPI()

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware)

def _detect_image_mime(img_data: bytes, declared: Optional[str] = None) -> str:
    if img_data[:3] == b"\xff\xd8\xff": return "image/jpeg"
    if img_data[:8] == b"\x89PNG\r\n\x1a\n": return "image/png"
    if img_data[:6] in (b"GIF87a", b"GIF89a"): return "image/gif"
    if img_data[:4] == b"RIFF" and img_data[8:12] == b"WEBP": return "image/webp"
    if declared and declared.startswith("image/"): return declared
    return "image/jpeg"

async def analyze_document_ai(image_b64: str, context: str, mime_type: Optional[str] = None) -> Dict[str, Any]:
    if not ai_model: return {"error": "AI_NOT_CONFIGURED"}
    if "," in image_b64: image_b64 = image_b64.split(",")[1]
    try:
        img_data = base64.b64decode(image_b64)
    except: return {"error": "INVALID_IMAGE_DATA"}
    if not img_data: return {"error": "EMPTY_IMAGE"}
    real_mime = _detect_image_mime(img_data, mime_type)

    prompts = {
        "entry": "Extract data from this vehicle entry log. Return JSON: {placas_unidad, chofer_nombre, compania_transporte, numero_tractor, numero_caja, sello_entrada, destino}",
        "inspection": "Extract data from this C-TPAT inspection sheet. Return JSON: {placas_unidad, status_general (bueno/malo), points (list of {number, name, estado (bueno/malo), comentarios}), measures: {alto, ancho, largo, capacidad}}",
        "ticket": "Extract data from this shipping ticket. Return JSON: {placas_unidad, cliente, operador, numero_caja, numero_pallets, numero_sello}"
    }
    prompt = prompts.get(context, "Extract all readable fields into JSON.")

    try:
        response = ai_model.generate_content([prompt, {"mime_type": real_mime, "data": img_data}])
        text = response.text
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            import json
            return json.loads(json_match.group())
        return {"error": "JSON_NOT_FOUND", "raw": text}
    except Exception as e:
        logger.error(f"Error AI OCR: {e}")
        return {"error": str(e)}

@app.post("/api/ocr/analyze")
async def ocr_analyze(body: OCRRequest):
    """Analiza una foto de un documento físico (Servicio AI)"""
    data = await analyze_document_ai(body.image_b64, body.context, body.mime_type)
    return data

@app.get("/health")
async def health():
    return {"status": "ok", "backend": "minimalist (supabase migration complete)"}

@app.get("/")
async def root():
    return {"message": "SRIUC AI Backend is running. Database is now on Supabase."}
