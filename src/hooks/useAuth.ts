import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { hasSupabaseEnv, supabase, supabaseEnvErrorMessage } from '../services/supabase';

export function useAuth() {
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!hasSupabaseEnv) {
            console.error(supabaseEnvErrorMessage);
            setSession(null);
            setIsLoading(false);
            return;
        }

        let isMounted = true;

        supabase.auth
            .getSession()
            .then(({ data, error }) => {
                if (!isMounted) {
                    return;
                }

                if (!error) {
                    setSession(data.session ?? null);
                }

                setIsLoading(false);
            })
            .catch(() => {
                if (!isMounted) {
                    return;
                }

                setSession(null);
                setIsLoading(false);
            });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            setSession(nextSession);
            setIsLoading(false);
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    return {
        session,
        isLoading,
    };
}