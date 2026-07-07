// URL del servidor (Backend) - Sincronizado con HuggingFace Prod
let BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://d4r005-sriuc.hf.space';

// Asegurar que la URL sea limpia
BACKEND_URL = BACKEND_URL.replace(/\/$/, "");
const API_BASE = BACKEND_URL.endsWith('/')
  ? `${BACKEND_URL}api`
  : `${BACKEND_URL}/api`;

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  token?: string | null;
}

export async function apiCall<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = opts;
  const url = `${API_BASE}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Configurar timeout de 120 segundos para subidas pesadas (fotos)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { detail: text };
    }

    if (!res.ok) {
      const message = data?.detail || `Error ${res.status}`;
      // isNetworkError=false: el servidor SI respondio (rechazo la peticion por
      // permisos/validacion/etc). Esto no debe tratarse como "sin conexion" --
      // ver nota en InspectionContext sobre por que importa esta distincion.
      const err: any = new Error(typeof message === 'string' ? message : JSON.stringify(message));
      err.isNetworkError = false;
      err.status = res.status;
      throw err;
    }
    return data as T;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      const err: any = new Error("Error de conexión con el servidor. Posiblemente las fotos son muy pesadas o el internet es inestable. Intenta de nuevo.");
      err.isNetworkError = true;
      throw err;
    }
    if (error.message === 'Network request failed') {
      const err: any = new Error(`Error de conexión: No se pudo contactar al servidor en ${url}. Verifica tu internet o si el backend está activo.`);
      err.isNetworkError = true;
      throw err;
    }
    // Cualquier otro error ya trae isNetworkError definido si vino del bloque
    // de arriba (res.ok === false); si no, es un fallo inesperado del cliente
    // (ej. error de parseo) y se trata como error real, no como "sin conexion".
    if (error.isNetworkError === undefined) error.isNetworkError = false;
    throw error;
  }
}

export { API_BASE, BACKEND_URL };
