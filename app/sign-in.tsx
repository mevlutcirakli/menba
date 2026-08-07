import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../src/services/supabase';
import { palette, radius, spacing, uiType } from '../src/theme/tokens';

/**
 * Supabase auth hatalari Ingilizce donuyor; kullaniciya ham mesaj yerine
 * Turkce karsiligi gosteriliyor. Eslesmeyen bir durumda genel bir metne
 * dusuluyor, boylece ekranda hicbir zaman Ingilizce cikmiyor.
 */
function localizeAuthError(message: string): string {
    const normalized = message.toLowerCase();

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
    if (normalized.includes('unable to validate email address') || normalized.includes('invalid email')) {
        return 'Geçerli bir e-posta adresi gir.';
    }
    if (normalized.includes('email rate limit') || normalized.includes('for security purposes')) {
        return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.';
    }
    if (normalized.includes('network') || normalized.includes('fetch')) {
        return 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.';
    }

    return 'Bir sorun oluştu. Lütfen tekrar dene.';
}

// Oturum acildiginda buradan cikisi _layout.tsx'teki Stack.Protected yapar;
// bu ekranda ayrica Redirect kullanmak cift yonlendirmeye yol acar.
export default function SignInScreen() {
    const insets = useSafeAreaInsets();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    /** Sunucuya gitmeden once bos alanlari yakala. */
    const validate = (): boolean => {
        if (!email.trim()) {
            setError('E-posta adresini gir.');
            return false;
        }
        if (!password) {
            setError('Şifreni gir.');
            return false;
        }
        return true;
    };

    const signIn = async () => {
        setError(null);
        setInfo(null);

        if (!validate()) {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
        }

        setIsSubmitting(true);

        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
        });

        if (signInError) {
            setError(localizeAuthError(signInError.message));
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }

        setIsSubmitting(false);
    };

    const signUp = async () => {
        setError(null);
        setInfo(null);

        if (!validate()) {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
        }

        setIsSubmitting(true);

        const { data, error: signUpError } = await supabase.auth.signUp({
            email: email.trim(),
            password,
        });

        if (signUpError) {
            setError(localizeAuthError(signUpError.message));
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else if (!data.session) {
            // E-posta dogrulamasi acikken signUp oturum acmaz; ekranda hicbir
            // sey degismezse kullanici kaydin basarisiz oldugunu saniyor.
            setInfo('Hesabın oluşturuldu. E-postana gönderilen doğrulama bağlantısına tıkla.');
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        setIsSubmitting(false);
    };

    return (
        <View style={styles.screen}>
            <StatusBar style="dark" />

            {/* Sifre alani klavyenin altinda kalmasin. */}
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    contentContainerStyle={[
                        styles.container,
                        {
                            paddingTop: insets.top + spacing.xl,
                            paddingBottom: insets.bottom + spacing.xl,
                        },
                    ]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                >
                    <View style={styles.brandMark}>
                        <Ionicons name="library" size={26} color={palette.onDarkPrimary} />
                    </View>

                    <Text style={styles.title}>Menba'ya hoş geldin</Text>
                    <Text style={styles.description}>
                        Kendi kaynaklarından soru bankası oluşturmak için giriş yap ya da
                        yeni bir hesap aç.
                    </Text>

                    <View style={styles.form}>
                        <Text style={styles.fieldLabel}>E-posta</Text>
                        <TextInput
                            value={email}
                            onChangeText={setEmail}
                            placeholder="ornek@eposta.com"
                            placeholderTextColor={palette.textMuted}
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoComplete="email"
                            textContentType="emailAddress"
                            keyboardType="email-address"
                            returnKeyType="next"
                            editable={!isSubmitting}
                            style={styles.input}
                        />

                        <Text style={styles.fieldLabel}>Şifre</Text>
                        <TextInput
                            value={password}
                            onChangeText={setPassword}
                            placeholder="En az 6 karakter"
                            placeholderTextColor={palette.textMuted}
                            secureTextEntry
                            autoCapitalize="none"
                            autoComplete="password"
                            textContentType="password"
                            returnKeyType="done"
                            editable={!isSubmitting}
                            onSubmitEditing={() => void signIn()}
                            style={styles.input}
                        />
                    </View>

                    {info ? (
                        <View style={[styles.statusRow, styles.statusRowSuccess]}>
                            <Ionicons
                                name="checkmark-circle"
                                size={16}
                                color={palette.success}
                            />
                            <Text style={styles.statusText}>{info}</Text>
                        </View>
                    ) : null}

                    {error ? (
                        <View style={[styles.statusRow, styles.statusRowError]}>
                            <Ionicons name="alert-circle" size={16} color={palette.danger} />
                            <Text style={styles.statusText}>{error}</Text>
                        </View>
                    ) : null}

                    <Pressable
                        style={({ pressed }) => [
                            styles.primaryButton,
                            pressed ? styles.pressed : null,
                            isSubmitting ? styles.disabled : null,
                        ]}
                        onPress={() => {
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            void signIn();
                        }}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator size="small" color={palette.onDarkPrimary} />
                        ) : null}
                        <Text style={styles.primaryButtonText}>
                            {isSubmitting ? 'İşleniyor...' : 'Giriş Yap'}
                        </Text>
                    </Pressable>

                    <Pressable
                        style={({ pressed }) => [
                            styles.secondaryButton,
                            pressed ? styles.pressed : null,
                            isSubmitting ? styles.disabled : null,
                        ]}
                        onPress={() => {
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            void signUp();
                        }}
                        disabled={isSubmitting}
                    >
                        <Text style={styles.secondaryButtonText}>Hesap Oluştur</Text>
                    </Pressable>

                    <Text style={styles.footnote}>
                        Hesabın yoksa aynı bilgilerle "Hesap Oluştur"a dokunman yeterli.
                    </Text>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: palette.pageBg,
    },
    flex: {
        flex: 1,
    },
    container: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
        gap: spacing.sm,
    },
    brandMark: {
        width: 56,
        height: 56,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.primary,
        marginBottom: spacing.md,
    },
    title: {
        ...uiType.pageTitle,
        color: palette.textPrimary,
    },
    description: {
        ...uiType.body,
        color: palette.textSecondary,
        marginBottom: spacing.md,
    },
    form: {
        gap: spacing.xs,
    },
    fieldLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: palette.textPrimary,
        marginTop: spacing.sm,
    },
    input: {
        borderWidth: 1,
        borderColor: palette.cardBorder,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: 13,
        fontSize: 14,
        color: palette.textPrimary,
        backgroundColor: palette.cardBg,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginTop: spacing.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        borderWidth: 1,
    },
    statusRowSuccess: {
        borderColor: palette.successBorder,
        backgroundColor: palette.successSurface,
    },
    statusRowError: {
        borderColor: palette.dangerBorder,
        backgroundColor: palette.dangerSurface,
    },
    statusText: {
        flex: 1,
        ...uiType.small,
        color: palette.textSecondary,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        marginTop: spacing.lg,
        paddingVertical: 15,
        borderRadius: radius.md,
        backgroundColor: palette.primary,
    },
    primaryButtonText: {
        color: palette.onDarkPrimary,
        fontSize: 15,
        fontWeight: '700',
    },
    secondaryButton: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing.sm,
        paddingVertical: 14,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.primaryBorder,
        backgroundColor: palette.primarySurface,
    },
    secondaryButtonText: {
        color: palette.primary,
        fontSize: 15,
        fontWeight: '700',
    },
    footnote: {
        ...uiType.small,
        color: palette.textMuted,
        textAlign: 'center',
        marginTop: spacing.md,
    },
    pressed: {
        opacity: 0.75,
    },
    disabled: {
        opacity: 0.55,
    },
});
