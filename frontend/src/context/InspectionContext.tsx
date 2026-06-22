import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { apiCall } from '../api/client';
import { useAuth } from './AuthContext';

const QUEUE_KEY = 'naf_inspection_queue';
const CACHE_KEY = 'naf_inspections_cache';

export interface InspectionPoint {
  number: number;
  name: string;
  estado: string; // bueno | malo | na
  comentarios: string;
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
  created_at: string;
  status_general: string;
  _pending?: boolean; // local-only flag for queued
}

interface InspectionContextValue {
  inspections: Inspection[];
  pendingCount: number;
  isOnline: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  saveInspection: (payload: InspectionPayload) => Promise<Inspection>;
  getById: (id: string) => Inspection | undefined;
  syncQueue: () => Promise<void>;
}

const InspectionContext = createContext<InspectionContextValue | undefined>(undefined);

function uuid() {
  // RFC4122 v4-ish
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function InspectionProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(false);

  // Network listener
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected);
    });
    return () => unsub();
  }, []);

  // Load cache on token change
  useEffect(() => {
    if (!token) {
      setInspections([]);
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
    })();
  }, [token]);

  // Auto-sync when online
  useEffect(() => {
    if (isOnline && token && pendingCount > 0) {
      syncQueue();
    }
  }, [isOnline, token]);

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
        // Keep _pending items from prev that haven't synced
        const pending = prev.filter((p) => p._pending);
        const merged = [...pending, ...data];
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(merged));
        return merged;
      });
    } catch (e) {
      // offline ok
    } finally {
      setLoading(false);
    }
  }, [token]);

  const syncQueue = useCallback(async () => {
    if (!token) return;
    const queue = await getQueue();
    if (queue.length === 0) return;
    const remaining: InspectionPayload[] = [];
    for (const item of queue) {
      try {
        await apiCall('/inspections', { method: 'POST', body: item, token });
      } catch (e) {
        remaining.push(item);
      }
    }
    await setQueue(remaining);
    await refresh();
  }, [token, refresh]);

  const saveInspection = useCallback(async (payload: InspectionPayload): Promise<Inspection> => {
    const fullPayload: InspectionPayload = {
      ...payload,
      client_uuid: payload.client_uuid || uuid(),
      fecha_hora: payload.fecha_hora || new Date().toISOString(),
    };

    if (!token || !user) throw new Error('No autenticado');

    if (isOnline) {
      try {
        const created = await apiCall<Inspection>('/inspections', {
          method: 'POST',
          body: fullPayload,
          token,
        });
        await refresh();
        return created;
      } catch (e) {
        // fallthrough to queue
      }
    }
    // Offline: queue
    const queue = await getQueue();
    queue.push(fullPayload);
    await setQueue(queue);

    const pending: Inspection = {
      ...fullPayload,
      id: fullPayload.client_uuid,
      user_id: user.id,
      created_at: new Date().toISOString(),
      status_general: fullPayload.points.some((p) => p.estado === 'malo') ? 'malo' : 'bueno',
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
    (id: string) => inspections.find((i) => i.id === id),
    [inspections]
  );

  return (
    <InspectionContext.Provider
      value={{ inspections, pendingCount, isOnline, loading, refresh, saveInspection, getById, syncQueue }}
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
