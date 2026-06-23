import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import { apiCall, API_BASE } from '../api/client';
import { useAuth } from './AuthContext';

const QUEUE_KEY = 'naf_inspection_queue';
const CACHE_KEY = 'naf_inspections_cache';

export interface InspectionPoint {
  number: number;
  name: string;
  estado: string;
  comentarios: string;
  photo?: string;
}

export interface InspectionPayload {
  compania_transportista: string;
  placas_unidad: string;
  numero_trailer: string;
  numero_precinto: string;
  sello_alta_seguridad: string;
  sello_verificado: boolean;
  points: InspectionPoint[];
  actividad_sospechosa: string;
  inspector_nombre: string;
  inspector_firma: string;
  verificador_nombre: string;
  verificador_firma: string;
  fecha_hora: string;
  client_uuid: string;
}

export interface Inspection extends InspectionPayload {
  id: string;
  user_id: string;
  inspector_email?: string;
  created_at: string;
  status_general: string;
  approval_status?: 'pendiente' | 'aprobada' | 'rechazada';
  approval_note?: string;
  approved_by_name?: string;
  approved_at?: string;
  _pending?: boolean;
}

interface InspectionContextValue {
  inspections: Inspection[];
  allInspections: Inspection[];
  pendingCount: number;
  isOnline: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  refreshAll: () => Promise<void>;
  saveInspection: (payload: InspectionPayload) => Promise<Inspection>;
  getById: (id: string) => Inspection | undefined;
  syncQueue: () => Promise<void>;
  approveInspection: (id: string, note: string) => Promise<void>;
  rejectInspection: (id: string, note: string) => Promise<void>;
  exportCsvUrl: (mode: 'summary' | 'detailed', scope: 'mine' | 'all') => string;
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

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected);
    });
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
      if (cached) {
        try { setInspections(JSON.parse(cached)); } catch {}
      }
      const queue = await getQueue();
      setPendingCount(queue.length);
      await refresh();
      if (user?.role === 'supervisor') await refreshAll();
    })();
  }, [token, user?.role]);

  useEffect(() => {
    if (isOnline && token && pendingCount > 0) syncQueue();
  }, [isOnline, token]);

  // Periodic Refresh for better device-to-device communication
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      refresh();
      if (user?.role === 'supervisor') refreshAll();
    }, 60000); // Every 60 seconds
    return () => clearInterval(interval);
  }, [token, user?.role, refresh, refreshAll]);

  const getQueue = async (): Promise<InspectionPayload[]> => {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  };

  const setQueue = async (q: InspectionPayload[]) => {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    setPendingCount(q.length);
  };

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiCall<Inspection[]>('/inspections', { token });
      setInspections((prev) => {
        const pending = prev.filter((p) => p._pending);
        const merged = [...pending, ...data];
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(merged));
        return merged;
      });
    } catch {} finally { setLoading(false); }
  }, [token]);

  const refreshAll = useCallback(async () => {
    if (!token || user?.role !== 'supervisor') return;
    try {
      const data = await apiCall<Inspection[]>('/inspections?scope=all', { token });
      setAllInspections(data);
    } catch {}
  }, [token, user?.role]);

  const syncQueue = useCallback(async () => {
    if (!token) return;
    const queue = await getQueue();
    if (queue.length === 0) return;
    const remaining: InspectionPayload[] = [];
    for (const item of queue) {
      try {
        await apiCall('/inspections', { method: 'POST', body: item, token });
      } catch { remaining.push(item); }
    }
    await setQueue(remaining);
    await refresh();
  }, [token, refresh]);

  const saveInspection = useCallback(async (payload: InspectionPayload): Promise<Inspection> => {
    const full: InspectionPayload = {
      ...payload,
      client_uuid: payload.client_uuid || uuid(),
      fecha_hora: payload.fecha_hora || new Date().toISOString(),
    };
    if (!token || !user) throw new Error('No autenticado');

    if (isOnline) {
      try {
        const created = await apiCall<Inspection>('/inspections', { method: 'POST', body: full, token });
        await refresh();
        return created;
      } catch {}
    }
    const queue = await getQueue();
    queue.push(full);
    await setQueue(queue);
    const pending: Inspection = {
      ...full, id: full.client_uuid, user_id: user.id,
      created_at: new Date().toISOString(),
      status_general: full.points.some((p) => p.estado === 'malo') ? 'malo' : 'bueno',
      approval_status: 'pendiente',
      _pending: true,
    };
    setInspections((prev) => {
      const updated = [pending, ...prev];
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(updated));
      return updated;
    });
    return pending;
  }, [token, user, isOnline, refresh]);

  const getById = useCallback(
    (id: string) => {
      const local = inspections.find((i) => i.id === id);
      if (local) return local;
      return allInspections.find((i) => i.id === id);
    },
    [inspections, allInspections]
  );

  const approveInspection = useCallback(async (id: string, note: string) => {
    if (!token) return;
    await apiCall(`/inspections/${id}/approve`, { method: 'POST', body: { note }, token });
    await Promise.all([refresh(), refreshAll()]);
  }, [token, refresh, refreshAll]);

  const rejectInspection = useCallback(async (id: string, note: string) => {
    if (!token) return;
    await apiCall(`/inspections/${id}/reject`, { method: 'POST', body: { note }, token });
    await Promise.all([refresh(), refreshAll()]);
  }, [token, refresh, refreshAll]);

  const exportCsvUrl = useCallback((mode: 'summary' | 'detailed', scope: 'mine' | 'all') => {
    return `${API_BASE}/inspections/export?mode=${mode}&scope=${scope}`;
  }, []);

  return (
    <InspectionContext.Provider
      value={{
        inspections, allInspections, pendingCount, isOnline, loading,
        refresh, refreshAll, saveInspection, getById, syncQueue,
        approveInspection, rejectInspection, exportCsvUrl,
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
