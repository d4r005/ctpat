// URL del servidor (Backend)
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

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { detail: text };
    }

    if (!res.ok) {
      const message = data?.detail || `Error ${res.status}`;
      throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
    }
    return data as T;
  } catch (error: any) {
    if (error.message === 'Network request failed') {
      throw new Error(`Error de conexión: No se pudo contactar al servidor en ${url}. Verifica que el backend esté corriendo.`);
    }
    throw error;
  }
}

export { API_BASE, BACKEND_URL };
