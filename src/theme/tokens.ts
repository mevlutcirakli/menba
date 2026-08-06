// AI Studio web surumunun tasarim dili. Tum ekranlar bu tek sisteme tasindi;
// eski `colors`/`typography` ikilisi kaldirildi (bkz. git tarihi).
export const palette = {
    // Koyu marka yuzeyleri (ust bar, hero kartlar)
    navy900: '#0f172a',
    navy800: '#1e293b',
    navy700: '#334155',

    // Birincil vurgu
    indigo600: '#4f46e5',
    indigo500: '#6366f1',
    indigo300: '#a5b4fc',
    indigoSurface: '#eef2ff',
    indigoBorder: '#c7d2fe',

    // Ikincil vurgular
    emerald500: '#10b981',
    emeraldSurface: '#ecfdf5',
    amber500: '#f59e0b',
    amber600: '#d97706',
    amberSurface: '#fffbeb',

    // Notr olcek
    pageBg: '#f8fafc',
    cardBg: '#ffffff',
    cardBorder: '#e2e8f0',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#94a3b8',
    onDarkPrimary: '#ffffff',
    onDarkMuted: '#94a3b8',

    error: '#b91c1c',
} as const;

export const gradients = {
    // Logo rozeti: indigo -> emerald capraz gecis
    brand: ['#4f46e5', '#6366f1', '#34d399'] as const,
    // Koyu hero kart zemini
    hero: ['#1e1b4b', '#0f172a'] as const,
};

// Baslik/font ailesi: Manrope yuklendiginde bu isimler kullanilabilir hale
// gelir (bkz. app/_layout.tsx useFonts). Yuklenene kadar undefined donup
// sistem fontuna duser, boylece font hazir olmadan render blocklanmaz.
export const fontFamily = {
    heading: 'Manrope_800ExtraBold',
    headingSemibold: 'Manrope_700Bold',
    body: undefined as string | undefined,
};

export const uiType = {
    pageTitle: { fontSize: 26, fontWeight: '800' as const, fontFamily: fontFamily.heading },
    cardTitle: { fontSize: 17, fontWeight: '700' as const, fontFamily: fontFamily.headingSemibold },
    statLabel: {
        fontSize: 11,
        fontWeight: '700' as const,
        letterSpacing: 0.8,
    },
    statValue: { fontSize: 28, fontWeight: '800' as const, fontFamily: fontFamily.heading },
    body: { fontSize: 14, lineHeight: 20 },
    small: { fontSize: 12 },
    // Eski `typography` setinden tasindi (bkz. quiz akisi ekranlari).
    title: { fontSize: 26, fontWeight: '700' as const, fontFamily: fontFamily.headingSemibold },
    heading: { fontSize: 16, fontWeight: '700' as const, fontFamily: fontFamily.headingSemibold },
    caption: { fontSize: 12, fontWeight: '700' as const },
};

export const radius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 18,
    pill: 999,
};

export const spacing = {
    xs: 4,
    sm: 8,
    md: 14,
    lg: 20,
    xl: 28,
};

// Duz kenarlikli kartlara derinlik katmak icin. iOS golge + Android
// elevation ayni obje icinde; kart stiline ...shadow.card seklinde acilir.
export const shadow = {
    card: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
    },
    raised: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.1,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
        elevation: 6,
    },
};
