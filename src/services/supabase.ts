import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '../types/database.types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseEnv = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const supabaseEnvErrorMessage =
    'Supabase env degiskenleri eksik. EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY degerlerini tanimlayin. Build alirken bu degiskenleri EAS ortamina da ekleyin.';

if (!hasSupabaseEnv) {
    console.error(supabaseEnvErrorMessage);
}

export const supabase = createClient<Database>(
    SUPABASE_URL ?? 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storage: AsyncStorage,
        },
    }
);
