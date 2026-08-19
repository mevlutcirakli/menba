/**
 * Supabase / PostgREST / Gemini hatalari Ingilizce ve teknik geliyor
 * ("TypeError: Network request failed", "JWT expired", "new row violates
 * row-level security policy..."). Arayuzun geri kalani Turkce oldugu icin bu
 * metinler dogrudan ekrana basilmamali.
 *
 * Eslesmeyen durumlarda ham mesaji YUTMUYORUZ: genel bir Turkce cumlenin
 * ardina parantez icinde ekliyoruz. Kullanici ne yapacagini anlar, hata
 * bildirimi gelirse de sebebi kaybolmaz.
 */

/** Bir Supabase hatasinin ekranda gosterilecek Turkce karsiligi. */
export function localizeError(input: unknown, fallback = 'Bir sorun oluştu.'): string {
    const raw = extractMessage(input);
    if (!raw) {
        return fallback;
    }

    const normalized = raw.toLowerCase();

    // --- Baglanti ---
    if (
        normalized.includes('network request failed') ||
        normalized.includes('failed to fetch') ||
        normalized.includes('networkerror') ||
        normalized.includes('econnrefused') ||
        normalized.includes('enotfound')
    ) {
        return 'İnternet bağlantısı kurulamadı. Bağlantını kontrol edip tekrar dene.';
    }

    if (normalized.includes('timeout') || normalized.includes('timed out') || normalized.includes('aborted')) {
        return 'İşlem zaman aşımına uğradı. Lütfen tekrar dene.';
    }

    // --- Oturum ---
    if (
        normalized.includes('jwt expired') ||
        normalized.includes('token is expired') ||
        normalized.includes('invalid claim') ||
        normalized.includes('refresh_token_not_found') ||
        normalized.includes('invalid refresh token')
    ) {
        return 'Oturumunun süresi doldu. Lütfen tekrar giriş yap.';
    }

    if (normalized.includes('not authenticated') || normalized.includes('auth session missing')) {
        return 'Oturum bulunamadı. Lütfen tekrar giriş yap.';
    }

    // --- Yetki / RLS ---
    if (
        normalized.includes('row-level security') ||
        normalized.includes('permission denied') ||
        normalized.includes('insufficient privilege')
    ) {
        return 'Bu kayda erişim iznin yok.';
    }

    // --- Auth formu ---
    if (normalized.includes('invalid login credentials')) {
        return 'E-posta veya şifre hatalı. Lütfen tekrar dene.';
    }
    if (normalized.includes('email not confirmed')) {
        return 'E-posta adresin henüz doğrulanmamış. Gelen kutunu kontrol et.';
    }
    if (normalized.includes('user already registered')) {
        return 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.';
    }
    if (normalized.includes('password should be at least')) {
        return 'Şifre en az 6 karakter olmalı.';
    }
    if (normalized.includes('new password should be different')) {
        return 'Yeni şifren eskisinden farklı olmalı.';
    }
    if (
        normalized.includes('unable to validate email address') ||
        normalized.includes('invalid email')
    ) {
        return 'Geçerli bir e-posta adresi gir.';
    }
    if (
        normalized.includes('email rate limit') ||
        normalized.includes('for security purposes') ||
        normalized.includes('too many requests') ||
        normalized.includes('rate limit')
    ) {
        return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.';
    }

    // --- Yapilandirma ---
    if (normalized.includes('placeholder.supabase.co')) {
        return 'Uygulama sunucu ayarları eksik. Yöneticine bildir.';
    }

    // Eslesmedi: genel cumle + ham sebep.
    return `${fallback} (${raw})`;
}

/** Hata benzeri her seyden okunabilir bir metin cikarir. */
function extractMessage(input: unknown): string {
    if (!input) {
        return '';
    }

    if (typeof input === 'string') {
        return input.trim();
    }

    if (input instanceof Error) {
        return input.message.trim();
    }

    if (typeof input === 'object' && 'message' in input) {
        const message = (input as { message?: unknown }).message;
        if (typeof message === 'string') {
            return message.trim();
        }
    }

    return '';
}
