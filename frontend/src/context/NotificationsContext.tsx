import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { supabase } from '../api/supabase';
import { apiCall } from '../api/client';
import { useAuth } from './AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';
const NOTIF_DEDUP_WINDOW_MS = 60_000; // 1 minute — don't re-show the same notification in this period

// Configure notification behavior
if (Platform.OS !== 'web' || typeof window !== 'undefined') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// ─── BACKGROUND TASK ───────────────────────────────────────────────────────
if (Platform.OS !== 'web' || typeof window !== 'undefined') {
  try {
    TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return BackgroundFetch.BackgroundFetchResult.NoData;

        // Background fetch still works by polling the database via Supabase REST API
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .or(`user_id.eq.${session.user.id},user_id.is.null`)
          .order('created_at', { ascending: false })
          .limit(5);

        if (error || !data || data.length === 0) return BackgroundFetch.BackgroundFetchResult.NoData;

        const lastNotifId = await AsyncStorage.getItem('last_notif_id');
        const lastNotifTs = await AsyncStorage.getItem('last_notif_ts');
        const now = Date.now();
        const lastTs = lastNotifTs ? parseInt(lastNotifTs) : 0;

        // Find the first unread notification that hasn't been shown recently
        const newest = data.find((n: any) => !n.read && n.id !== lastNotifId);
        if (!newest) return BackgroundFetch.BackgroundFetchResult.NoData;

        // Avoid duplicates with deduplication window
        if (newest.id === lastNotifId && now - lastTs < NOTIF_DEDUP_WINDOW_MS) {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        const metadata = newest.metadata || {};
        const isUrgent = metadata.urgent || newest.kind === 'falla' || newest.kind === 'mention';

        await Notifications.scheduleNotificationAsync({
          content: {
            title: `${isUrgent ? '🔴' : '📋'} ${newest.title}`,
            body: newest.message,
            data: metadata,
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
  } catch (e) {
    console.warn('[Notifications] TaskManager error:', e);
  }
}

export interface Notification {
  id: string;
  user_id: string | null;
  title: string;
  message: string;
  read: boolean;
  kind: string | null;
  metadata: any;
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
  const { user, token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Refs for deduplication
  const lastShownIdRef = useRef<string | null>(null);
  const lastShownTsRef = useRef<number>(0);
  // Flag for first load (don't trigger alert when opening the app)
  const isFirstLoadRef = useRef<boolean>(true);
  // Lock to avoid race conditions
  const isRefreshingRef = useRef<boolean>(false);

  // ── Trigger local alert (vibration + notification) ───────────────────────
  const triggerLocalAlert = useCallback(async (notif: Notification) => {
    const now = Date.now();

    // Deduplicate
    if (
      notif.id === lastShownIdRef.current &&
      now - lastShownTsRef.current < NOTIF_DEDUP_WINDOW_MS
    ) {
      return;
    }

    lastShownIdRef.current = notif.id;
    lastShownTsRef.current = now;

    // Persist to AsyncStorage for background task
    await AsyncStorage.setItem('last_notif_id', notif.id);
    await AsyncStorage.setItem('last_notif_ts', String(now));

    const metadata = notif.metadata || {};
    const isUrgent = metadata.urgent || notif.kind === 'mention' || notif.kind === 'falla';

    if (Platform.OS !== 'web') {
      Vibration.vibrate(isUrgent ? [0, 400, 150, 400, 150, 400] : [0, 300, 200, 300]);
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${isUrgent ? '🔴' : '📋'} ${notif.title}`,
        body: notif.message,
        data: metadata,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: null,
    });
  }, []);

  // ── Refresh: get notifications from Supabase ────────────────────────────
  const refresh = useCallback(async () => {
    if (!user) return;
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data) return;

      setNotifications(data);

      // Only trigger alert if not first load and there's a new unread notification
      if (!isFirstLoadRef.current && data.length > 0) {
        const newest = data.find(n => !n.read);
        if (newest && newest.id !== lastShownIdRef.current) {
          await triggerLocalAlert(newest);
        }
      }

      // Mark first load passed
      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
        const newestUnread = data.find(n => !n.read);
        if (newestUnread) {
          lastShownIdRef.current = newestUnread.id;
        }
      }
    } catch (e) {
      console.warn('[Notifications] refresh error:', e);
    } finally {
      isRefreshingRef.current = false;
    }
  }, [user, triggerLocalAlert]);

  // ── Register push token ──────────────────────────────────────────────────
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

      const expoToken = (await Notifications.getExpoPushTokenAsync({
        projectId: 'north-america-flooring/sriuc',
      })).data;

      // Save token to Supabase (profiles table)
      if (user?.id) {
        await supabase
          .from('profiles')
          .update({ push_token: expoToken })
          .eq('id', user.id);
      }
    } catch (err) {
      console.warn('[Notifications] Push token error:', err);
    }
  }, [user]);

  // ── Register background fetch ────────────────────────────────────────────
  const registerBackgroundFetch = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
      if (!isRegistered) {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK, {
          minimumInterval: 60 * 15,
          stopOnTerminate: false,
          startOnBoot: true,
        });
      }
    } catch (err) {
      console.warn('[BGTask] Error registering:', err);
    }
  }, []);

  // ── Setup Android channel ────────────────────────────────────────────────
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
      console.warn('[Notifications] Android Channel Error:', e);
    }
  }, []);

  // ── Main Effect: Realtime Subscription ───────────────────────────────────
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      lastShownIdRef.current = null;
      isFirstLoadRef.current = true;
      return;
    }

    isFirstLoadRef.current = true;
    setupAndroidChannel();
    registerPushToken();
    registerBackgroundFetch();
    refresh();

    // Supabase Realtime Subscription to 'notifications' table
    // Filtering is handled by RLS (only rows allowed by auth.uid() or global ones)
    const channel = supabase
      .channel('notifications_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const newNotif = payload.new as Notification;
          // Security check: although RLS handles this, we verify user_id
          if (newNotif.user_id === user.id || !newNotif.user_id) {
            setNotifications(prev => [newNotif, ...prev]);
            triggerLocalAlert(newNotif);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications' },
        (payload) => {
          const updated = payload.new as Notification;
          if (updated.user_id === user.id || !updated.user_id) {
            setNotifications(prev => prev.map(n => n.id === updated.id ? updated : n));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications' },
        (payload) => {
          setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, setupAndroidChannel, registerPushToken, registerBackgroundFetch, refresh, triggerLocalAlert]);

  const markRead = async (id: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);
      if (error) throw error;
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (e) {
      console.warn('[Notifications] markRead error:', e);
    }
  };

  const markAllRead = async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);
      if (error) throw error;
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) {
      console.warn('[Notifications] markAllRead error:', e);
    }
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

