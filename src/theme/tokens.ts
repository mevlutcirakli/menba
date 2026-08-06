// Figma tasarim sistemi (2026-08). Onceki indigo/navy paleti kaldirildi;
// marka rengi koyu teal. Eski anahtarlar (indigo600, navy900, emerald500...)
// asagida yeni degerlere isaret eden takma adlar olarak duruyor, boylece
// heniz elden gecmemis ekranlar da dogru renkleri aliyor.
const teal = {
    900: '#0B3A34',
    800: '#0F5C52',
    700: '#12766A',
    600: '#179B8A',
    200: '#BBDDD7',
    100: '#D8EAE6',
    50: '#EDF5F3',
} as const;

export const palette = {
    // --- Marka olcegi ---
    teal900: teal[900],
    teal800: teal[800],
    teal700: teal[700],
    teal600: teal[600],
    teal200: teal[200],
    teal100: teal[100],
    teal50: teal[50],

    /** Birincil buton / aktif sekme zemini. */
    primary: teal[800],
    /** Ilerleme dolgusu, halka, ikon vurgusu. */
    accent: teal[700],
    /** Acik marka yuzeyi (rozet, dropzone, aciklama kutusu). */
    primarySurface: teal[50],
    primaryBorder: teal[100],

    // --- Durum renkleri ---
    success: '#12866F',
    successSurface: '#E9F6F1',
    successBorder: '#9FD6C6',
    danger: '#E5484D',
    dangerSurface: '#FEF1F1',
    dangerBorder: '#F3B6B8',

    // --- Notr olcek ---
    pageBg: '#F8FBFA',
    cardBg: '#FFFFFF',
    cardBorder: '#E4EDEB',
    /** Ic kutular (soru govdesi, secili olmayan alanlar). */
    subtleBg: '#F1F6F5',
    textPrimary: '#123330',
    textSecondary: '#52706B',
    textMuted: '#8AA09B',
    onDarkPrimary: '#FFFFFF',
    onDarkMuted: '#B9D2CD',

    /** Avatar / dekoratif dolgular. */
    avatarPeach: '#F3D2AC',
    /** Modal arkasindaki karartma. */
    scrim: 'rgba(11, 58, 52, 0.45)',

    // --- Eski anahtarlar (geriye donuk uyumluluk) ---
    navy900: teal[900],
    navy800: teal[800],
    navy700: teal[700],
    indigo600: teal[700],
    indigo500: teal[600],
    indigo300: teal[200],
    indigoSurface: teal[50],
    indigoBorder: teal[100],
    emerald500: '#12866F',
    emeraldSurface: '#E9F6F1',
    amber500: '#C98A2E',
    amber600: '#A9711F',
    amberSurface: '#FBF3E7',
    error: '#E5484D',
} as const;

export const gradients = {
    brand: [teal[700], teal[800]] as const,
    hero: [teal[800], teal[900]] as const,
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
    /** Ekran basligi: "Kaynaklarim", "Merhaba, Elif". */
    pageTitle: { fontSize: 28, fontWeight: '800' as const, fontFamily: fontFamily.heading },
    cardTitle: { fontSize: 16, fontWeight: '700' as const, fontFamily: fontFamily.headingSemibold },
    /** Kart ustu kucuk buyuk-harf etiket. */
    statLabel: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.6 },
    /** Buyuk sayi: "847", "%78". */
    statValue: { fontSize: 26, fontWeight: '800' as const, fontFamily: fontFamily.heading },
    /** Bolum basligi: "Son Aktiviteler". */
    sectionTitle: { fontSize: 16, fontWeight: '800' as const, fontFamily: fontFamily.headingSemibold },
    body: { fontSize: 14, lineHeight: 20 },
    small: { fontSize: 12, lineHeight: 17 },
    title: { fontSize: 26, fontWeight: '700' as const, fontFamily: fontFamily.headingSemibold },
    heading: { fontSize: 16, fontWeight: '700' as const, fontFamily: fontFamily.headingSemibold },
    caption: { fontSize: 12, fontWeight: '700' as const },
};

export const radius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    /** Bottom sheet ust koseleri. */
    sheet: 26,
    pill: 999,
};

export const spacing = {
    xs: 4,
    sm: 8,
    md: 14,
    lg: 20,
    xl: 28,
};

// Tasarimda kartlar golgeden cok ince kenarlikla ayriliyor; golge yalnizca
// yuzen yuzeylerde (bottom sheet, tab bar) kullaniliyor.
export const shadow = {
    card: {
        shadowColor: teal[900],
        shadowOpacity: 0.04,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
    raised: {
        shadowColor: teal[900],
        shadowOpacity: 0.12,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: -4 },
        elevation: 12,
    },
};
