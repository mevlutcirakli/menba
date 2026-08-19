/**
 * Tarayici istemcileri (expo start --web) icin CORS.
 *
 * Native istemci preflight yapmadigi icin bu eksiklik uzun sure fark
 * edilmedi; webde ise tum Edge Function cagrilari preflight asamasinda
 * patliyordu. Fonksiyonlar zaten JWT dogruluyor, izin kontrolu RLS'te; bu
 * yuzden origin serbest birakilabiliyor.
 */
export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

export const jsonHeaders = {
    ...corsHeaders,
    'Content-Type': 'application/json',
} as const;

/** Preflight istegiyse hazir yaniti dondurur, degilse null. */
export function handlePreflight(req: Request): Response | null {
    if (req.method !== 'OPTIONS') {
        return null;
    }

    return new Response('ok', { headers: corsHeaders });
}
