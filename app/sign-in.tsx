import { useState } from 'react';
import { Redirect } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../src/hooks/useAuth';
import { supabase } from '../src/services/supabase';
import { colors, radius, spacing, typography } from '../src/theme/tokens';

export default function SignInScreen() {
    const { session, isLoading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isLoading && session) {
        return <Redirect href="/(tabs)" />;
    }

    const signIn = async () => {
        setError(null);
        setIsSubmitting(true);

        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
        });

        if (signInError) {
            setError(signInError.message);
        }

        setIsSubmitting(false);
    };

    const signUp = async () => {
        setError(null);
        setIsSubmitting(true);

        const { error: signUpError } = await supabase.auth.signUp({
            email: email.trim(),
            password,
        });

        if (signUpError) {
            setError(signUpError.message);
        }

        setIsSubmitting(false);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Menba Giris</Text>
            <Text style={styles.description}>Devam etmek icin oturum ac veya hesap olustur.</Text>

            <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="E-posta"
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
            />
            <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Sifre"
                secureTextEntry
                style={styles.input}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={styles.primaryButton} onPress={signIn} disabled={isSubmitting}>
                <Text style={styles.primaryButtonText}>
                    {isSubmitting ? 'Isleniyor...' : 'Giris Yap'}
                </Text>
            </Pressable>

            <Pressable style={styles.secondaryButton} onPress={signUp} disabled={isSubmitting}>
                <Text style={styles.secondaryButtonText}>Kayit Ol</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: spacing.lg,
        gap: 12,
        justifyContent: 'center',
        backgroundColor: colors.surface,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    description: {
        ...typography.body,
        color: colors.textSecondary,
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        color: colors.textPrimary,
        backgroundColor: colors.surface,
    },
    error: {
        color: colors.error,
        fontSize: 14,
    },
    primaryButton: {
        marginTop: 6,
        borderRadius: radius.md,
        backgroundColor: colors.primary,
        paddingVertical: 12,
        alignItems: 'center',
    },
    primaryButtonText: {
        color: colors.surface,
        fontSize: 15,
        fontWeight: '700',
    },
    secondaryButton: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.primary,
        paddingVertical: 12,
        alignItems: 'center',
    },
    secondaryButtonText: {
        color: colors.primary,
        fontSize: 15,
        fontWeight: '700',
    },
});