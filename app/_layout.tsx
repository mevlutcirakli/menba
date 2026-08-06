import {
    Manrope_700Bold,
    Manrope_800ExtraBold,
    useFonts,
} from '@expo-google-fonts/manrope';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/hooks/useAuth';
import { palette, radius } from '../src/theme/tokens';

export default function RootLayout() {
    const { session, isLoading } = useAuth();
    const [fontsLoaded] = useFonts({
        Manrope_700Bold,
        Manrope_800ExtraBold,
    });

    // Fontlar hazir olmadan basliklari sistem fontuyla cizip sonra Manrope'a
    // "atlatmamak" icin kisa bir yukleme ekrani bekletiliyor; bu zaten oturum
    // kontrolu icin de gosterilen ekranin ayni.
    if (isLoading || !fontsLoaded) {
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
});
