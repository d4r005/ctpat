import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl = 'https://nltfincxdlnunihvwlob.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sdGZpbmN4ZGxudW5paHZ3bG9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMzM4MjAsImV4cCI6MjEwMTYwOTgyMH0.VGI02LRMljpmA6P6XYA44USytFCMnqo-sPkGGvTnFbY';

// SSR-safe: en el build de Node (Cloudflare/Metro) no existe WebSocket nativo
// en Node < 22. Pasamos un transport stub para que createClient no lance error
// durante el render estático; en el navegador se usa el WebSocket real.
const isBrowser = typeof window !== 'undefined' && typeof (window as any).WebSocket !== 'undefined';

class StubWebSocket {
  url: string;
  constructor(url?: string) { this.url = url || ''; }
  close() {}
  send() {}
  addEventListener() {}
  removeEventListener() {}
  set onopen(_: any) {}
  set onclose(_: any) {}
  set onerror(_: any) {}
  set onmessage(_: any) {}
}

const webLocalStorage = {
  getItem: (key: string): Promise<string | null> => {
    try {
      return Promise.resolve(typeof window !== 'undefined' ? window.localStorage.getItem(key) : null);
    } catch {
      return Promise.resolve(null);
    }
  },
  setItem: (key: string, value: string): Promise<void> => {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
    } catch {}
    return Promise.resolve();
  },
  removeItem: (key: string): Promise<void> => {
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(key);
    } catch {}
    return Promise.resolve();
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? webLocalStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isBrowser,
  },
  ...(isBrowser ? {} : { realtime: { transport: StubWebSocket as any } }),
});
