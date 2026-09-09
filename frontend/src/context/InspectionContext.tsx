import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import { supabase } from '../api/supabase';
import { useAuth } from './AuthContext';

const QUEUE_KEY = 'naf_universal_sync_queue';
const CACHE_KEY = 'naf_inspections_cache';

/**
 * Guarda una imagen base64 como archivo temporal en el dispositivo (offline)
 * o la sube directamente a Supabase Storage (online). Devuelve una URI o URL.
 *
 * Estrategia para evitar saturar AsyncStorage:
 * - ONLINE: sube a Supabase Storage → devuelve URL pública
 * - OFFLINE: guarda como archivo temporal con expo-file-system → devuelve file:// URI
 *   La cola solo guarda la URI (decenas de bytes), no el base64 (megabytes)
 */
import * as FileSystem from 'expo-file-system';

const OFFLINE_IMG_DIR = `${FileSystem.documentDirectory}naf_offline_images/`;

async function ensureOfflineDir() {
  const info = await FileSystem.getInfoAsync(OFFLINE_IMG_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(OFFLINE_IMG_DIR, { intermediates: true });
  }
}

async function saveOfflineImage(b64: string): Promise<string> {
  await ensureOfflineDir();
  const fileName = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const filePath = `${OFFLINE_IMG_DIR}${fileName}`;
  // Extraer solo el base64 sin el prefijo data:image/jpeg;base64,
  const pureB64 = b64.split(',')[1] || b64;
  await FileSystem.writeAsStringAsync(filePath, pureB64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return filePath; // file:// URI
}

// ---------- Organización de fotos por unidad y visita ----------
// Estructura de carpeta en Supabase Storage:
//   {PLACAS}-{DDMMYYYY}-{HHMM}  (hora de llegada de la unidad)
//   ej: 73LA2J-09092026-1352 → unidad 73LA2J estuvo el 9-sep-2026, llegó 13:52
// Si la unidad vuelve el mismo día, la hora de llegada distingue cada visita.

function sanitizePlateForFolder(plates?: string | null): string {
  const clean = (plates || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean || 'SINPLACAS';
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Carpeta desde placas y una fecha (zona horaria local del dispositivo) */
function folderFromLocalDate(plates: string, d: Date): string {
  const fecha = `${pad2(d.getDate())}${pad2(d.getMonth() + 1)}${d.getFullYear()}`;
  const hora = `${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  return `${sanitizePlateForFolder(plates)}-${fecha}-${hora}`;
}

/** Carpeta desde placas + fecha del registro (ISO o Date) + hora de llegada "HH:MM" */
function folderFromRecord(plates: string, created: string | Date, horaLlegada?: string): string {
  const d = typeof created === 'string' ? new Date(created) : new Date(created.getTime());
  if (horaLlegada && /^\d{1,2}:\d{2}/.test(horaLlegada)) {
    const [h, m] = horaLlegada.split(':');
    d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
  }
  return folderFromLocalDate(plates, d);
}

async function uploadImage(bucket: string, b64OrUri: string, folder?: string): Promise<string> {
  if (!b64OrUri || typeof b64OrUri !== 'string') return b64OrUri;

  // Si ya es una URL de Supabase, no procesar
  if (b64OrUri.startsWith('http') && !b64OrUri.startsWith('data:image')) return b64OrUri;

  try {
    let blob: Blob;

    if (b64OrUri.startsWith('data:image')) {
      // Es base64 → convertir a blob
      const response = await fetch(b64OrUri);
      blob = await response.blob();
    } else if (b64OrUri.startsWith('file://')) {
      // Es un archivo local (offline) → leer y convertir
      const fileInfo = await FileSystem.getInfoAsync(b64OrUri);
      if (!fileInfo.exists) return b64OrUri; // archivo ya no existe
      const base64Data = await FileSystem.readAsStringAsync(b64OrUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const response = await fetch(`data:image/jpeg;base64,${base64Data}`);
      blob = await response.blob();
      // Limpiar archivo temporal después de subir
      FileSystem.deleteAsync(b64OrUri, { idempotent: true }).catch(() => {});
    } else {
      return b64OrUri;
    }

    const fileName = `${Date.now()}-${uuid()}.jpg`;
    // Ruta con carpeta de unidad-visita: {PLACAS}-{DDMMYYYY}-{HHMM}/{archivo}
    const path = folder ? `${folder}/${fileName}` : fileName;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, blob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return publicUrl;
  } catch (e) {
    console.error(`Error uploading to ${bucket}:`, e);
    throw e;
  }
}

/**
 * Procesa un payload: si tiene imágenes base64, las guarda como archivos
 * temporales y reemplaza el base64 con la URI del archivo.
 * Esto reduce el tamaño de la cola de megabytes a kilobytes.
 */
async function offlineizeImages(payload: any): Promise<any> {
  if (!payload || typeof payload !== 'object') return payload;
  const result = { ...payload };

  // Procesar puntos de inspección
  if (result.points && Array.isArray(result.points)) {
    result.points = await Promise.all(
      result.points.map(async (p: any) => {
        if (p.photo && p.photo.startsWith('data:image')) {
          return { ...p, photo: await saveOfflineImage(p.photo) };
        }
        return p;
      })
    );
  }

  // Procesar firmas
  if (result.inspector_firma && result.inspector_firma.startsWith('data:image')) {
    result.inspector_firma = await saveOfflineImage(result.inspector_firma);
  }
  if (result.guard_signature && result.guard_signature.startsWith('data:image')) {
    result.guard_signature = await saveOfflineImage(result.guard_signature);
  }

  // Procesar cualquier otro campo que sea data:image
  for (const key in result) {
    if (typeof result[key] === 'string' && result[key].startsWith('data:image')) {
      result[key] = await saveOfflineImage(result[key]);
    }
  }

  return result;
}

export interface InspectionPoint {
  number: number;
  name: string;
  estado: string;
  comentarios: string;
  photo?: string;
}

export interface InspectionPayload {
  inspection_type: string;
  compania_transportista?: string;
  placas_unidad: string;
  numero_trailer: string;
  numero_precinto?: string;
  sello_alta_seguridad?: string;
  sello_verificado: boolean;
  points: InspectionPoint[];
  actividad_sospechosa?: string;
  inspector_nombre: string;
  inspector_firma: string;
  fecha_hora?: string;
  client_uuid: string;
  record_id?: string;
  box_type?: string;
  measures?: {
    alto?: string;
    ancho?: string;
    largo?: string;
    capacidad?: string;
  };
  guard_name?: string;
  guard_signature?: string;
}

export interface Inspection extends InspectionPayload {
  id: string;
  user_id: string;
  /** Placa normalizada (alias de placas_unidad usado en búsquedas/filtros) */
  plates?: string;
  inspector_email?: string;
  created_at: string;
  status_general: string;
  approval_status?: 'pendiente' | 'aprobada' | 'rechazada';
  approval_note?: string;
  approved_by?: string;
  approved_by_name?: string;
  approved_sig?: string;
  approved_by_signature?: string;
  approved_at?: string;
  _pending?: boolean;
}

interface SyncItem {
  id: string;
  type: 'inspection' | 'vehicle_record' | 'shipping_ticket' | 'vehicle_exit' | 'warehouse_record';
  method: 'POST' | 'PATCH' | 'PUT';
  endpoint: string;
  payload: any;
  retries?: number;
  queuedAt?: string;
}

// --- Límites para evitar saturar AsyncStorage (~6MB en Android) ---
const MAX_QUEUE_ITEMS = 10;        // máximo de items pendientes
const MAX_QUEUE_BYTES = 4 * 1024 * 1024;  // 4MB máx de la cola serializada
const MAX_RETRIES = 5;             // reintentos antes de descartar un item con error

interface InspectionContextValue {
  inspections: Inspection[];
  allInspections: Inspection[];
  pendingCount: number;
  isOnline: boolean;
  loading: boolean;
  offlineRecords: any[];
  isSyncing: boolean;
  refresh: () => Promise<void>;
  refreshAll: () => Promise<void>;
  saveInspection: (payload: InspectionPayload) => Promise<any>;
  saveVehicleRecord: (payload: any) => Promise<any>;
  saveShippingTicket: (payload: any) => Promise<any>;
  saveWarehouseRecord: (payload: any) => Promise<any>;
  patchVehicleExit: (id: string, payload: any) => Promise<any>;
  getById: (id: string) => Inspection | undefined;
  syncQueue: () => Promise<void>;
  approveInspection: (id: string, note: string, name: string, signature: string) => Promise<void>;
  rejectInspection: (id: string, note: string, name: string, signature: string) => Promise<void>;
  updateInspection: (id: string, payload: Partial<Inspection>) => Promise<void>;
  updateVehicleRecord: (id: string, payload: any) => Promise<void>;
  updateShippingTicket: (id: string, payload: any) => Promise<void>;
  sendManualReport: (id: string) => Promise<void>;
  exportCsvUrl: (mode: 'summary' | 'detailed', scope: 'mine' | 'all') => string;
  token: string | null;
}

const InspectionContext = createContext<InspectionContextValue | undefined>(undefined);

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function InspectionProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [allInspections, setAllInspections] = useState<Inspection[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(false);
  const [offlineRecords, setOfflineRecords] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false); // anti-reentrancia en syncQueue
  // Cache de carpetas de visita por record_id (evita consultas repetidas)
  const visitFolderCache = useRef<Map<string, string>>(new Map());

  /**
   * Resuelve la carpeta de visita para las fotos de un registro.
   * Prioriza el registro de caseta (record_id) para anclar TODAS las fotos
   * de la visita (caseta, inspección, ticket, almacén, salida) a la MISMA
   * carpeta usando la hora de llegada de la unidad.
   */
  const resolveVisitFolder = useCallback(async (
    recordId: string | null | undefined,
    fallbackPlates: string,
    fallbackISO?: string
  ): Promise<string> => {
    const rid = recordId || undefined;
    if (rid) {
      const cached = visitFolderCache.current.get(rid);
      if (cached) return cached;
      try {
        const { data: vr, error } = await supabase
          .from('vehicle_records')
          .select('id, plates, created_at, entry_data')
          .eq('id', rid)
          .maybeSingle();
        if (!error && vr) {
          const ed = vr.entry_data || {};
          const plates = vr.plates || ed.placas_unidad || fallbackPlates;
          const folder = folderFromRecord(plates, vr.created_at, ed.hora_llegada);
          visitFolderCache.current.set(rid, folder);
          return folder;
        }
      } catch (e) {
        console.warn('[fotos] No se pudo anclar la carpeta al registro de caseta:', e);
      }
    }
    // Fallback: placas + fecha/hora propia del payload
    return folderFromLocalDate(fallbackPlates, fallbackISO ? new Date(fallbackISO) : new Date());
  }, []);

  const getQueue = useCallback(async (): Promise<SyncItem[]> => {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }, []);

  const setQueue = useCallback(async (q: SyncItem[]) => {
    // Limitar número de items
    if (q.length > MAX_QUEUE_ITEMS) {
      console.warn(`[SyncQueue] Cola excede ${MAX_QUEUE_ITEMS} items, recortando los más antiguos`);
      q = q.slice(-MAX_QUEUE_ITEMS);
    }
    try {
      const serialized = JSON.stringify(q);
      // Verificar tamaño antes de guardar
      if (serialized.length > MAX_QUEUE_BYTES) {
        console.warn(`[SyncQueue] Cola excede ${MAX_QUEUE_BYTES / 1024 / 1024}MB, eliminando items más antiguos`);
        while (q.length > 1 && JSON.stringify(q).length > MAX_QUEUE_BYTES) {
          q = q.slice(1);
        }
      }
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
      setPendingCount(q.length);
    } catch (e: any) {
      if (e.message?.includes('quota') || e.name === 'QuotaExceededError' || e.message?.includes('exceeded the quota')) {
        console.error('[SyncQueue] AsyncStorage quota exceeded — limpiando cola para que la app siga funcionando');
        await AsyncStorage.removeItem(QUEUE_KEY);
        setPendingCount(0);
        setOfflineRecords([]);
        if (Platform.OS === 'web') {
          alert('⚠️ Memoria llena. Se limpió la cola de sincronización para que la app siga funcionando.');
        }
        return;
      }
      throw e;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('inspections')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped = data.map(item => ({
        ...item.data,
        id: item.id,
        user_id: item.user_id,
        plates: item.plates,
        created_at: item.created_at,
        status_general: item.status_general,
        approval_status: item.approval_status
      }));

      setInspections(mapped);
      setAllInspections(mapped);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(mapped));
    } catch (e) {
      console.error("Refresh error:", e);
    } finally { setLoading(false); }
  }, [token]);

  const refreshAll = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const syncQueue = useCallback(async () => {
    if (!token) return;
    // Anti-reentrancia: si ya está sincronizando, no iniciar otra tanda
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    const queue = await getQueue();
    if (queue.length === 0) { isSyncingRef.current = false; return; }

    setIsSyncing(true);
    const remaining: SyncItem[] = [];

    for (const item of queue) {
      try {
        if (item.type === 'inspection') {
          await saveInspection(item.payload);
        } else if (item.type === 'vehicle_record') {
          await saveVehicleRecord(item.payload);
        } else if (item.type === 'shipping_ticket') {
          await saveShippingTicket(item.payload);
        } else if (item.type === 'warehouse_record') {
          await saveWarehouseRecord(item.payload);
        } else if (item.type === 'vehicle_exit') {
          await patchVehicleExit(item.id, item.payload);
        }
        // Éxito: no agregar a remaining → se elimina de la cola
      } catch (err: any) {
        console.error(`Sync error for ${item.type}:`, err?.message || err);
        const retries = (item.retries || 0) + 1;
        if (retries < MAX_RETRIES) {
          remaining.push({ ...item, retries });
        } else {
          console.warn(`[SyncQueue] Item ${item.id} descartado después de ${retries} intentos`);
        }
      }
    }

    await setQueue(remaining);
    setPendingCount(remaining.length);
    if (remaining.length === 0) {
      setOfflineRecords([]);
    }
    await refresh();
    setIsSyncing(false);
    isSyncingRef.current = false;
  }, [token, refresh, getQueue, setQueue]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const unsub = NetInfo.addEventListener((state) => { setIsOnline(!!state.isConnected); });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!token) {
      setInspections([]);
      setAllInspections([]);
      setPendingCount(0);
      return;
    }
    (async () => {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) { try { setInspections(JSON.parse(cached)); } catch {} }
      const queue = await getQueue();
      setPendingCount(queue.length);
      const offlineRecs = queue
        .filter((item: SyncItem) => item.type === 'vehicle_record')
        .map((item: SyncItem) => ({
          id: item.id, _offline: true, _pending: true,
          status: 'entrada',
          created_at: new Date().toISOString(),
          entry: item.payload,
          exit: null, inspection_id: null, inspection_ids: [],
          shipping_ticket_id: null, has_shipping_ticket: false
        }));
      setOfflineRecords(offlineRecs);
      await refresh();
      await refreshAll();
    })();
  }, [token, user?.role, refresh, refreshAll, getQueue]);

  useEffect(() => {
    if (isOnline && token && pendingCount > 0) syncQueue();
  }, [isOnline, token, pendingCount, syncQueue]);

  useEffect(() => {
    if (!isOnline || !token || pendingCount === 0) return;
    const interval = setInterval(() => {
      syncQueue();
    }, 30000);
    return () => clearInterval(interval);
  }, [isOnline, token, pendingCount, syncQueue]);

  const addToQueue = useCallback(async (item: SyncItem) => {
    const queue = await getQueue();
    queue.push({ ...item, queuedAt: new Date().toISOString(), retries: 0 });
    // Si la cola está llena, eliminar el item más antiguo
    if (queue.length > MAX_QUEUE_ITEMS) {
      console.warn('[SyncQueue] Cola llena, eliminando item más antiguo');
      queue.shift();
    }
    await setQueue(queue);
  }, [getQueue, setQueue]);

  const saveInspection = useCallback(async (payload: InspectionPayload, isFromSync: boolean = false): Promise<any> => {
    const client_uuid = payload.client_uuid || uuid();
    const full = { ...payload, client_uuid, fecha_hora: payload.fecha_hora || new Date().toISOString() };

    // Carpeta de visita: anclada a la hora de llegada del registro de caseta
    const visitFolder = await resolveVisitFolder(full.record_id, full.placas_unidad, full.fecha_hora);

    if (isOnline) {
      try {
        // 1. Upload Point Photos
        const processedPoints = await Promise.all(
          full.points.map(async (p) => ({
            ...p,
            photo: p.photo ? await uploadImage('inspections', p.photo, visitFolder) : p.photo
          }))
        );

        // 2. Upload Signatures
        const inspector_firma = full.inspector_firma
          ? await uploadImage('signatures', full.inspector_firma, visitFolder)
          : full.inspector_firma;

        const guard_signature = full.guard_signature
          ? await uploadImage('signatures', full.guard_signature, visitFolder)
          : full.guard_signature;

        const dataPayload = {
          ...full,
          points: processedPoints,
          inspector_firma,
          guard_signature
        };

        const status_general = processedPoints.some((p) => p.estado === 'malo') ? 'malo' : 'bueno';

        const { data, error } = await supabase
          .from('inspections')
          .insert({
            id: client_uuid,
            plates: full.placas_unidad,
            status_general,
            approval_status: 'pendiente',
            data: dataPayload,
            user_id: user?.id
          })
          .select()
          .single();

        if (error) throw error;
        await refresh();
        return data;
      } catch (err: any) {
        const isNetworkError = err.message?.includes('network') || err.name === 'TypeError';
        if (!isNetworkError) throw err;
      }
    }

    // Guardar imágenes como archivos temporales para no saturar AsyncStorage
    const offlinePayload = await offlineizeImages(full);
    await addToQueue({ id: client_uuid, type: 'inspection', method: 'POST', endpoint: '/inspections', payload: offlinePayload });
    const pending: Inspection = {
      ...full, id: client_uuid, user_id: user?.id || 'offline',
      created_at: new Date().toISOString(),
      status_general: full.points.some((p) => p.estado === 'malo') ? 'malo' : 'bueno',
      approval_status: 'pendiente',
      _pending: true,
    };
    setInspections((prev) => [pending, ...prev]);
    return pending;
  }, [token, user, isOnline, refresh, addToQueue, resolveVisitFolder]);

  const saveVehicleRecord = useCallback(async (payload: any, isFromSync: boolean = false): Promise<any> => {
    const tempId = uuid();
    // Este ES el registro de llegada: carpeta con placas + hora de llegada
    const visitFolder = folderFromRecord(
      payload.placas_unidad || payload.placas || payload.plates || '',
      new Date(),
      payload.hora_llegada
    );
    if (isOnline) {
      try {
        // Upload any base64 images found in payload (evidence)
        const processedPayload = { ...payload };
        for (const key in processedPayload) {
          if (typeof processedPayload[key] === 'string' && processedPayload[key].startsWith('data:image')) {
            processedPayload[key] = await uploadImage('evidence', processedPayload[key], visitFolder);
          }
        }

        const { data, error } = await supabase
          .from('vehicle_records')
          .insert({
            id: tempId,
            plates: payload.placas || payload.plates || payload.placas_unidad || '',
            entry_data: processedPayload,
            user_id: user?.id
          })
          .select()
          .single();

        if (error) throw error;
        await refresh();
        return data;
      } catch (err: any) {
        const isNetworkError = err.message?.includes('network') || err.name === 'TypeError';
        if (!isNetworkError) throw err;
      }
    }
    const offlineVRPayload = await offlineizeImages(payload);
    await addToQueue({ id: tempId, type: 'vehicle_record', method: 'POST', endpoint: '/vehicle-records', payload: offlineVRPayload });
    const offlineRec = {
      id: tempId, _offline: true, _pending: true,
      status: 'entrada',
      created_at: new Date().toISOString(),
      entry: payload,
      exit: null, inspection_id: null, inspection_ids: [],
      shipping_ticket_id: null, has_shipping_ticket: false
    };
    setOfflineRecords(prev => [offlineRec, ...prev]);
    return offlineRec;
  }, [token, isOnline, addToQueue, refresh, user]);

  const saveShippingTicket = useCallback(async (payload: any, isFromSync: boolean = false): Promise<any> => {
    const tempId = uuid();
    // Carpeta anclada a la visita del registro de caseta
    const visitFolder = await resolveVisitFolder(
      payload.record_id,
      payload.placas_unidad || payload.placas || payload.plates || '',
      payload.fecha_hora
    );
    if (isOnline) {
      try {
        const processedPayload = { ...payload };
        for (const key in processedPayload) {
          if (typeof processedPayload[key] === 'string' && processedPayload[key].startsWith('data:image')) {
            processedPayload[key] = await uploadImage('evidence', processedPayload[key], visitFolder);
          }
        }

        const { data, error } = await supabase
          .from('shipping_tickets')
          .insert({
            id: tempId,
            plates: payload.placas || payload.plates || '',
            data: processedPayload,
            user_id: user?.id
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      } catch (err: any) {
        const isNetworkError = err.message?.includes('network') || err.name === 'TypeError';
        if (!isNetworkError) throw err;
      }
    }
    const offlineSTPayload = await offlineizeImages(payload);
    await addToQueue({ id: tempId, type: 'shipping_ticket', method: 'POST', endpoint: '/shipping-tickets', payload: offlineSTPayload });
    return { id: tempId, _offline: true, ...payload };
  }, [token, isOnline, addToQueue, user, resolveVisitFolder]);


  const saveWarehouseRecord = useCallback(async (payload: any, isFromSync: boolean = false): Promise<any> => {
    const tempId = uuid();
    // Carpeta anclada a la visita del registro de caseta
    const visitFolder = await resolveVisitFolder(
      payload.record_id,
      payload.placas_unidad || payload.plates || ''
    );
    if (isOnline) {
      try {
        const processedPayload = { ...payload };
        for (const key in processedPayload) {
          if (typeof processedPayload[key] === 'string' && processedPayload[key].startsWith('data:image')) {
            const bucket = key.startsWith('firma') ? 'signatures' : 'evidence';
            processedPayload[key] = await uploadImage(bucket, processedPayload[key], visitFolder);
          }
        }

        const { data, error } = await supabase
          .from('warehouse_records')
          .insert({
            id: tempId,
            plates: payload.placas_unidad || payload.plates || '',
            data: processedPayload,
            user_id: user?.id,
            record_id: payload.record_id || null
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      } catch (err: any) {
        const isNetworkError = err.message?.includes('network') || err.name === 'TypeError';
        if (!isNetworkError) throw err;
      }
    }
    const offlineWRPayload = await offlineizeImages(payload);
    await addToQueue({ id: tempId, type: 'warehouse_record', method: 'POST', endpoint: '/warehouse-records', payload: offlineWRPayload });
    return { id: tempId, _offline: true, ...payload };
  }, [token, isOnline, addToQueue, user, resolveVisitFolder]);

  const patchVehicleExit = useCallback(async (id: string, payload: any, isFromSync: boolean = false): Promise<any> => {
    // El id ES el registro de caseta → misma carpeta de visita
    const visitFolder = await resolveVisitFolder(
      id,
      payload.placas_unidad || payload.placas || payload.plates || ''
    );
    if (isOnline) {
      try {
        const processedPayload = { ...payload };
        for (const key in processedPayload) {
          if (typeof processedPayload[key] === 'string' && processedPayload[key].startsWith('data:image')) {
            const bucket = key.includes('signature') ? 'signatures' : 'evidence';
            processedPayload[key] = await uploadImage(bucket, processedPayload[key], visitFolder);
          }
        }

        const { data, error } = await supabase
          .from('vehicle_records')
          .update({
            exit_data: processedPayload
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } catch (err: any) {
        const isNetworkError = err.message?.includes('network') || err.name === 'TypeError';
        if (!isNetworkError) throw err;
      }
    }
    const offlineExitPayload = await offlineizeImages(payload);
    await addToQueue({ id, type: 'vehicle_exit', method: 'PATCH', endpoint: `/vehicle-records/${id}/exit`, payload: offlineExitPayload });
    return { id, _offline: true, exit: payload };
  }, [token, isOnline, addToQueue, resolveVisitFolder]);

  const getById = useCallback((id: string) => {
    return inspections.find((i) => i.id === id) || allInspections.find((i) => i.id === id);
  }, [inspections, allInspections]);

  const approveInspection = useCallback(async (id: string, note: string, name: string, signature: string) => {
    if (!token) return;
    const insp = getById(id);
    const visitFolder = insp ? await resolveVisitFolder(insp.record_id, insp.placas_unidad, insp.fecha_hora) : undefined;
    const signatureUrl = await uploadImage('signatures', signature, visitFolder);
    const { error } = await supabase
      .from('inspections')
      .update({
        approval_status: 'aprobada',
        approval_note: note,
        approved_by: user?.id,
        approved_by_name: name,
        approved_by_signature: signatureUrl,
        approved_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;
    await Promise.all([refresh(), refreshAll()]);
  }, [token, refresh, refreshAll, user, getById, resolveVisitFolder]);

  const rejectInspection = useCallback(async (id: string, note: string, name: string, signature: string) => {
    if (!token) return;
    const insp = getById(id);
    const visitFolder = insp ? await resolveVisitFolder(insp.record_id, insp.placas_unidad, insp.fecha_hora) : undefined;
    const signatureUrl = await uploadImage('signatures', signature, visitFolder);
    const { error } = await supabase
      .from('inspections')
      .update({
        approval_status: 'rechazada',
        approval_note: note,
        approved_by: user?.id,
        approved_by_name: name,
        approved_by_signature: signatureUrl,
        approved_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;
    await Promise.all([refresh(), refreshAll()]);
  }, [token, refresh, refreshAll, user, getById, resolveVisitFolder]);

  const updateInspection = useCallback(async (id: string, payload: Partial<Inspection>) => {
    if (!token) return;
    try {
      const processed = { ...payload };

      // Carpeta de visita: la inspección existente ya conoce su record/fecha
      const existing = getById(id);
      let anchorRecordId = processed.record_id || existing?.record_id;
      if (!anchorRecordId) {
        const { data: row } = await supabase
          .from('inspections')
          .select('record_id')
          .eq('id', id)
          .maybeSingle();
        anchorRecordId = row?.record_id;
      }
      const visitFolder = await resolveVisitFolder(
        anchorRecordId,
        processed.placas_unidad || existing?.placas_unidad || '',
        processed.fecha_hora || existing?.fecha_hora
      );

      // Process points if they exist
      if (processed.points) {
        processed.points = await Promise.all(
          processed.points.map(async (p) => ({
            ...p,
            photo: p.photo ? await uploadImage('inspections', p.photo, visitFolder) : p.photo
          }))
        );
      }

      // Process signatures
      if (processed.inspector_firma) {
        processed.inspector_firma = await uploadImage('signatures', processed.inspector_firma, visitFolder);
      }
      if (processed.guard_signature) {
        processed.guard_signature = await uploadImage('signatures', processed.guard_signature, visitFolder);
      }
      if (processed.approved_by_signature) {
        processed.approved_by_signature = await uploadImage('signatures', processed.approved_by_signature, visitFolder);
      }

      const { error } = await supabase
        .from('inspections')
        .update({
          data: processed,
          plates: processed.placas_unidad || undefined,
          status_general: processed.points ? (processed.points.some(p => p.estado === 'malo') ? 'malo' : 'bueno') : undefined,
          approval_status: processed.approval_status
        })
        .eq('id', id);

      if (error) throw error;
      await Promise.all([refresh(), refreshAll()]);
    } catch (err) {
      console.error("Error updating inspection:", err);
      throw err;
    }
  }, [token, refresh, refreshAll, getById, resolveVisitFolder]);

  const updateVehicleRecord = useCallback(async (id: string, payload: any) => {
    if (!token) return;
    try {
      // El id ES el registro de caseta → misma carpeta de visita
      const visitFolder = await resolveVisitFolder(
        id,
        payload.placas || payload.plates || payload.placas_unidad || ''
      );
      const processedPayload = { ...payload };
      for (const key in processedPayload) {
        if (typeof processedPayload[key] === 'string' && processedPayload[key].startsWith('data:image')) {
          processedPayload[key] = await uploadImage('evidence', processedPayload[key], visitFolder);
        }
      }
      const { error } = await supabase
        .from('vehicle_records')
        .update({
          entry_data: processedPayload,
          plates: processedPayload.placas || processedPayload.plates || processedPayload.placas_unidad || undefined
        })
        .eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.error("Error updating vehicle record:", err);
      throw err;
    }
  }, [token, resolveVisitFolder]);

  const updateShippingTicket = useCallback(async (id: string, payload: any) => {
    if (!token) return;
    try {
      // Anclar al registro de caseta de la visita (del payload o del ticket en BD)
      let anchorRecordId = payload.record_id;
      if (!anchorRecordId) {
        const { data: ticket } = await supabase
          .from('shipping_tickets')
          .select('record_id')
          .eq('id', id)
          .maybeSingle();
        anchorRecordId = ticket?.record_id;
      }
      const visitFolder = await resolveVisitFolder(
        anchorRecordId,
        payload.placas || payload.plates || payload.placas_unidad || ''
      );
      const processedPayload = { ...payload };
      for (const key in processedPayload) {
        if (typeof processedPayload[key] === 'string' && processedPayload[key].startsWith('data:image')) {
          processedPayload[key] = await uploadImage('evidence', processedPayload[key], visitFolder);
        }
      }

      const { error } = await supabase
        .from('shipping_tickets')
        .update({
          data: processedPayload,
          plates: processedPayload.placas || processedPayload.plates || processedPayload.placas_unidad || ''
        })
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error("Error updating shipping ticket:", err);
      throw err;
    }
  }, [token, resolveVisitFolder]);

  const sendManualReport = useCallback(async (id: string) => {
    // This functionality might need an Edge Function in Supabase
    console.warn("sendManualReport is not implemented for Supabase yet.");
  }, []);

  const exportCsvUrl = useCallback((mode: 'summary' | 'detailed', scope: 'mine' | 'all') => {
    return ""; // Needs implementation via Supabase Edge Functions or similar
  }, []);

  return (
    <InspectionContext.Provider
      value={{
        inspections, allInspections, pendingCount, isOnline, loading, offlineRecords, isSyncing,
        refresh, refreshAll, saveInspection, saveVehicleRecord, saveShippingTicket, saveWarehouseRecord, patchVehicleExit, getById, syncQueue,
        approveInspection, rejectInspection, updateInspection, updateVehicleRecord, updateShippingTicket, sendManualReport, exportCsvUrl,
        token
      }}
    >
      {children}
    </InspectionContext.Provider>
  );
}

export function useInspections() {
  const ctx = useContext(InspectionContext);
  if (!ctx) throw new Error('useInspections debe usarse dentro de InspectionProvider');
  return ctx;
}
