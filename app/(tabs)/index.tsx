import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedCard } from '../../src/components/AnimatedCard';
import { SkeletonCard } from '../../src/components/SkeletonCard';
import { StatTile } from '../../src/components/StatTile';
import { TopicAccuracyChart } from '../../src/components/TopicAccuracyChart';
import { useAuth } from '../../src/hooks/useAuth';
import { useDashboardStats } from '../../src/hooks/useDashboardStats';
import { useProgress } from '../../src/hooks/useProgress';
import { supabase } from '../../src/services/supabase';
import { palette, radius, spacing, uiType } from '../../src/theme/tokens';

/** Bir konu icin ana sayfadan test baslatmak icin gereken bilgi. */
interface TopicLaunchInfo {
    sourceId: string;
    /** Konuda henuz cozulmemis soru sayisi. */
    remainingCount: number;
}

function formatRelativeTime(value: string | null): string {
    if (!value) {
        return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);

    if (diffMinutes < 1) {
        return 'az önce';
    }
    if (diffMinutes < 60) {
        return `${diffMinutes} dakika önce`;
    }
    if (diffMinutes < 60 * 24) {
        return `${Math.round(diffMinutes / 60)} saat önce`;
    }

    const diffDays = Math.round(diffMinutes / (60 * 24));
    return diffDays === 1 ? 'Dün' : `${diffDays} gün önce`;
}

/**
 * Selamlamada gosterilecek ad. Supabase'de profil tablosu yok; kayit
 * sirasinda verilmisse user_metadata'daki ad, yoksa e-postanin kullanici
 * kismi kullaniliyor.
 */
function resolveDisplayName(email: string | undefined, metadata: Record<string, unknown> | undefined): string {
    const metaName = metadata?.full_name ?? metadata?.name;
    if (typeof metaName === 'string' && metaName.trim()) {
        return metaName.trim().split(' ')[0];
    }

    const localPart = email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
    if (!localPart) {
        return '';
    }

    return localPart.charAt(0).toLocaleUpperCase('tr-TR') + localPart.slice(1);
}

/**
 * Selamlamanin alt satiri. Uygulama konudan bagimsiz: birisi YDS'ye, birisi
 * ticaret hukukuna calisiyor olabilir. Bu yuzden sabit bir alan adi yerine
 * kullanicinin kendi verisinden turetiliyor.
 */
function buildGreetingSubtitle(input: {
    sourceCount: number;
    answeredCount: number;
    streakDays: number;
    lastSourceTitle: string | null;
}): string {
    if (input.sourceCount === 0) {
        return 'İlk kaynağını ekleyerek başla';
    }

    if (input.answeredCount === 0) {
        return 'Kaynaklarından ilk testini çöz';
    }

    if (input.streakDays >= 2) {
        return `${input.streakDays} günlük seriyi sürdür`;
    }

    if (input.lastSourceTitle) {
        return `${input.lastSourceTitle} çalışmana devam edelim`;
    }

    return 'Çalışmaya devam edelim';
}

