import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import { apiCall } from '../api/client';
import { useAuth } from './AuthContext';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  inspection_id?: string;
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
    // 1. Vibration
    Vibration.vibrate([0, 500, 200, 500]); // Wait, long pulse, short wait, long pulse

    // 2. Sound & Visual Alert via Expo Notifications
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🚨 ${notif.title}`,
        body: notif.message,
        data: { inspection_id: notif.inspection_id },
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
          // It's a brand new notification
          triggerLocalAlert(newest);
          lastIdRef.current = newest.id;
        }
      }

      setNotifications(data);
    } catch {}
  }, [token, triggerLocalAlert]);

  useEffect(() => {
    if (!token) {
      setNotifications([]);
      lastIdRef.current = null;
      return;
    }

    // Initial fetch
    refresh();

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
