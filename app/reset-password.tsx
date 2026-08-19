import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
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
import { supabase } from '../src/services/supabase';
import { palette, radius, spacing, uiType } from '../src/theme/tokens';
import { localizeError } from '../src/utils/errors';

const MIN_PASSWORD_LENGTH = 6;

/**
 * Sifre sifirlama baglantisina dokunan kullanici buraya duser: baglanti zaten
 * bir oturum acmis durumda, tek eksik yeni sifrenin belirlenmesi.
 * Yonlendirmeyi src/hooks/useAuthDeepLink yapiyor.
 */
export default function ResetPasswordScreen() {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [passwordAgain, setPasswordAgain] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDone, setIsDone] = useState(false);

    const submit = async () => {
        setError(null);

        if (password.length < MIN_PASSWORD_LENGTH) {
            setError(`Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`);
            return;
        }

        if (password !== passwordAgain) {
            setError('Şifreler birbiriyle eşleşmiyor.');
            return;
        }

        setIsSubmitting(true);

        const { error: updateError } = await supabase.auth.updateUser({ password });

        if (updateError) {
            setError(localizeError(updateError, 'Şifren güncellenemedi.'));
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setIsSubmitting(false);
            return;
        }

        setIsDone(true);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setIsSubmitting(false);
    };

    if (isDone) {
        return (
            <View style={styles.screen}>
                <StatusBar style="dark" />
                <View style={styles.doneWrap}>
                    <View style={styles.doneIcon}>
                        <Ionicons
                            name="checkmark-circle"
                            size={34}
                            color={palette.success}
                        />
                    </View>
                    <Text style={styles.doneTitle}>Şifren güncellendi</Text>
                    <Text style={styles.doneBody}>
                        Artık yeni şifrenle giriş yapabilirsin. Oturumun zaten açık,
                        çalışmaya devam edebilirsin.
                    </Text>
                    <Pressable
                        onPress={() => router.replace('/(tabs)')}
                        accessibilityRole="button"
                        accessibilityLabel="Ana sayfaya git"
                        style={({ pressed }) => [
                            styles.primaryButton,
                            pressed ? styles.pressed : null,
                        ]}
                    >
                        <Text style={styles.primaryButtonText}>Ana Sayfaya Dön</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.screen}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <StatusBar style="dark" />

            <ScrollView
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.title}>Yeni şifreni belirle</Text>
                <Text style={styles.description}>
                    En az {MIN_PASSWORD_LENGTH} karakterli yeni bir şifre gir. Kaydettikten
                    sonra bu şifreyle giriş yapacaksın.
                </Text>

                <Text style={styles.fieldLabel}>Yeni şifre</Text>
                <View style={styles.inputRow}>
                    <TextInput
                        value={password}
                        onChangeText={setPassword}
                        placeholder={`En az ${MIN_PASSWORD_LENGTH} karakter`}
                        placeholderTextColor={palette.textMuted}
                        secureTextEntry={!isPasswordVisible}
                        autoCapitalize="none"
                        autoComplete="new-password"
                        textContentType="newPassword"
                        editable={!isSubmitting}
                        accessibilityLabel="Yeni şifre"
                        style={styles.inputFlex}
                    />
                    <Pressable
                        onPress={() => setIsPasswordVisible((previous) => !previous)}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={
                            isPasswordVisible ? 'Şifreyi gizle' : 'Şifreyi göster'
                        }
                        style={styles.visibilityToggle}
                    >
                        <Ionicons
                            name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
                            size={19}
                            color={palette.textMuted}
                        />
                    </Pressable>
                </View>

                <Text style={styles.fieldLabel}>Yeni şifre (tekrar)</Text>
                <TextInput
                    value={passwordAgain}
                    onChangeText={setPasswordAgain}
                    placeholder="Şifreni tekrar gir"
                    placeholderTextColor={palette.textMuted}
                    secureTextEntry={!isPasswordVisible}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    textContentType="newPassword"
                    editable={!isSubmitting}
                    onSubmitEditing={() => void submit()}
                    accessibilityLabel="Yeni şifre tekrar"
                    style={styles.input}
                />

                {error ? (
                    <View style={styles.errorRow}>
                        <Ionicons name="alert-circle" size={16} color={palette.danger} />
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : null}

                <Pressable
                    onPress={() => void submit()}
                    disabled={isSubmitting}
                    accessibilityRole="button"
                    accessibilityLabel="Şifreyi kaydet"
                    accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                    style={({ pressed }) => [
                        styles.primaryButton,
                        pressed ? styles.pressed : null,
                        isSubmitting ? styles.disabled : null,
                    ]}
                >
                    {isSubmitting ? (
                        <ActivityIndicator size="small" color={palette.onDarkPrimary} />
                    ) : null}
                    <Text style={styles.primaryButtonText}>
                        {isSubmitting ? 'Kaydediliyor...' : 'Şifreyi Kaydet'}
                    </Text>
                </Pressable>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: palette.pageBg,
    },
    container: {
        padding: spacing.lg,
        gap: spacing.xs,
    },
    title: {
        ...uiType.sectionTitle,
        fontSize: 20,
        color: palette.textPrimary,
    },
    description: {
        ...uiType.body,
        color: palette.textSecondary,
        marginBottom: spacing.md,
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
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: palette.cardBorder,
        borderRadius: radius.md,
        paddingRight: spacing.sm,
        backgroundColor: palette.cardBg,
    },
    inputFlex: {
        flex: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: 13,
        fontSize: 14,
        color: palette.textPrimary,
    },
    visibilityToggle: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    errorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginTop: spacing.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.dangerBorder,
        backgroundColor: palette.dangerSurface,
    },
    errorText: {
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
    doneWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.xl,
    },
    doneIcon: {
        width: 64,
        height: 64,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.successSurface,
        marginBottom: spacing.sm,
    },
    doneTitle: {
        ...uiType.sectionTitle,
        fontSize: 19,
        color: palette.textPrimary,
    },
    doneBody: {
        ...uiType.body,
        color: palette.textSecondary,
        textAlign: 'center',
    },
    pressed: {
        opacity: 0.75,
    },
    disabled: {
        opacity: 0.55,
    },
});
