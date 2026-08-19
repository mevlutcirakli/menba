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
import { buildAuthRedirectUrl } from '../src/hooks/useAuthDeepLink';
import { supabase } from '../src/services/supabase';
import { palette, radius, spacing, uiType } from '../src/theme/tokens';
import { localizeError } from '../src/utils/errors';

type AuthMode = 'sign-in' | 'sign-up';

const MIN_PASSWORD_LENGTH = 6;

/**
 * Kayit istegi aslinda "bu e-posta zaten kayitli" anlamina mi geliyor?
 *
 * Supabase, e-posta sayimini (enumeration) zorlastirmak icin var olan bir
 * adrese yapilan signUp cagrisina HATA DONDURMUYOR: oturumsuz, sahte bir
 * kullanici nesnesi donuyor. Bu yuzden kod "hesabin olusturuldu, dogrulama
 * maili gonderildi" diyordu; oysa hicbir mail gitmiyordu.
 *
 * Ayirt edici isaret `identities` dizisinin bos olmasi: gercekten yeni
 * olusturulan kullanicida en az bir kimlik kaydi bulunur.
 *
 * Not: Bu ayrimi gostermek, adresin kayitli olup olmadigini ele veriyor.
 * Bilincli bir tercih; kullanicinin neden mail almadigini anlamamasi daha
 * buyuk bir sorundu. Panelde "Prevent enumeration" acik kalabilir, bu kontrol
 * ondan bagimsiz calisir.
 */
function isAlreadyRegisteredResponse(user: { identities?: unknown[] | null } | null): boolean {
    return Boolean(user && Array.isArray(user.identities) && user.identities.length === 0);
}

