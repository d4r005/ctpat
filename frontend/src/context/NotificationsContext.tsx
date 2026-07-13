import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { apiCall } from '../api/client';
import { useAuth } from './AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';
const NOTIF_DEDUP_WINDOW_MS = 60_000; // 1 minuto — no re-mostrar la misma notif en este período

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── BACKGROUND TASK (top-level, fuera de componentes) ─────────────────────
// IMPORTANTE: el task debe definirse en el scope global (top level del módulo),
// nunca dentro de un componente o función. De lo contrario TaskManager no lo
// reconoce y el background fetch falla silenciosamente.
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async () => {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return BackgroundFetch.BackgroundFetchResult.NoData;

    const res = await fetch('https://d4r005-sriuc.hf.space/api/notifications?limit=5', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return BackgroundFetch.BackgroundFetchResult.Failed;
    const data = await res.json();
    if (!data || data.length === 0) return BackgroundFetch.BackgroundFetchResult.NoData;

    const lastNotifId = await AsyncStorage.getItem('last_notif_id');
    const lastNotifTs = await AsyncStorage.getItem('last_notif_ts');
    const now = Date.now();
    const lastTs = lastNotifTs ? parseInt(lastNotifTs) : 0;

    // Buscar la primera notificación no leída que NO haya sido mostrada recientemente
    const newest = data.find((n: any) => !n.read && n.id !== lastNotifId);
    if (!newest) return BackgroundFetch.BackgroundFetchResult.NoData;

    // Evitar duplicados con ventana de deduplicación
    if (newest.id === lastNotifId && now - lastTs < NOTIF_DEDUP_WINDOW_MS) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const isUrgent = newest.urgent || newest.kind === 'falla' || newest.kind === 'mention';
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${isUrgent ? '🔴' : '📋'} ${newest.title}`,
        body: newest.message,
        data: { inspection_id: newest.inspection_id, record_id: newest.record_id, chat_room: newest.chat_room },
        sound: 'default',
      },
      trigger: null,
    });

    await AsyncStorage.setItem('last_notif_id', newest.id);
    await AsyncStorage.setItem('last_notif_ts', String(now));
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('[BGTask] Error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  inspection_id?: string;
  record_id?: string;
  ticket_id?: string;
  chat_room?: string;
  kind?: string;
  urgent?: boolean;
  read: boolean;
  created_at: string;
}

interface NotificationsContextValue {
  notifications: Notification[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Refs para deduplicación — usamos ref (no estado) para evitar re-renders innecesarios
  const lastShownIdRef = useRef<string | null>(null);
  const lastShownTsRef = useRef<number>(0);
  // Flag para saber si es la primera carga (al abrir la app no disparar alerta)
  const isFirstLoadRef = useRef<boolean>(true);

  // ── Disparar alerta local (vibración + notif) ───────────────────────────
  const triggerLocalAlert = useCallback(async (notif: Notification) => {
    const now = Date.now();

    // Deduplicar: no mostrar la misma notif más de una vez en NOTIF_DEDUP_WINDOW_MS
    if (
      notif.id === lastShownIdRef.current &&
      now - lastShownTsRef.current < NOTIF_DEDUP_WINDOW_MS
    ) {
      return;
    }

    lastShownIdRef.current = notif.id;
    lastShownTsRef.current = now;

    // Persistir en AsyncStorage para que el background task no la repita
    await AsyncStorage.setItem('last_notif_id', notif.id);
    await AsyncStorage.setItem('last_notif_ts', String(now));

    const isUrgent = notif.urgent || notif.kind === 'mention' || notif.kind === 'falla';
    if (Platform.OS !== 'web') {
      Vibration.vibrate(isUrgent ? [0, 400, 150, 400, 150, 400] : [0, 300, 200, 300]);
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${isUrgent ? '🔴' : '📋'} ${notif.title}`,
        body: notif.message,
        data: { inspection_id: notif.inspection_id, record_id: notif.record_id, chat_room: notif.chat_room },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: null,
    });
  }, []);

  // ── Refresh: obtener notificaciones del servidor ────────────────────────
  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiCall<Notification[]>('/notifications', { token });
      if (!data || !Array.isArray(data)) return;

      setNotifications(data);

      // Solo disparar alerta si NO es la primera carga (al abrir la app)
      // y existe una notif nueva no leída
      if (!isFirstLoadRef.current && data.length > 0) {
        const newest = data.find(n => !n.read);
        if (newest && newest.id !== lastShownIdRef.current) {
          await triggerLocalAlert(newest);
        }
      }

      // Marcar que ya pasó la primera carga
      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
        // En la primera carga, solo actualizar el lastShownId sin disparar alerta
        const newestUnread = data.find(n => !n.read);
        if (newestUnread) {
          lastShownIdRef.current = newestUnread.id;
        }
      }
    } catch (e) {
      console.warn('[Notifications] refresh error:', e);
    }
  }, [token, triggerLocalAlert]);

  // ── Registrar push token ────────────────────────────────────────────────
  const registerPushToken = useCallback(async () => {
    if (!token || Platform.OS === 'web') return;
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      const expoToken = (await Notifications.getExpoPushTokenAsync()).data;
      await apiCall('/users/push-token', { method: 'POST', body: { token: expoToken }, token });
    } catch (err) {
      console.warn('[Notifications] Push token error:', err);
    }
  }, [token]);

  // ── Registrar background fetch ──────────────────────────────────────────
  const registerBackgroundFetch = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
      if (!isRegistered) {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK, {
          minimumInterval: 60 * 15, // 15 min mínimo en Android
          stopOnTerminate: false,
          startOnBoot: true,
        });
        console.log('[BGTask] Registrado correctamente');
      }
    } catch (err) {
      console.warn('[BGTask] Error al registrar:', err);
    }
  }, []);

  // ── Setup canal Android ─────────────────────────────────────────────────
  const setupAndroidChannel = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'NAF Notificaciones',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    } catch (e) {
      console.warn('[Notifications] Canal Android:', e);
    }
  }, []);

  // ── Efecto principal: solo se ejecuta cuando cambia el token ────────────
  useEffect(() => {
    if (!token) {
      setNotifications([]);
      lastShownIdRef.current = null;
      isFirstLoadRef.current = true;
      return;
    }

    // Resetear flag de primera carga al hacer login
    isFirstLoadRef.current = true;

    setupAndroidChannel();
    registerPushToken();
    registerBackgroundFetch();

    // Primera carga inmediata
    refresh();

    // Polling cada 10s (era 5s, reducido para menos carga y menos duplicados)
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const markRead = async (id: string) => {
    if (!token) return;
    try {
      await apiCall(`/notifications/${id}/read`, { method: 'POST', token });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {}
  };

  const markAllRead = async () => {
    if (!token) return;
    try {
      await apiCall('/notifications/read-all', { method: 'POST', token });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, refresh, markRead, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications debe usarse dentro de NotificationsProvider');
  return ctx;
}
