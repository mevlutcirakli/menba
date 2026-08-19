import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { hasSupabaseEnv, supabase, supabaseEnvErrorMessage } from '../services/supabase';

interface AuthState {
    session: Session | null;
    isLoading: boolean;
}

/**
 * Oturum durumu modul seviyesinde tek bir yerde tutuluyor.
 *
 * Onceden her `useAuth()` cagrisi kendi `getSession()` istegini atip kendi
 * `onAuthStateChange` aboneligini aciyordu; hook uc ayri ekranda kullanildigi
 * icin uygulama her acilista ucer kopya is yapiyordu. Store tek abonelik
 * kurup sonucu tum tuketicilere dagitiyor.
 */
let state: AuthState = { session: null, isLoading: true };
const listeners = new Set<() => void>();
let initialized = false;

function setState(next: AuthState) {
    // Referans esitligi korunursa useSyncExternalStore gereksiz render etmez.
    if (state.session === next.session && state.isLoading === next.isLoading) {
        return;
    }

    state = next;
    for (const listener of listeners) {
        listener();
    }
}

function initialize() {
    if (initialized) {
        return;
    }
    initialized = true;

    if (!hasSupabaseEnv) {
        console.error(supabaseEnvErrorMessage);
        setState({ session: null, isLoading: false });
        return;
    }

    supabase.auth
        .getSession()
        .then(({ data, error }) => {
            setState({
                session: error ? null : (data.session ?? null),
                isLoading: false,
            });
        })
        .catch(() => {
            setState({ session: null, isLoading: false });
        });

    supabase.auth.onAuthStateChange((_event, nextSession) => {
        setState({ session: nextSession, isLoading: false });
    });
}

function subscribe(listener: () => void): () => void {
    initialize();
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function getSnapshot(): AuthState {
    return state;
}

export function useAuth() {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    return {
        session: snapshot.session,
        isLoading: snapshot.isLoading,
        /**
         * Supabase adresi/anahtari derlemeye girmemisse true. Bu durumda hicbir
         * istek calismaz; ekranlar sessizce "bir sorun olustu" demek yerine
         * yapilandirma uyarisi gostermeli (bkz. app/_layout.tsx).
         */
        isMisconfigured: !hasSupabaseEnv,
    };
}
