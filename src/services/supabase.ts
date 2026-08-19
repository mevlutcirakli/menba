import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import type { Database } from '../types/database.types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseEnv = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const supabaseEnvErrorMessage =
    'Supabase env degiskenleri eksik. EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY degerlerini tanimlayin. Build alirken bu degiskenleri EAS ortamina da ekleyin (bkz. README).';

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
            // Native'de URL'de oturum aranmaz; e-posta dogrulama / sifre
            // sifirlama baglantilari app/_layout.tsx icindeki deep link
            // isleyicisi tarafindan elle cozuluyor.
            detectSessionInUrl: false,
            storage: AsyncStorage,
        },
    }
);

// autoRefreshToken yalnizca JS zamanlayicisi calisiyorken is goruyor.
// Uygulama arka plana alininca bu zamanlayici duruyor; on plana donunce
// yeniden baslatilmazsa token sessizce eskiyor ve sorgular 401 donuyor.
// Supabase'in React Native icin onerdigi kalip bu.
if (hasSupabaseEnv) {
    AppState.addEventListener('change', (state) => {
        if (state === 'active') {
            void supabase.auth.startAutoRefresh();
        } else {
            void supabase.auth.stopAutoRefresh();
        }
    });
}
