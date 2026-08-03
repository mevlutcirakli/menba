// AI Studio web surumunun tasarim dili. Ekranlar sirayla buna tasiniyor;
// tasima bitince asagidaki eski `colors` objesi silinecek.
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

export const uiType = {
    pageTitle: { fontSize: 26, fontWeight: '800' as const },
    cardTitle: { fontSize: 17, fontWeight: '700' as const },
    statLabel: {
        fontSize: 11,
        fontWeight: '700' as const,
        letterSpacing: 0.8,
    },
    statValue: { fontSize: 28, fontWeight: '800' as const },
    body: { fontSize: 14, lineHeight: 20 },
    small: { fontSize: 12 },
};

export const colors = {
    primary: '#0f766e',
    primaryLight: '#0ea5a5',
    primarySurface: '#ecfeff',
    background: '#f4f7fb',
    surface: '#ffffff',
    border: '#dbe4f0',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#64748b',
    success: '#16a34a',
    successSurface: '#f0fdf4',
    error: '#b91c1c',
    errorSurface: '#fef2f2',
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

export const typography = {
    title: { fontSize: 26, fontWeight: '700' as const },
    heading: { fontSize: 16, fontWeight: '700' as const },
    body: { fontSize: 15, lineHeight: 22 },
    caption: { fontSize: 12, fontWeight: '700' as const },
};