// Oturum acildiginda buradan cikisi _layout.tsx'teki Stack.Protected yapar;
// bu ekranda ayrica Redirect kullanmak cift yonlendirmeye yol acar.
export default function SignInScreen() {
    const insets = useSafeAreaInsets();
    const [mode, setMode] = useState<AuthMode>('sign-in');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isSignUp = mode === 'sign-up';

    const switchMode = (next: AuthMode) => {
        if (next === mode) {
            return;
        }

        void Haptics.selectionAsync();
        setMode(next);
        setError(null);
        setInfo(null);
    };

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
        if (isSignUp && password.length < MIN_PASSWORD_LENGTH) {
            setError(`Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`);
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
            setError(localizeError(signInError, 'Giriş yapılamadı.'));
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
            options: {
                // Dogrulama baglantisi tarayicida degil uygulamada acilsin;
                // gelen token'i src/hooks/useAuthDeepLink karsiliyor.
                // Uretilen adres: menba://
                emailRedirectTo: buildAuthRedirectUrl(),
            },
        });

        // "Zaten kayitli" iki farkli sekilde gelebiliyor: panelde enumeration
        // korumasi kapaliysa acik bir hata, acikken sessiz bir sahte yanit.
        const isAlreadyRegistered =
            signUpError?.message.toLowerCase().includes('already registered') ||
            (!signUpError && isAlreadyRegisteredResponse(data.user));

        if (isAlreadyRegistered) {
            // Kullaniciyi giris sekmesine tasi: aradigi sey muhtemelen giris
            // ya da sifre sifirlama, ikisi de o sekmede.
            setMode('sign-in');
            setError(
                'Bu e-posta ile zaten bir hesap var. Giriş yapabilir, şifreni ' +
                    'hatırlamıyorsan aşağıdan sıfırlayabilirsin.'
            );
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else if (signUpError) {
            setError(localizeError(signUpError, 'Hesap oluşturulamadı.'));
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else if (!data.session) {
            // E-posta dogrulamasi acikken signUp oturum acmaz; ekranda hicbir
            // sey degismezse kullanici kaydin basarisiz oldugunu saniyor.
            setInfo(
                'Hesabın oluşturuldu. E-postana gönderilen doğrulama bağlantısına dokun; ' +
                    'bağlantı seni doğrudan uygulamaya geri getirecek.'
            );
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        setIsSubmitting(false);
    };

    const sendPasswordReset = async () => {
        setError(null);
        setInfo(null);

        if (!email.trim()) {
            setError('Sıfırlama bağlantısı için önce e-posta adresini gir.');
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
        }

        setIsSubmitting(true);

        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
            email.trim(),
            // Uretilen adres: menba://reset-password
            { redirectTo: buildAuthRedirectUrl('reset-password') }
        );

        if (resetError) {
            setError(localizeError(resetError, 'Sıfırlama bağlantısı gönderilemedi.'));
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else {
            // Hesabin var olup olmadigini sizdirmamak icin her durumda ayni
            // mesaj veriliyor; Supabase de bu yuzden hata dondurmuyor.
            setInfo(
                `${email.trim()} adresine bir sıfırlama bağlantısı gönderdik. ` +
                    'Gelen kutunu (ve spam klasörünü) kontrol et.'
            );
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        setIsSubmitting(false);
    };

    const submit = () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        void (isSignUp ? signUp() : signIn());
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
                        Kendi kaynaklarından soru bankası oluştur. Hesabın varsa giriş yap,
                        yoksa birkaç saniyede aç.
                    </Text>

                    {/* Iki mod ayri sekmeye ayrildi: onceden ayni form iki
                        butonla calisiyordu ve yeni kullanici hangisine
                        basacagini ancak en alttaki dipnottan anliyordu. */}
                    <View style={styles.segment} accessibilityRole="tablist">
                        <Pressable
                            onPress={() => switchMode('sign-in')}
                            accessibilityRole="tab"
                            accessibilityLabel="Giriş yap sekmesi"
                            accessibilityState={{ selected: !isSignUp }}
                            style={[
                                styles.segmentItem,
                                !isSignUp ? styles.segmentItemActive : null,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.segmentText,
                                    !isSignUp ? styles.segmentTextActive : null,
                                ]}
                            >
                                Giriş Yap
                            </Text>
                        </Pressable>
                        <Pressable
                            onPress={() => switchMode('sign-up')}
                            accessibilityRole="tab"
                            accessibilityLabel="Hesap oluştur sekmesi"
                            accessibilityState={{ selected: isSignUp }}
                            style={[
                                styles.segmentItem,
                                isSignUp ? styles.segmentItemActive : null,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.segmentText,
                                    isSignUp ? styles.segmentTextActive : null,
                                ]}
                            >
                                Hesap Oluştur
                            </Text>
                        </Pressable>
                    </View>

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
                            accessibilityLabel="E-posta adresi"
                            style={styles.input}
                        />

                        <Text style={styles.fieldLabel}>Şifre</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                value={password}
                                onChangeText={setPassword}
                                placeholder={`En az ${MIN_PASSWORD_LENGTH} karakter`}
                                placeholderTextColor={palette.textMuted}
                                secureTextEntry={!isPasswordVisible}
                                autoCapitalize="none"
                                autoComplete={isSignUp ? 'new-password' : 'password'}
                                textContentType={isSignUp ? 'newPassword' : 'password'}
                                returnKeyType="done"
                                editable={!isSubmitting}
                                onSubmitEditing={submit}
                                accessibilityLabel="Şifre"
                                style={styles.inputFlex}
                            />
                            <Pressable
                                onPress={() =>
                                    setIsPasswordVisible((previous) => !previous)
                                }
                                hitSlop={12}
                                accessibilityRole="button"
                                accessibilityLabel={
                                    isPasswordVisible ? 'Şifreyi gizle' : 'Şifreyi göster'
                                }
                                style={styles.visibilityToggle}
                            >
                                <Ionicons
                                    name={
                                        isPasswordVisible
                                            ? 'eye-off-outline'
                                            : 'eye-outline'
                                    }
                                    size={19}
                                    color={palette.textMuted}
                                />
                            </Pressable>
                        </View>
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
                        onPress={submit}
                        disabled={isSubmitting}
                        accessibilityRole="button"
                        accessibilityLabel={isSignUp ? 'Hesap oluştur' : 'Giriş yap'}
                        accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator size="small" color={palette.onDarkPrimary} />
                        ) : null}
                        <Text style={styles.primaryButtonText}>
                            {isSubmitting
                                ? 'İşleniyor...'
                                : isSignUp
                                  ? 'Hesap Oluştur'
                                  : 'Giriş Yap'}
                        </Text>
                    </Pressable>

                    {!isSignUp ? (
                        <Pressable
                            onPress={() => void sendPasswordReset()}
                            disabled={isSubmitting}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Şifremi unuttum, sıfırlama bağlantısı gönder"
                            style={({ pressed }) => [
                                styles.linkButton,
                                pressed ? styles.pressed : null,
                            ]}
                        >
                            <Text style={styles.linkButtonText}>Şifremi unuttum</Text>
                        </Pressable>
                    ) : (
                        <Text style={styles.footnote}>
                            Kaydolduktan sonra e-postana bir doğrulama bağlantısı
                            göndereceğiz.
                        </Text>
                    )}
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
    segment: {
        flexDirection: 'row',
        gap: spacing.xs,
        padding: 4,
        borderRadius: radius.md,
        backgroundColor: palette.subtleBg,
    },
    segmentItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 11,
        borderRadius: radius.sm,
    },
    segmentItemActive: {
        backgroundColor: palette.cardBg,
    },
    segmentText: {
        fontSize: 14,
        fontWeight: '700',
        color: palette.textMuted,
    },
    segmentTextActive: {
        color: palette.primary,
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
    linkButton: {
        alignSelf: 'center',
        marginTop: spacing.md,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    linkButtonText: {
        color: palette.accent,
        fontSize: 14,
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
