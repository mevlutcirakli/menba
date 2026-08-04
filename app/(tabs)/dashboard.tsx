import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { AnimatedCard } from '../../src/components/AnimatedCard';
import { AppHeader } from '../../src/components/AppHeader';
import { SkeletonCard } from '../../src/components/SkeletonCard';
import { StatCard } from '../../src/components/StatCard';
import { TopicAccuracyChart } from '../../src/components/TopicAccuracyChart';
import { useDashboardStats } from '../../src/hooks/useDashboardStats';
import { useProgress } from '../../src/hooks/useProgress';
import { supabase } from '../../src/services/supabase';
import { palette, radius, spacing, uiType } from '../../src/theme/tokens';

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
        return `${diffMinutes} dk önce`;
    }
    if (diffMinutes < 60 * 24) {
        return `${Math.round(diffMinutes / 60)} sa önce`;
    }

    return `${Math.round(diffMinutes / (60 * 24))} gün önce`;
}

export default function DashboardScreen() {
    const router = useRouter();
    const {
        progressByTopic,
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
        recentActivity,
        isLoading: isStatsLoading,
        error: statsError,
        refresh: refreshStats,
    } = useDashboardStats();

    const [sourceIdByTopicId, setSourceIdByTopicId] = useState<Record<string, string>>({});
    const [questionCountByTopicId, setQuestionCountByTopicId] = useState<
        Record<string, number>
    >({});
    const [signOutError, setSignOutError] = useState<string | null>(null);

    // Kart metni "adaptif ogrenme algoritmasi uyarinca" diyor; bu yuzden
    // adaptiveEngine'in agirlikladigi siralamayi kullaniyoruz. %80 ve uzeri
    // konular oneri listesinden dusuyor, aksi halde ustalasilmis konular da
    // "tekrar et" diye gosterilirdi.
    const suggestedTopics = useMemo(
        () => todayPriorityTopics.filter((item) => item.accuracy < 80).slice(0, 5),
        [todayPriorityTopics]
    );

    const topicIds = useMemo(
        () => suggestedTopics.map((item) => item.topicId),
        [suggestedTopics]
    );

    useEffect(() => {
        if (topicIds.length === 0) {
            setSourceIdByTopicId({});
            setQuestionCountByTopicId({});
            return;
        }

        let cancelled = false;

        const loadTopicSources = async () => {
            const [
                { data, error: topicError },
                { data: questionRows },
            ] = await Promise.all([
                supabase.from('topics').select('id, source_id').in('id', topicIds),
                // "Pratik Et" testinin uzunlugu konudaki hazir soru sayisi
                // kadar; play ekranina parametre olarak gidiyor.
                supabase.from('questions').select('topic_id').in('topic_id', topicIds),
            ]);

            if (cancelled || topicError || !data) {
                return;
            }

            const next: Record<string, string> = {};
            for (const row of data) {
                next[row.id] = row.source_id;
            }

            const counts: Record<string, number> = {};
            for (const row of questionRows ?? []) {
                counts[row.topic_id] = (counts[row.topic_id] ?? 0) + 1;
            }

            setSourceIdByTopicId(next);
            setQuestionCountByTopicId(counts);
        };

        void loadTopicSources();

        return () => {
            cancelled = true;
        };
    }, [topicIds]);

    const handleRefresh = useCallback(() => {
        void refresh(true);
        void refreshStats();
    }, [refresh, refreshStats]);

    // Sekmeye her donuste veri tazelensin; kullanicidan elle yenilemesini
    // beklemek yerine ekrana girmek yenileme sinyali sayiliyor.
    useFocusEffect(
        useCallback(() => {
            handleRefresh();
        }, [handleRefresh])
    );

    const handleSignOut = useCallback(async () => {
        setSignOutError(null);

        const { error: signOutError } = await supabase.auth.signOut();

        if (signOutError) {
            setSignOutError(signOutError.message);
        }
    }, []);

    const busy = isLoading || isStatsLoading;
    const combinedError = error ?? statsError;

    return (
        <View style={styles.screen}>
            <AppHeader />

            <ScrollView
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor={palette.indigo600}
                        colors={[palette.indigo600]}
                    />
                }
            >
                <View style={styles.pageHead}>
                    <Text style={styles.pageTitle}>Performans ve Analiz Paneli</Text>
                    <Text style={styles.pageSubtitle}>
                        Öğrenme istatistiklerin, konu ustalık seviyelerin ve AI önerileri
                    </Text>
                </View>

                {combinedError ? <Text style={styles.errorText}>{combinedError}</Text> : null}

                {busy ? (
                    <SkeletonCard />
                ) : (
                    <>
                        <View style={styles.statGrid}>
                            <StatCard
                                label="İşlenen Kaynak"
                                value={String(sourceCount)}
                                icon="book-outline"
                                tone="indigo"
                            />
                            <StatCard
                                label="Çözülen Soru"
                                value={String(answeredCount)}
                                icon="checkmark-circle-outline"
                                tone="emerald"
                            />
                        </View>

                        <View style={styles.statGrid}>
                            <StatCard
                                label="Genel Başarı"
                                value={`%${overallAccuracy}`}
                                icon="trending-up-outline"
                                tone="indigo"
                                tintValue
                            />
                            <StatCard
                                label="Çalışma Serisi"
                                value={streakDays > 0 ? `${streakDays} Gün 🔥` : '—'}
                                icon="ribbon-outline"
                                tone="amber"
                                tintValue
                            />
                        </View>

                        <AnimatedCard delayMs={10} resetKey="topic-chart">
                            <TopicAccuracyChart
                                items={progressByTopic.map((item) => ({
                                    topicName: item.topicName,
                                    accuracy: item.accuracy,
                                }))}
                            />
                        </AnimatedCard>

                        <AnimatedCard style={styles.card} delayMs={20} resetKey="ai-suggestions">
                            <View style={styles.cardHeadRow}>
                                <Ionicons name="disc-outline" size={18} color={palette.indigo600} />
                                <Text style={styles.cardTitle}>AI Çalışma Önerileri</Text>
                            </View>
                            <Text style={styles.cardDescription}>
                                Adaptif öğrenme algoritması uyarınca öncelikli tekrar etmen
                                gereken konular:
                            </Text>

                            {suggestedTopics.length === 0 ? (
                                <Text style={styles.emptyText}>
                                    Şu an %80 altında konun yok. Seriyi bozma!
                                </Text>
                            ) : (
                                suggestedTopics.map((item) => {
                                    const sourceId = sourceIdByTopicId[item.topicId];

                                    return (
                                        <View key={item.topicId} style={styles.suggestionRow}>
                                            <View style={styles.suggestionText}>
                                                <Text style={styles.suggestionTitle} numberOfLines={1}>
                                                    {item.topicName}
                                                </Text>
                                                <Text style={styles.suggestionMeta}>
                                                    Ustalık: %{item.accuracy.toFixed(0)}
                                                </Text>
                                            </View>

                                            {sourceId ? (
                                                // Dogrudan bu konunun testine gir; onceden konu
                                                // secim ekranina birakiyordu ve onerilen konu
                                                // kayboluyordu. Link asChild kullanilmiyor:
                                                // cocugun `style`ini undefined ile eziyor.
                                                <Pressable
                                                    onPress={() =>
                                                        router.push({
                                                            pathname: '/quiz/[sourceId]/play',
                                                            params: {
                                                                sourceId,
                                                                topicId: item.topicId,
                                                                count: String(
                                                                    questionCountByTopicId[
                                                                        item.topicId
                                                                    ] ?? 0
                                                                ),
                                                            },
                                                        })
                                                    }
                                                    style={styles.practiceButton}
                                                >
                                                    <Text style={styles.practiceButtonText}>
                                                        Pratik Et
                                                    </Text>
                                                    <Ionicons
                                                        name="arrow-forward"
                                                        size={13}
                                                        color={palette.onDarkPrimary}
                                                    />
                                                </Pressable>
                                            ) : null}
                                        </View>
                                    );
                                })
                            )}

                            <Text style={styles.cardFootnote}>
                                Aralıklı Tekrar (Spaced Repetition) motoru aktif
                            </Text>
                        </AnimatedCard>

                        <AnimatedCard style={styles.card} delayMs={30} resetKey="recent-activity">
                            <Text style={styles.cardTitle}>Son Test Etkinlikleri</Text>

                            {recentActivity.length === 0 ? (
                                <Text style={styles.emptyText}>
                                    Henüz tamamlanan test bulunmuyor. &apos;Test Çöz&apos;
                                    sekmesinden ilk testini tamamlayabilirsin.
                                </Text>
                            ) : (
                                recentActivity.map((item) => (
                                    <View key={item.logId} style={styles.activityRow}>
                                        <View
                                            style={[
                                                styles.activityIcon,
                                                {
                                                    backgroundColor: item.isCorrect
                                                        ? palette.emeraldSurface
                                                        : '#fef2f2',
                                                },
                                            ]}
                                        >
                                            <Ionicons
                                                name={item.isCorrect ? 'checkmark' : 'close'}
                                                size={15}
                                                color={
                                                    item.isCorrect
                                                        ? palette.emerald500
                                                        : palette.error
                                                }
                                            />
                                        </View>

                                        <Text style={styles.activityTopic} numberOfLines={1}>
                                            {item.topicName}
                                        </Text>

                                        <Text style={styles.activityTime}>
                                            {formatRelativeTime(item.answeredAt)}
                                        </Text>
                                    </View>
                                ))
                            )}
                        </AnimatedCard>
                    </>
                )}

                <Pressable
                    style={({ pressed }) => [
                        styles.signOutButton,
                        pressed ? styles.pressed : null,
                    ]}
                    onPress={handleSignOut}
                >
                    <Ionicons name="log-out-outline" size={15} color={palette.error} />
                    <Text style={styles.signOutText}>Çıkış Yap</Text>
                </Pressable>

                {signOutError ? <Text style={styles.errorText}>{signOutError}</Text> : null}
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
        padding: spacing.lg,
        gap: spacing.md,
        paddingBottom: spacing.xl,
    },
    pageHead: {
        marginBottom: spacing.xs,
    },
    pageTitle: {
        ...uiType.pageTitle,
        color: palette.textPrimary,
    },
    pageSubtitle: {
        ...uiType.body,
        color: palette.textSecondary,
        marginTop: spacing.xs,
    },
    statGrid: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    card: {
        backgroundColor: palette.cardBg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        padding: spacing.md,
        gap: spacing.sm,
    },
    cardHeadRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    cardTitle: {
        ...uiType.cardTitle,
        color: palette.textPrimary,
    },
    cardDescription: {
        ...uiType.body,
        color: palette.textSecondary,
    },
    cardFootnote: {
        ...uiType.small,
        color: palette.textMuted,
        textAlign: 'center',
        marginTop: spacing.sm,
    },
    suggestionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        backgroundColor: palette.pageBg,
    },
    suggestionText: {
        flex: 1,
    },
    suggestionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    suggestionMeta: {
        ...uiType.small,
        color: palette.amber600,
        marginTop: 2,
        fontWeight: '600',
    },
    practiceButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: palette.indigo600,
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: radius.sm,
    },
    practiceButtonText: {
        color: palette.onDarkPrimary,
        fontSize: 12,
        fontWeight: '700',
    },
    activityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: palette.cardBorder,
    },
    activityIcon: {
        width: 28,
        height: 28,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    activityTopic: {
        flex: 1,
        ...uiType.body,
        color: palette.textPrimary,
    },
    activityTime: {
        ...uiType.small,
        color: palette.textMuted,
    },
    emptyText: {
        ...uiType.body,
        color: palette.textMuted,
        textAlign: 'center',
        paddingVertical: spacing.md,
    },
    signOutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        marginTop: spacing.sm,
        paddingVertical: 11,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        backgroundColor: palette.cardBg,
    },
    signOutText: {
        color: palette.error,
        fontSize: 14,
        fontWeight: '700',
    },
    pressed: {
        opacity: 0.7,
    },
    errorText: {
        color: palette.error,
        fontSize: 14,
    },
});
