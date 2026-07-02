import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import { apiCall, API_BASE } from '../api/client';
import { useAuth } from './AuthContext';

const QUEUE_KEY = 'naf_universal_sync_queue';
const CACHE_KEY = 'naf_inspections_cache';

export interface InspectionPoint {
  number: number;
  name: string;
  estado: string;
  comentarios: string;
  photo?: string;
}

export interface InspectionPayload {
  inspection_type: string;
  // Campos opcionales: registros históricos reconstruidos pueden no traerlos completos.
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
  // Nuevos campos de dimensiones
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
  type: 'inspection' | 'vehicle_record' | 'shipping_ticket' | 'vehicle_exit';
  method: 'POST' | 'PATCH' | 'PUT';
  endpoint: string;
  payload: any;
}

interface InspectionContextValue {
  inspections: Inspection[];
  allInspections: Inspection[];
  pendingCount: number;
  isOnline: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  refreshAll: () => Promise<void>;
  saveInspection: (payload: InspectionPayload) => Promise<any>;
  saveVehicleRecord: (payload: any) => Promise<any>;
  saveShippingTicket: (payload: any) => Promise<any>;
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

  const getQueue = useCallback(async (): Promise<SyncItem[]> => {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }, []);

  const setQueue = useCallback(async (q: SyncItem[]) => {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    setPendingCount(q.length);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      // Simplificar lógica de permisos: Si es admin o supervisor, scope all.
      const isAdmin = user?.role === 'admin' || user?.role === 'supervisor' ||
                      ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(user?.email || '');
      const scope = isAdmin ? 'all' : 'mine';

      const data = await apiCall<Inspection[]>(`/inspections?summary=true&scope=${scope}`, { token });
      setInspections((prev) => {
        const pending = prev.filter((p) => p._pending);
        const merged = [...pending, ...data];
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(merged));
        return merged;
      });
    } catch (e) {
      console.error("Refresh error:", e);
    } finally { setLoading(false); }
  }, [token, user]);

  const refreshAll = useCallback(async () => {
    if (!token) return;
    try {
      // Quitamos la validación local de rol para dejar que sea el servidor quien responda
      const data = await apiCall<Inspection[]>('/inspections?scope=all&summary=true', { token });
      if (Array.isArray(data)) {
        setAllInspections(data);
      }
    } catch (e) {
      console.error("Error en refreshAll (Supervisor):", e);
    }
  }, [token]);

  const syncQueue = useCallback(async () => {
    if (!token) return;
    const queue = await getQueue();
    if (queue.length === 0) return;

    const remaining: SyncItem[] = [];
    for (const item of queue) {
      try {
        await apiCall(item.endpoint, { method: item.method, body: item.payload, token });
      } catch (err) {
        remaining.push(item);
      }
    }
    await setQueue(remaining);
    await refresh();
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
      await refresh();
      await refreshAll();
    })();
  }, [token, user?.role, refresh, refreshAll, getQueue]);

  useEffect(() => {
    if (isOnline && token && pendingCount > 0) syncQueue();
  }, [isOnline, token, pendingCount, syncQueue]);

  const addToQueue = useCallback(async (item: SyncItem) => {
    const queue = await getQueue();
    queue.push(item);
    await setQueue(queue);
  }, [getQueue, setQueue]);

  const saveInspection = useCallback(async (payload: InspectionPayload): Promise<any> => {
    const client_uuid = payload.client_uuid || uuid();
    const full = { ...payload, client_uuid, fecha_hora: payload.fecha_hora || new Date().toISOString() };
    if (isOnline) {
      try {
        const res = await apiCall('/inspections', { method: 'POST', body: full, token });
        await refresh();
        return res;
      } catch (err: any) {
        // Sólo se encola para reintentar offline si fue un fallo de RED (sin
        // conexión real, timeout, etc). Si el servidor respondió rechazando la
        // petición (permiso, validación...), antes se tragaba el error en
        // silencio y se simulaba éxito guardando "pendiente" -- el usuario
        // creía que se había guardado y en realidad nunca llegó al servidor.
        if (!err?.isNetworkError) throw err;
      }
    }
    await addToQueue({ id: client_uuid, type: 'inspection', method: 'POST', endpoint: '/inspections', payload: full });
    const pending: Inspection = {
      ...full, id: client_uuid, user_id: user?.id || 'offline',
      created_at: new Date().toISOString(),
      status_general: full.points.some((p) => p.estado === 'malo') ? 'malo' : 'bueno',
      approval_status: 'pendiente',
      _pending: true,
    };
    setInspections((prev) => [pending, ...prev]);
    return pending;
  }, [token, user, isOnline, refresh, addToQueue]);

  const saveVehicleRecord = useCallback(async (payload: any): Promise<any> => {
    const tempId = uuid();
    if (isOnline) {
      try { return await apiCall('/vehicle-records', { method: 'POST', body: payload, token }); }
      catch (err: any) { if (!err?.isNetworkError) throw err; }
    }
    await addToQueue({ id: tempId, type: 'vehicle_record', method: 'POST', endpoint: '/vehicle-records', payload });
    return { id: tempId, _offline: true, entry: payload };
  }, [token, isOnline, addToQueue]);

  const saveShippingTicket = useCallback(async (payload: any): Promise<any> => {
    const tempId = uuid();
    if (isOnline) {
      try { return await apiCall('/shipping-tickets', { method: 'POST', body: payload, token }); }
      catch (err: any) { if (!err?.isNetworkError) throw err; }
    }
    await addToQueue({ id: tempId, type: 'shipping_ticket', method: 'POST', endpoint: '/shipping-tickets', payload });
    return { id: tempId, _offline: true, ...payload };
  }, [token, isOnline, addToQueue]);

  const patchVehicleExit = useCallback(async (id: string, payload: any): Promise<any> => {
    // IMPORTANTE: si hay conexión pero la petición falla (permiso, validación,
    // 500, etc.) NO debe tratarse como si estuviera offline -- antes el error
    // se descartaba en silencio y se simulaba un "éxito" encolando el cambio,
    // por lo que el usuario veía "Salida registrada" aunque el guardado real
    // hubiera fallado. Ahora sólo se encola cuando realmente no hay conexión;
    // si hay conexión y falla, se propaga el error para que se muestre al usuario.
    if (isOnline) {
      try { return await apiCall(`/vehicle-records/${id}/exit`, { method: 'PATCH', body: payload, token }); }
      catch (err: any) { if (!err?.isNetworkError) throw err; }
    }
    await addToQueue({ id, type: 'vehicle_exit', method: 'PATCH', endpoint: `/vehicle-records/${id}/exit`, payload });
    return { id, _offline: true, exit: payload };
  }, [token, isOnline, addToQueue]);

  const getById = useCallback((id: string) => {
    return inspections.find((i) => i.id === id) || allInspections.find((i) => i.id === id);
  }, [inspections, allInspections]);

  const approveInspection = useCallback(async (id: string, note: string, name: string, signature: string) => {
    if (!token) return;
    await apiCall(`/inspections/${id}/approve`, { method: 'POST', body: { note, name, signature }, token });
    await Promise.all([refresh(), refreshAll()]);
  }, [token, refresh, refreshAll]);

  const rejectInspection = useCallback(async (id: string, note: string, name: string, signature: string) => {
    if (!token) return;
    await apiCall(`/inspections/${id}/reject`, { method: 'POST', body: { note, name, signature }, token });
    await Promise.all([refresh(), refreshAll()]);
  }, [token, refresh, refreshAll]);

  const updateInspection = useCallback(async (id: string, payload: Partial<Inspection>) => {
    if (!token) return;
    await apiCall(`/inspections/${id}`, { method: 'PUT', body: payload, token });
    await Promise.all([refresh(), refreshAll()]);
  }, [token, refresh, refreshAll]);

  const updateVehicleRecord = useCallback(async (id: string, payload: any) => {
    if (!token) return;
    await apiCall(`/vehicle-records/${id}`, { method: 'PUT', body: payload, token });
  }, [token]);

  const updateShippingTicket = useCallback(async (id: string, payload: any) => {
    if (!token) return;
    await apiCall(`/shipping-tickets/${id}`, { method: 'PUT', body: payload, token });
  }, [token]);

  const sendManualReport = useCallback(async (id: string) => {
    if (!token) return;
    await apiCall(`/inspections/${id}/send-report`, { method: 'POST', token });
  }, [token]);

  const exportCsvUrl = useCallback((mode: 'summary' | 'detailed', scope: 'mine' | 'all') => {
    return `${API_BASE}/inspections/export?mode=${mode}&scope=${scope}`;
  }, []);

  return (
    <InspectionContext.Provider
      value={{
        inspections, allInspections, pendingCount, isOnline, loading,
        refresh, refreshAll, saveInspection, saveVehicleRecord, saveShippingTicket, patchVehicleExit, getById, syncQueue,
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
