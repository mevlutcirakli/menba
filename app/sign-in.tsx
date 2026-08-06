import { useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { supabase } from '../src/services/supabase';
import { palette, radius, spacing, uiType } from '../src/theme/tokens';

// Oturum acildiginda buradan cikisi _layout.tsx'teki Stack.Protected yapar;
// bu ekranda ayrica Redirect kullanmak cift yonlendirmeye yol acar.
export default function SignInScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

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
        // Sifre alani klavyenin altinda kalmasin.
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
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
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: spacing.lg,
        gap: 12,
        justifyContent: 'center',
        backgroundColor: palette.cardBg,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    description: {
        ...uiType.body,
        color: palette.textSecondary,
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: palette.cardBorder,
        borderRadius: radius.md,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        color: palette.textPrimary,
        backgroundColor: palette.cardBg,
    },
    error: {
        color: palette.error,
        fontSize: 14,
    },
    primaryButton: {
        marginTop: 6,
        borderRadius: radius.md,
        backgroundColor: palette.indigo600,
        paddingVertical: 12,
        alignItems: 'center',
    },
    primaryButtonText: {
        color: palette.cardBg,
        fontSize: 15,
        fontWeight: '700',
    },
    secondaryButton: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.indigo600,
        paddingVertical: 12,
        alignItems: 'center',
    },
    secondaryButtonText: {
        color: palette.indigo600,
        fontSize: 15,
        fontWeight: '700',
    },
});