export default function DashboardScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { session } = useAuth();
    const {
        studiedTopics,
        todayPriorityTopics,
        isLoading,
        isRefreshing,
        error,
        refresh,
    } = useProgress();

    const {
        sourceCount,
        answeredCount,
        overallAccuracy,
        streakDays,
        recentSessions,
        isLoading: isStatsLoading,
        error: statsError,
        refresh: refreshStats,
    } = useDashboardStats();

    const [launchInfoByTopicId, setLaunchInfoByTopicId] = useState<
        Record<string, TopicLaunchInfo>
    >({});

    const displayName = resolveDisplayName(
        session?.user?.email,
        session?.user?.user_metadata as Record<string, unknown> | undefined
    );

    // %80 ve uzeri konular oneri listesinden dusuyor; aksi halde ustalasilmis
    // konular da "tekrar et" diye gosterilirdi. Hic calisilmamis konular
    // listede kaliyor ama ayri rozetle: onlar "tekrar" degil, "yeni".
    const suggestedTopics = useMemo(
        () =>
            todayPriorityTopics
                .filter((item) => item.totalAttempts === 0 || item.accuracy < 80)
                .slice(0, 5),
        [todayPriorityTopics]
    );

    const topicIds = useMemo(
        () => suggestedTopics.map((item) => item.topicId),
        [suggestedTopics]
    );

    const userId = session?.user?.id;

    useEffect(() => {
        if (topicIds.length === 0 || !userId) {
            setLaunchInfoByTopicId({});
            return;
        }

        let cancelled = false;

        const loadTopicLaunchInfo = async () => {
            const [
                { data: topicRows, error: topicError },
                { data: questionRows },
                { data: logRows },
            ] = await Promise.all([
                supabase.from('topics').select('id, source_id').in('id', topicIds),
                supabase.from('questions').select('id, topic_id').in('topic_id', topicIds),
                // Testin uzunlugu konudaki COZULMEMIS soru sayisi kadar;
                // toplam sayi gonderilirse kullanici her donuste "1 / 40"
                // goruyor ve ilerlemesi yokmus gibi hissediyor.
                supabase.from('question_logs').select('question_id').eq('user_id', userId),
            ]);

            if (cancelled || topicError || !topicRows) {
                return;
            }

            const solvedQuestionIds = new Set(
                (logRows ?? []).map((row) => row.question_id)
            );

            const remainingByTopicId: Record<string, number> = {};
            for (const row of questionRows ?? []) {
                if (solvedQuestionIds.has(row.id)) {
                    continue;
                }
                remainingByTopicId[row.topic_id] =
                    (remainingByTopicId[row.topic_id] ?? 0) + 1;
            }

            const next: Record<string, TopicLaunchInfo> = {};
            for (const row of topicRows) {
                next[row.id] = {
                    sourceId: row.source_id,
                    remainingCount: remainingByTopicId[row.id] ?? 0,
                };
            }

            setLaunchInfoByTopicId(next);
        };

        void loadTopicLaunchInfo();

        return () => {
            cancelled = true;
        };
    }, [topicIds, userId]);

    const handleRefresh = useCallback(() => {
        void refresh(true);
        void refreshStats();
    }, [refresh, refreshStats]);

    // Sekmeye her donuste veri tazelensin.
    useFocusEffect(
        useCallback(() => {
            handleRefresh();
        }, [handleRefresh])
    );

    const busy = isLoading || isStatsLoading;
    const combinedError = error ?? statsError;

    return (
        <View style={styles.screen}>
            <StatusBar style="dark" />

            <ScrollView
                contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor={palette.accent}
                        colors={[palette.accent]}
                        progressViewOffset={insets.top}
                    />
                }
            >
                <View style={styles.headRow}>
                    <View style={styles.headText}>
                        <Text style={styles.greeting} numberOfLines={1}>
                            {displayName ? `Merhaba, ${displayName}` : 'Merhaba'} 👋
                        </Text>
                        <Text style={styles.greetingSub} numberOfLines={1}>
                            {buildGreetingSubtitle({
                                sourceCount,
                                answeredCount,
                                streakDays,
                                lastSourceTitle: recentSessions[0]?.sourceTitle ?? null,
                            })}
                        </Text>
                    </View>

                    <Pressable
                        onPress={() => router.push('/(tabs)/profile')}
                        accessibilityRole="button"
                        accessibilityLabel="Profilini aç"
                        style={({ pressed }) => [styles.avatar, pressed ? styles.pressed : null]}
                    >
                        <Ionicons name="person" size={20} color={palette.teal800} />
                    </Pressable>
                </View>

                {combinedError ? (
                    <View style={styles.errorCard}>
                        <View style={styles.errorHead}>
                            <Ionicons
                                name="cloud-offline-outline"
                                size={17}
                                color={palette.danger}
                            />
                            <Text style={styles.errorText}>{combinedError}</Text>
                        </View>
                        <Pressable
                            onPress={handleRefresh}
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

                {busy ? (
                    <SkeletonCard />
                ) : (
                    <>
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

                        <AnimatedCard delayMs={10} resetKey="topic-chart">
                            {/* Yalnizca gercekten calisilmis konular. Filtresiz
                                halinde liste basariya gore artan sirali oldugu
                                icin grafigin ilk bes satiri her zaman hic
                                acilmamis, "%0" gorunen konulardi. */}
                            <TopicAccuracyChart
                                items={studiedTopics.map((item) => ({
                                    topicId: item.topicId,
                                    topicName: item.topicName,
                                    accuracy: item.accuracy,
                                }))}
                            />
                        </AnimatedCard>

                        <View style={styles.section}>
                            <View style={styles.sectionHead}>
                                <Ionicons name="sparkles" size={15} color={palette.accent} />
                                <Text style={styles.sectionTitle}>Öncelikli Konular</Text>
                            </View>

                            {suggestedTopics.length === 0 ? (
                                <Text style={styles.emptyText}>
                                    Şu an %80 altında konun yok. Seriyi bozma!
                                </Text>
                            ) : (
                                <>
                                    <View style={styles.chipWrap}>
                                        {suggestedTopics.map((item) => {
                                            const launchInfo =
                                                launchInfoByTopicId[item.topicId];
                                            const isReady = Boolean(launchInfo);
                                            const isNew = item.totalAttempts === 0;

                                            return (
                                                <Pressable
                                                    key={item.topicId}
                                                    disabled={!isReady}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`${item.topicName} konusunda teste başla`}
                                                    accessibilityHint={
                                                        isReady
                                                            ? isNew
                                                                ? 'Bu konuya henüz başlamadın'
                                                                : `Başarın yüzde ${Math.round(item.accuracy)}`
                                                            : 'Konu bilgisi henüz yüklenmedi'
                                                    }
                                                    accessibilityState={{
                                                        disabled: !isReady,
                                                    }}
                                                    onPress={() => {
                                                        if (!launchInfo) {
                                                            return;
                                                        }

                                                        void Haptics.impactAsync(
                                                            Haptics.ImpactFeedbackStyle
                                                                .Light
                                                        );
                                                        router.push({
                                                            pathname:
                                                                '/quiz/[sourceId]/play',
                                                            params: {
                                                                sourceId:
                                                                    launchInfo.sourceId,
                                                                topicId: item.topicId,
                                                                count: String(
                                                                    launchInfo.remainingCount
                                                                ),
                                                            },
                                                        });
                                                    }}
                                                    style={({ pressed }) => [
                                                        styles.chip,
                                                        pressed ? styles.pressed : null,
                                                        !isReady
                                                            ? styles.chipDisabled
                                                            : null,
                                                    ]}
                                                >
                                                    <Ionicons
                                                        name={
                                                            isNew
                                                                ? 'sparkles'
                                                                : 'refresh'
                                                        }
                                                        size={11}
                                                        color={palette.accent}
                                                    />
                                                    <Text
                                                        style={styles.chipText}
                                                        numberOfLines={1}
                                                    >
                                                        {item.topicName}
                                                    </Text>
                                                    <Text style={styles.chipTag}>
                                                        {isNew ? 'yeni' : 'tekrar'}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>

                                    {/* Pasif chip'in sebebi eskiden hicbir yerde
                                        yazmiyordu; kullanici dokunuyor, hicbir
                                        sey olmuyordu. */}
                                    {suggestedTopics.some(
                                        (item) => !launchInfoByTopicId[item.topicId]
                                    ) ? (
                                        <Text style={styles.emptyText}>
                                            Soluk görünen konuların bilgisi henüz
                                            yüklenmedi. Aşağı çekerek yenileyebilirsin.
                                        </Text>
                                    ) : null}
                                </>
                            )}
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Son Aktiviteler</Text>

                            {recentSessions.length === 0 ? (
                                <Text style={styles.emptyText}>
                                    Henüz tamamlanan test yok. Kaynaklarım sekmesinden ilk
                                    testini çözebilirsin.
                                </Text>
                            ) : (
                                recentSessions.map((item, index) => (
                                    <AnimatedCard
                                        key={item.key}
                                        style={styles.activityCard}
                                        delayMs={Math.min(180, index * 40)}
                                        resetKey={item.key}
                                    >
                                        <View style={styles.activityText}>
                                            <Text
                                                style={styles.activityTitle}
                                                numberOfLines={1}
                                            >
                                                {item.sourceTitle}
                                            </Text>
                                            <Text style={styles.activityMeta} numberOfLines={1}>
                                                {item.topicName} • {item.totalCount} Soru
                                            </Text>
                                        </View>

                                        <View style={styles.activityScoreBlock}>
                                            <Text style={styles.activityScore}>
                                                {item.correctCount}/{item.totalCount} Doğru
                                            </Text>
                                            <Text style={styles.activityTime}>
                                                {formatRelativeTime(item.lastAnsweredAt)}
                                            </Text>
                                        </View>
                                    </AnimatedCard>
                                ))
                            )}
                        </View>
                    </>
                )}
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
        gap: spacing.md,
    },
    headRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        marginBottom: spacing.xs,
    },
    headText: {
        flex: 1,
    },
    greeting: {
        ...uiType.pageTitle,
        color: palette.textPrimary,
    },
    greetingSub: {
        ...uiType.small,
        color: palette.textMuted,
        marginTop: 3,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.avatarPeach,
    },
    statRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    section: {
        gap: spacing.sm,
        marginTop: spacing.xs,
    },
    sectionHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    sectionTitle: {
        ...uiType.sectionTitle,
        color: palette.textPrimary,
    },
    chipWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        // Dokunma hedefi 44px'e yaklastirildi; onceden ~30px yuksekligindeydi.
        minHeight: 40,
        paddingVertical: 8,
        paddingHorizontal: 13,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: palette.primaryBorder,
        backgroundColor: palette.cardBg,
        maxWidth: '100%',
    },
    chipDisabled: {
        opacity: 0.5,
    },
    chipText: {
        flexShrink: 1,
        ...uiType.small,
        fontWeight: '700',
        color: palette.teal800,
    },
    chipTag: {
        fontSize: 10,
        fontWeight: '700',
        color: palette.textMuted,
    },
    activityCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        backgroundColor: palette.cardBg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
    },
    activityText: {
        flex: 1,
    },
    activityTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    activityMeta: {
        ...uiType.small,
        color: palette.textMuted,
        marginTop: 2,
    },
    activityScoreBlock: {
        alignItems: 'flex-end',
    },
    activityScore: {
        ...uiType.small,
        fontWeight: '700',
        color: palette.accent,
    },
    activityTime: {
        ...uiType.small,
        color: palette.textMuted,
        marginTop: 2,
    },
    emptyText: {
        ...uiType.small,
        color: palette.textMuted,
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
