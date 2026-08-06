import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://nltfincxdlnunihvwlob.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sdGZpbmN4ZGxudW5paHZ3bG9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMzM4MjAsImV4cCI6MjEwMTYwOTgyMH0.VGI02LRMljpmA6P6XYA44USytFCMnqo-sPkGGvTnFbY';

const isBrowser = typeof window !== 'undefined';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isBrowser ? AsyncStorage : undefined,
    autoRefreshToken: isBrowser,
    persistSession: isBrowser,
    detectSessionInUrl: isBrowser,
  },
});
