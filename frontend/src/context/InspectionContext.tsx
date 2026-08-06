import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import { supabase } from '../api/supabase';
import { useAuth } from './AuthContext';

const QUEUE_KEY = 'naf_universal_sync_queue';
const CACHE_KEY = 'naf_inspections_cache';

/**
 * Sube una imagen en Base64 a Supabase Storage y devuelve la URL pública.
 */
async function uploadImage(bucket: string, b64: string): Promise<string> {
  if (!b64 || typeof b64 !== 'string' || !b64.startsWith('data:image')) return b64;
  try {
    const response = await fetch(b64);
    const blob = await response.blob();
    const fileName = `${Date.now()}-${uuid()}.jpg`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, blob, {
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
  offlineRecords: any[];
  isSyncing: boolean;
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
  const [offlineRecords, setOfflineRecords] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const getQueue = useCallback(async (): Promise<SyncItem[]> => {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }, []);

  const setQueue = useCallback(async (q: SyncItem[]) => {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
      setPendingCount(q.length);
    } catch (e: any) {
      if (e.message?.includes('quota') || e.name === 'QuotaExceededError' || e.message?.includes('exceeded the quota')) {
        if (Platform.OS === 'web') {
          const clear = window.confirm("⚠️ MEMORIA LLENA: No se pueden guardar más registros offline porque la memoria del navegador está llena.\n\n¿Deseas limpiar la cola de sincronización para poder seguir usando la app? (Se perderán los registros que no se han subido)");
          if (clear) {
            await AsyncStorage.removeItem(QUEUE_KEY);
            setPendingCount(0);
            return;
          }
        }
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
    const queue = await getQueue();
    if (queue.length === 0) return;

    setIsSyncing(true);

    let successCount = 0;
    const remaining: SyncItem[] = [];

    for (const item of queue) {
      try {
        if (item.type === 'inspection') {
          await saveInspection(item.payload);
        } else if (item.type === 'vehicle_record') {
          await saveVehicleRecord(item.payload);
        } else if (item.type === 'shipping_ticket') {
          await saveShippingTicket(item.payload);
        } else if (item.type === 'vehicle_exit') {
          await patchVehicleExit(item.id, item.payload);
        }
        successCount++;
      } catch (err) {
        console.error(`Sync error for ${item.type}:`, err);
        remaining.push(item);
      }
    }

    await setQueue(remaining);
    setPendingCount(remaining.length);
    if (remaining.length === 0) {
      setOfflineRecords([]);
    }
    await refresh();
    setIsSyncing(false);
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
    queue.push(item);
    await setQueue(queue);
  }, [getQueue, setQueue]);

  const saveInspection = useCallback(async (payload: InspectionPayload): Promise<any> => {
    const client_uuid = payload.client_uuid || uuid();
    const full = { ...payload, client_uuid, fecha_hora: payload.fecha_hora || new Date().toISOString() };

    if (isOnline) {
      try {
        // 1. Upload Point Photos
        const processedPoints = await Promise.all(
          full.points.map(async (p) => ({
            ...p,
            photo: p.photo ? await uploadImage('inspections', p.photo) : p.photo
          }))
        );

        // 2. Upload Signatures
        const inspector_firma = full.inspector_firma
          ? await uploadImage('signatures', full.inspector_firma)
          : full.inspector_firma;

        const guard_signature = full.guard_signature
          ? await uploadImage('signatures', full.guard_signature)
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
      try {
        // Upload any base64 images found in payload (evidence)
        const processedPayload = { ...payload };
        for (const key in processedPayload) {
          if (typeof processedPayload[key] === 'string' && processedPayload[key].startsWith('data:image')) {
            processedPayload[key] = await uploadImage('evidence', processedPayload[key]);
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
    await addToQueue({ id: tempId, type: 'vehicle_record', method: 'POST', endpoint: '/vehicle-records', payload });
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

  const saveShippingTicket = useCallback(async (payload: any): Promise<any> => {
    const tempId = uuid();
    if (isOnline) {
      try {
        const processedPayload = { ...payload };
        for (const key in processedPayload) {
          if (typeof processedPayload[key] === 'string' && processedPayload[key].startsWith('data:image')) {
            processedPayload[key] = await uploadImage('evidence', processedPayload[key]);
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
    await addToQueue({ id: tempId, type: 'shipping_ticket', method: 'POST', endpoint: '/shipping-tickets', payload });
    return { id: tempId, _offline: true, ...payload };
  }, [token, isOnline, addToQueue, user]);

  const patchVehicleExit = useCallback(async (id: string, payload: any): Promise<any> => {
    if (isOnline) {
      try {
        const processedPayload = { ...payload };
        for (const key in processedPayload) {
          if (typeof processedPayload[key] === 'string' && processedPayload[key].startsWith('data:image')) {
            const bucket = key.includes('signature') ? 'signatures' : 'evidence';
            processedPayload[key] = await uploadImage(bucket, processedPayload[key]);
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
    await addToQueue({ id, type: 'vehicle_exit', method: 'PATCH', endpoint: `/vehicle-records/${id}/exit`, payload });
    return { id, _offline: true, exit: payload };
  }, [token, isOnline, addToQueue]);

  const getById = useCallback((id: string) => {
    return inspections.find((i) => i.id === id) || allInspections.find((i) => i.id === id);
  }, [inspections, allInspections]);

  const approveInspection = useCallback(async (id: string, note: string, name: string, signature: string) => {
    if (!token) return;
    const signatureUrl = await uploadImage('signatures', signature);
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
  }, [token, refresh, refreshAll, user]);

  const rejectInspection = useCallback(async (id: string, note: string, name: string, signature: string) => {
    if (!token) return;
    const signatureUrl = await uploadImage('signatures', signature);
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
  }, [token, refresh, refreshAll, user]);

  const updateInspection = useCallback(async (id: string, payload: Partial<Inspection>) => {
    if (!token) return;
    try {
      const processed = { ...payload };

      // Process points if they exist
      if (processed.points) {
        processed.points = await Promise.all(
          processed.points.map(async (p) => ({
            ...p,
            photo: p.photo ? await uploadImage('inspections', p.photo) : p.photo
          }))
        );
      }

      // Process signatures
      if (processed.inspector_firma) {
        processed.inspector_firma = await uploadImage('signatures', processed.inspector_firma);
      }
      if (processed.guard_signature) {
        processed.guard_signature = await uploadImage('signatures', processed.guard_signature);
      }
      if (processed.approved_by_signature) {
        processed.approved_by_signature = await uploadImage('signatures', processed.approved_by_signature);
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
  }, [token, refresh, refreshAll]);

  const updateVehicleRecord = useCallback(async (id: string, payload: any) => {
    if (!token) return;
    try {
      const processedPayload = { ...payload };
      for (const key in processedPayload) {
        if (typeof processedPayload[key] === 'string' && processedPayload[key].startsWith('data:image')) {
          processedPayload[key] = await uploadImage('evidence', processedPayload[key]);
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
  }, [token]);

  const updateShippingTicket = useCallback(async (id: string, payload: any) => {
    if (!token) return;
    try {
      const processedPayload = { ...payload };
      for (const key in processedPayload) {
        if (typeof processedPayload[key] === 'string' && processedPayload[key].startsWith('data:image')) {
          processedPayload[key] = await uploadImage('evidence', processedPayload[key]);
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
  }, [token]);

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
