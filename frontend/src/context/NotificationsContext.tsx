import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { apiCall } from '../api/client';
import { useAuth } from './AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';

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

// Task Manager definition (Top level)
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async () => {
  try {
    const token = await AsyncStorage.getItem('userToken'); // Need to ensure token is here
    if (!token) return BackgroundFetch.BackgroundFetchResult.NoData;

    const res = await fetch(`https://d4r005-sriuc.hf.space/api/notifications`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const lastNotifId = await AsyncStorage.getItem('last_notif_id');

    if (data && data.length > 0) {
      const newest = data[0];
      if (!newest.read && newest.id !== lastNotifId) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `🚨 ${newest.title}`,
            body: newest.message,
            data: { inspection_id: newest.inspection_id },
            sound: true,
          },
          trigger: null,
        });
        await AsyncStorage.setItem('last_notif_id', newest.id);
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
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
  const lastIdRef = useRef<string | null>(null);

  const triggerLocalAlert = useCallback(async (notif: Notification) => {
    // Las menciones directas en chat (@nombre) y fallas usan un patrón de vibración
    // mas largo/insistente para que se note que requiere atención inmediata.
    const isUrgent = notif.urgent || notif.kind === 'mention' || notif.kind === 'falla';
    Vibration.vibrate(isUrgent ? [0, 400, 150, 400, 150, 400] : [0, 500, 200, 500]);

    // 2. Sound & Visual Alert via Expo Notifications
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${isUrgent ? '🔴' : '🚨'} ${notif.title}`,
        body: notif.message,
        data: {
          inspection_id: notif.inspection_id,
          record_id: notif.record_id,
          chat_room: notif.chat_room,
        },
        sound: true, // Uses default system sound
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: null, // show immediately
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiCall<Notification[]>('/notifications', { token });

      // Check for new unread notifications to alert
      if (data.length > 0) {
        const newest = data[0];
        if (!newest.read && newest.id !== lastIdRef.current) {
          triggerLocalAlert(newest);
          lastIdRef.current = newest.id;
        }
      }

      setNotifications(data);
    } catch {}
  }, [token, triggerLocalAlert]);

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
      console.log('Push Token registrado:', expoToken);
    } catch (err) {
      console.error('Error registrando Push Token:', err);
    }
  }, [token]);

  const registerBackgroundFetch = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
      if (!isRegistered) {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK, {
          minimumInterval: 60 * 15, // 15 minutes (OS minimum)
          stopOnTerminate: false,
          startOnBoot: true,
        });
      }
    } catch (err) {
      console.error("Error registering background fetch:", err);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setNotifications([]);
      lastIdRef.current = null;
      return;
    }

    refresh();
    registerPushToken();
    registerBackgroundFetch();

    // Request permissions for local alerts if not already granted
    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        await Notifications.requestPermissionsAsync();
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
    })();

    const t = setInterval(refresh, 15000); // Polling every 15s for faster response
    return () => clearInterval(t);
  }, [token, refresh]);

  const markRead = async (id: string) => {
    if (!token) return;
    try {
      await apiCall(`/notifications/${id}/read`, { method: 'POST', token });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch {}
  };

  const markAllRead = async () => {
    if (!token) return;
    try {
      await apiCall('/notifications/read-all', { method: 'POST', token });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

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
