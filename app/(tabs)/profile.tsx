import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
    Alert,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatTile } from '../../src/components/StatTile';
import { useAuth } from '../../src/hooks/useAuth';
import { useDashboardStats } from '../../src/hooks/useDashboardStats';
import { supabase } from '../../src/services/supabase';
import { palette, radius, spacing, uiType } from '../../src/theme/tokens';
import { localizeError } from '../../src/utils/errors';

export default function ProfileScreen() {
    const insets = useSafeAreaInsets();
    const { session } = useAuth();
    const {
        sourceCount,
        answeredCount,
        overallAccuracy,
        streakDays,
        isLoading,
        error,
        refresh,
    } = useDashboardStats();
    const [signOutError, setSignOutError] = useState<string | null>(null);

    // Sekmeye her donuste istatistikler tazelensin. Onceden yalnizca mount
    // aninda yukleniyorlardi: test cozup ya da kaynak silip profile gecen
    // kullanici eski sayilari goruyordu.
    useFocusEffect(
        useCallback(() => {
            void refresh();
        }, [refresh])
    );

    const email = session?.user?.email ?? '';
    const metadata = session?.user?.user_metadata as Record<string, unknown> | undefined;
    const metaName = metadata?.full_name ?? metadata?.name;
    const fullName =
        typeof metaName === 'string' && metaName.trim() ? metaName.trim() : null;
    const initial = (fullName ?? email).charAt(0).toLocaleUpperCase('tr-TR');

    const handleSignOut = useCallback(() => {
        Alert.alert('Çıkış Yap', 'Oturumu kapatmak istediğine emin misin?', [
            { text: 'Vazgeç', style: 'cancel' },
            {
                text: 'Çıkış Yap',
                style: 'destructive',
                onPress: () => {
                    void (async () => {
                        setSignOutError(null);
                        const { error: signOutFailure } = await supabase.auth.signOut();
                        if (signOutFailure) {
                            setSignOutError(
                                localizeError(signOutFailure, 'Çıkış yapılamadı.')
                            );
                        }
                    })();
                },
            },
        ]);
    }, []);

    return (
        <View style={styles.screen}>
            <StatusBar style="dark" />

            <ScrollView
                contentContainerStyle={[
                    styles.container,
                    { paddingTop: insets.top + spacing.md },
                ]}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={isLoading}
                        onRefresh={() => void refresh()}
                        tintColor={palette.accent}
                        colors={[palette.accent]}
                        progressViewOffset={insets.top}
                    />
                }
            >
                <Text style={styles.pageTitle}>Profil</Text>

                <View style={styles.identityCard}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initial || '?'}</Text>
                    </View>
                    <View style={styles.identityText}>
                        <Text style={styles.identityName} numberOfLines={1}>
                            {fullName ?? 'Menba kullanıcısı'}
                        </Text>
                        <Text style={styles.identityEmail} numberOfLines={1}>
                            {email}
                        </Text>
                    </View>
                </View>

                <Text style={styles.sectionTitle}>Özet</Text>

                {error ? (
                    <View style={styles.errorCard}>
                        <View style={styles.errorHead}>
                            <Ionicons
                                name="cloud-offline-outline"
                                size={17}
                                color={palette.danger}
                            />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                        <Pressable
                            onPress={() => void refresh()}
                            accessibilityRole="button"
                            accessibilityLabel="Tekrar dene"
                            style={({ pressed }) => [
                                styles.retryButton,
                                pressed ? styles.pressed : null,
                            ]}
                        >
                            <Ionicons name="refresh" size={14} color={palette.accent} />
                            <Text style={styles.retryText}>Tekrar dene</Text>
                        </Pressable>
                    </View>
                ) : null}

                <View style={styles.statRow}>
                    <StatTile
                        label="İşlenen Kaynak"
                        value={String(sourceCount)}
                        icon="folder-outline"
                    />
                    <StatTile
                        label="Çözülen Soru"
                        value={String(answeredCount)}
                        icon="checkmark-circle-outline"
                    />
                </View>

                <View style={styles.statRow}>
                    <StatTile
                        label="Başarı"
                        value={`%${overallAccuracy}`}
                        icon="ribbon-outline"
                    />
                    <StatTile
                        label="Seri"
                        value={streakDays > 0 ? `${streakDays} gün` : '—'}
                        icon="flash-outline"
                    />
                </View>

                {signOutError ? <Text style={styles.errorText}>{signOutError}</Text> : null}

                <Pressable
                    onPress={handleSignOut}
                    accessibilityRole="button"
                    accessibilityLabel="Oturumu kapat"
                    style={({ pressed }) => [
                        styles.signOutButton,
                        pressed ? styles.pressed : null,
                    ]}
                >
                    <Ionicons name="log-out-outline" size={17} color={palette.danger} />
                    <Text style={styles.signOutText}>Çıkış Yap</Text>
                </Pressable>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: palette.pageBg,
    },
    container: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xl,
        gap: spacing.sm,
    },
    pageTitle: {
        ...uiType.pageTitle,
        color: palette.textPrimary,
        marginBottom: spacing.sm,
    },
    identityCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        backgroundColor: palette.cardBg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
    },
    avatar: {
        width: 52,
        height: 52,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.avatarPeach,
    },
    avatarText: {
        fontSize: 21,
        fontWeight: '800',
        color: palette.teal800,
    },
    identityText: {
        flex: 1,
    },
    identityName: {
        fontSize: 16,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    identityEmail: {
        ...uiType.small,
        color: palette.textMuted,
        marginTop: 2,
    },
    sectionTitle: {
        ...uiType.sectionTitle,
        color: palette.textPrimary,
        marginTop: spacing.md,
        marginBottom: spacing.xs,
    },
    statRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    signOutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        marginTop: spacing.lg,
        paddingVertical: 14,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.dangerBorder,
        backgroundColor: palette.dangerSurface,
    },
    signOutText: {
        color: palette.danger,
        fontSize: 15,
        fontWeight: '700',
    },
    pressed: {
        opacity: 0.7,
    },
    errorCard: {
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.dangerBorder,
        backgroundColor: palette.dangerSurface,
    },
    errorHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    retryButton: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 36,
        paddingHorizontal: 12,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: palette.primaryBorder,
        backgroundColor: palette.cardBg,
    },
    retryText: {
        ...uiType.small,
        fontWeight: '700',
        color: palette.accent,
    },
    errorText: {
        flex: 1,
        color: palette.danger,
        fontSize: 13,
        lineHeight: 19,
    },
});
