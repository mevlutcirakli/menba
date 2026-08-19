import { Ionicons } from '@expo/vector-icons';
import {
    Manrope_700Bold,
    Manrope_800ExtraBold,
    useFonts,
} from '@expo-google-fonts/manrope';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../src/hooks/useAuth';
import { useAuthDeepLink } from '../src/hooks/useAuthDeepLink';
import { palette, radius, spacing, uiType } from '../src/theme/tokens';

/**
 * Fontlar yuklenemezse ne kadar beklenecegi. Font dosyalari pakete gomulu
 * oldugu icin normalde bu sure asilmaz; asilirsa sistem fontuyla devam
 * ediyoruz. Onceden `useFonts`in hata ciktisi hic okunmuyordu ve yukleme
 * basarisiz olursa uygulama acilis ekraninda SONSUZA KADAR takiliyordu.
 */
const FONT_LOAD_TIMEOUT_MS = 4000;

export default function RootLayout() {
    const { session, isLoading, isMisconfigured } = useAuth();
    const [fontsLoaded, fontError] = useFonts({
        Manrope_700Bold,
        Manrope_800ExtraBold,
    });
    const [fontWaitExpired, setFontWaitExpired] = useState(false);

    // E-posta dogrulama / sifre sifirlama baglantilari.
    useAuthDeepLink();

    useEffect(() => {
        if (fontsLoaded || fontError) {
            return;
        }

        const timer = setTimeout(() => setFontWaitExpired(true), FONT_LOAD_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [fontError, fontsLoaded]);

    if (fontError) {
        console.warn('Manrope yuklenemedi, sistem fontuyla devam ediliyor.', fontError);
    }

    // Sunucu adresi/anahtari derlemeye girmemisse hicbir istek calismaz.
    // Kullaniciyi her ekranda "Bir sorun olustu" ile bas basa birakmak yerine
    // durumu bir kez, acikca soyluyoruz.
    if (isMisconfigured) {
        return (
            <View style={styles.stateContainer}>
                <StatusBar style="dark" />
                <View style={styles.stateIcon}>
                    <Ionicons name="warning-outline" size={30} color={palette.danger} />
                </View>
                <Text style={styles.stateTitle}>Uygulama yapılandırılmamış</Text>
                <Text style={styles.stateBody}>
                    Sunucu adresi ve anahtarı bu derlemeye eklenmemiş, bu yüzden giriş
                    yapılamıyor. Uygulamayı sana ileten kişiye bildir.
                </Text>
                <Text style={styles.stateHint}>
                    EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY tanımlı değil.
                </Text>
            </View>
        );
    }

    // Fontlar hazir olmadan basliklari sistem fontuyla cizip sonra Manrope'a
    // "atlatmamak" icin kisa bir yukleme ekrani bekletiliyor; bu zaten oturum
    // kontrolu icin de gosterilen ekranin ayni. Font hata verir ya da sure
    // dolarsa beklemeden devam ediliyor.
    const fontsSettled = fontsLoaded || Boolean(fontError) || fontWaitExpired;

    if (isLoading || !fontsSettled) {
        return (
            <View style={styles.loadingContainer}>
                {/* Acilis ekrani acik zeminli; koyu ikon dogru secim. */}
                <StatusBar style="dark" />
                <ActivityIndicator size="large" color={palette.primary} />
            </View>
        );
    }

    // Stack.Protected, guard false'a donunce aktif ekrandan otomatik olarak
    // stack'teki ilk uygun ekrana yonlendirir. Cikis yapildiginda kullaniciyi
    // sign-in'e tasiyan mekanizma budur; elle Redirect gerekmiyor.
    return (
        <>
            {/* Tum ekranlar acik zeminli, dolayisiyla durum cubugu ikonlari
                her yerde koyu. Ekranlar ayrica kendi StatusBar'ini
                cizmeye devam ediyor: expo-status-bar prop'lari mount
                sirasina gore birlestiriyor, en son mount edilen kazaniyor. */}
            <StatusBar style="dark" />

            <Stack>
                <Stack.Protected guard={Boolean(session)}>
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    {/* Tasarimda alttan acilan sayfa. Android'de formSheet ile
                        native baslik desteklenmiyor, zaten baslik sheet'in
                        icinde yaziyor. Tutamak elle ciziliyor:
                        sheetGrabberVisible yalnizca iOS'ta etkili. */}
                    <Stack.Screen
                        name="add-source"
                        options={{
                            headerShown: false,
                            presentation: 'formSheet',
                            sheetAllowedDetents: [0.72, 0.96],
                            sheetInitialDetentIndex: 0,
                            sheetCornerRadius: radius.sheet,
                            sheetGrabberVisible: false,
                        }}
                    />
                    {/* Bu ekran kendi basligini cizmiyor: geri butonu icin
                        native baslik duruyor, yalnizca renkleri yeni paletle
                        eslestirildi. */}
                    <Stack.Screen
                        name="quiz/[sourceId]"
                        options={{
                            title: 'Konu Yönetimi',
                            headerStyle: { backgroundColor: palette.pageBg },
                            headerTintColor: palette.textPrimary,
                            headerTitleStyle: { fontWeight: '700' },
                            headerShadowVisible: false,
                        }}
                    />
                    {/* Soru akisi kendi ust barini (konu adi, ilerleme, kapat)
                        ciziyor; native baslik ikinci bir bar olurdu. */}
                    <Stack.Screen
                        name="quiz/[sourceId]/play"
                        options={{ headerShown: false }}
                    />
                    {/* Sifre sifirlama baglantisi oturum acar ve buraya
                        yonlendirir; kullanici yeni sifresini burada belirler. */}
                    <Stack.Screen
                        name="reset-password"
                        options={{
                            title: 'Yeni Şifre',
                            headerStyle: { backgroundColor: palette.pageBg },
                            headerTintColor: palette.textPrimary,
                            headerTitleStyle: { fontWeight: '700' },
                            headerShadowVisible: false,
                        }}
                    />
                </Stack.Protected>

                <Stack.Protected guard={!session}>
                    <Stack.Screen name="sign-in" options={{ headerShown: false }} />
                </Stack.Protected>
            </Stack>
        </>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: palette.pageBg,
    },
    stateContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.xl,
        backgroundColor: palette.pageBg,
    },
    stateIcon: {
        width: 60,
        height: 60,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.dangerSurface,
        marginBottom: spacing.sm,
    },
    stateTitle: {
        ...uiType.sectionTitle,
        color: palette.textPrimary,
        textAlign: 'center',
    },
    stateBody: {
        ...uiType.body,
        color: palette.textSecondary,
        textAlign: 'center',
    },
    stateHint: {
        ...uiType.small,
        color: palette.textMuted,
        textAlign: 'center',
        marginTop: spacing.sm,
    },
});
