import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TopicAccuracyChart } from '../../src/components/TopicAccuracyChart';
import { useProgress } from '../../src/hooks/useProgress';
import { supabase } from '../../src/services/supabase';
import { AnimatedCard } from '../../src/components/AnimatedCard';
import { SkeletonCard } from '../../src/components/SkeletonCard';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

export default function DashboardScreen() {
    const {
        progressByTopic,
        belowTargetTopics,
        todayPriorityTopics,
        isLoading,
        isRefreshing,
        lastUpdatedAt,
        error,
        refresh,
    } = useProgress();
    const [sourceIdByTopicId, setSourceIdByTopicId] = useState<Record<string, string>>({});

    const topicIds = useMemo(() => {
        const ids = new Set<string>();
        for (const item of belowTargetTopics) {
            ids.add(item.topicId);
        }
        for (const item of todayPriorityTopics) {
            ids.add(item.topicId);
        }

        return Array.from(ids);
    }, [belowTargetTopics, todayPriorityTopics]);

    useEffect(() => {
        if (topicIds.length === 0) {
            setSourceIdByTopicId({});
            return;
        }

        let cancelled = false;
        const loadTopicSources = async () => {
            const { data, error: topicError } = await supabase
                .from('topics')
                .select('id, source_id')
                .in('id', topicIds);

            if (cancelled || topicError || !data) {
                return;
            }

            const next: Record<string, string> = {};
            for (const row of data) {
                next[row.id] = row.source_id;
            }

            setSourceIdByTopicId(next);
        };

        void loadTopicSources();

        return () => {
            cancelled = true;
        };
    }, [topicIds]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };

    const statusText = isLoading
        ? 'Veriler yukleniyor...'
        : isRefreshing
            ? 'Canli guncelleme aliniyor...'
            : lastUpdatedAt
                ? `Son guncelleme: ${lastUpdatedAt.toLocaleTimeString()}`
                : 'Hazir';

    return (
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
            <View style={styles.heroCard}>
                <View style={styles.heroTopRow}>
                    <View style={styles.heroIconWrap}>
                        <Text style={styles.heroIconText}>D</Text>
                    </View>
                    <Text style={styles.heroBadge}>Performans Merkezi</Text>
                </View>
                <Text style={styles.title}>Ilerlemeni Akilli Takip Et</Text>
                <Text style={styles.description}>
                    Konu bazli basari yuzdeleri, zayif alanlar ve bugunun oncelikleri.
                </Text>
            </View>

            <View style={styles.statusBadge}>
                <Text style={styles.statusText}>{statusText}</Text>
            </View>

            <Pressable
                style={({ pressed }) => [styles.refreshButton, pressed ? styles.refreshButtonPressed : null]}
                onPress={() => void refresh()}
            >
                <Text style={styles.refreshGlyph}>R</Text>
                <Text style={styles.refreshButtonText}>Veriyi Yenile</Text>
            </Pressable>

            {isLoading ? <SkeletonCard height={86} /> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <AnimatedCard style={styles.chartWrap} delayMs={10} resetKey="topic-chart">
                <TopicAccuracyChart
                    items={progressByTopic.map((item) => ({
                        topicName: item.topicName,
                        accuracy: item.accuracy,
                    }))}
                />
            </AnimatedCard>

            <AnimatedCard style={styles.card} delayMs={30} resetKey="below-target">
                <Text style={styles.cardTitle}>%80 Alti Konular</Text>
                {belowTargetTopics.length === 0 ? (
                    <Text style={styles.description}>Harika gidiyorsun, tum konular hedefin uzerinde ✨</Text>
                ) : (
                    belowTargetTopics.map((item) => (
                        <View key={item.topicId} style={styles.topicRow}>
                            <Text style={styles.listItem}>
                                {item.topicName}: %{item.accuracy.toFixed(1)} ({item.correctAttempts}/
                                {item.totalAttempts})
                            </Text>
                            {sourceIdByTopicId[item.topicId] ? (
                                <Link
                                    href={`/quiz/${sourceIdByTopicId[item.topicId]}`}
                                    style={styles.inlineLink}
                                >
                                    Teste Git
                                </Link>
                            ) : null}
                        </View>
                    ))
                )}
            </AnimatedCard>

            <AnimatedCard style={styles.card} delayMs={50} resetKey="priority-topics">
                <Text style={styles.cardTitle}>Bugun Oncelikli Konular</Text>
                {todayPriorityTopics.length === 0 ? (
                    <Text style={styles.description}>Bugun icin oncelik yok, biraz soru cozerek baslayabilirsin ✨</Text>
                ) : (
                    todayPriorityTopics.map((item, index) => (
                        <View key={item.topicId} style={styles.topicRow}>
                            <Text style={styles.listItem}>
                                {index + 1}. {item.topicName} (%{item.accuracy.toFixed(1)})
                            </Text>
                            {sourceIdByTopicId[item.topicId] ? (
                                <Link
                                    href={`/quiz/${sourceIdByTopicId[item.topicId]}`}
                                    style={styles.inlineLink}
                                >
                                    Teste Git
                                </Link>
                            ) : null}
                        </View>
                    ))
                )}
            </AnimatedCard>

            <Pressable
                style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
                onPress={handleSignOut}
            >
                <Text style={styles.buttonText}>Cikis Yap</Text>
            </Pressable>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: spacing.lg,
        paddingBottom: 36,
        gap: spacing.md,
        backgroundColor: colors.background,
    },
    heroCard: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.xl,
        padding: 16,
        gap: spacing.sm,
        backgroundColor: colors.surface,
    },
    heroTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    heroIconWrap: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primarySurface,
    },
    heroIconText: {
        color: colors.primary,
        fontSize: 13,
        fontWeight: '700',
    },
    heroBadge: {
        color: colors.primary,
        fontSize: 12,
        fontWeight: '700',
    },
    title: {
        ...typography.title,
        color: colors.textPrimary,
    },
    chartWrap: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    card: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.lg,
        padding: spacing.md,
        gap: spacing.sm,
        backgroundColor: colors.surface,
    },
    cardTitle: {
        ...typography.heading,
        color: colors.textPrimary,
    },
    description: {
        fontSize: 16,
        color: colors.textSecondary,
        lineHeight: 24,
    },
    listItem: {
        fontSize: 14,
        lineHeight: 22,
        color: colors.textPrimary,
    },
    topicRow: {
        gap: 4,
    },
    inlineLink: {
        alignSelf: 'flex-start',
        borderRadius: radius.sm,
        backgroundColor: colors.primary,
        color: colors.surface,
        fontSize: 12,
        fontWeight: '700',
        paddingHorizontal: 10,
        paddingVertical: 6,
        overflow: 'hidden',
    },
    refreshButton: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingVertical: 10,
        paddingHorizontal: 14,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    refreshButtonText: {
        color: colors.textPrimary,
        fontWeight: '700',
        fontSize: 14,
    },
    refreshButtonPressed: {
        backgroundColor: colors.primarySurface,
    },
    refreshGlyph: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: '700',
    },
    statusBadge: {
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: colors.primaryLight,
        backgroundColor: colors.primarySurface,
        borderRadius: radius.pill,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    statusText: {
        color: colors.primary,
        fontSize: 12,
        fontWeight: '700',
    },
    errorText: {
        color: colors.error,
        fontSize: 14,
    },
    button: {
        marginTop: 8,
        backgroundColor: colors.primarySurface,
        borderRadius: radius.md,
        paddingVertical: 10,
        paddingHorizontal: 16,
        alignSelf: 'flex-start',
    },
    buttonText: {
        color: colors.primary,
        fontSize: 14,
        fontWeight: '700',
    },
    buttonPressed: {
        backgroundColor: colors.border,
    },
});
