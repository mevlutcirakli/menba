import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/hooks/useAuth';
import { palette } from '../src/theme/tokens';

export default function RootLayout() {
    const { session, isLoading } = useAuth();

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                {/* Acilis ekrani acik zeminli; koyu ikon dogru secim. */}
                <StatusBar style="dark" />
                <ActivityIndicator size="large" color={palette.indigo600} />
            </View>
        );
    }

    // Stack.Protected, guard false'a donunce aktif ekrandan otomatik olarak
    // stack'teki ilk uygun ekrana yonlendirir. Cikis yapildiginda kullaniciyi
    // sign-in'e tasiyan mekanizma budur; elle Redirect gerekmiyor.
    return (
        <>
            {/* Varsayilan: acik zeminli ekranlar (giris, soru akisi) icin koyu
                ikon. Koyu ust bar tasiyan sekmelerde AppHeader bunu "light"
                ile eziyor; expo-status-bar prop'lari mount sirasina gore
                birlestiriyor, en son mount edilen kazaniyor. */}
            <StatusBar style="dark" />
            <Stack>
                <Stack.Protected guard={Boolean(session)}>
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    <Stack.Screen
                        name="quiz/[sourceId]"
                        options={{ title: 'Konu Yönetimi' }}
                    />
                    <Stack.Screen
                        name="quiz/[sourceId]/play"
                        options={{ title: 'Soru Akışı' }}
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
