import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/hooks/useAuth';
import { colors } from '../src/theme/tokens';

export default function RootLayout() {
    const { session, isLoading } = useAuth();

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (session) {
        return (
            <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="quiz/[sourceId]" options={{ title: 'Test' }} />
                <Stack.Screen name="quiz/[sourceId]/play" options={{ title: 'Soru Akisi' }} />
                <Stack.Screen name="sign-in" options={{ headerShown: false }} />
            </Stack>
        );
    }

    return (
        <Stack>
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.surface,
    },
});
