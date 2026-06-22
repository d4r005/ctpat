import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { apiCall } from '../api/client';
import { useAuth } from './AuthContext';

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

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiCall<Notification[]>('/notifications', { token });
      setNotifications(data);
    } catch {}
  }, [token]);

  useEffect(() => {
    if (!token) { setNotifications([]); return; }
    refresh();
    const t = setInterval(refresh, 30000); // poll every 30s
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
