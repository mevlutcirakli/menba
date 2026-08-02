import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSources } from '../../src/hooks/useSources';
import { useEffect, useState } from 'react';
import { supabase } from '../../src/services/supabase';
import { AnimatedCard } from '../../src/components/AnimatedCard';
import { SkeletonCard } from '../../src/components/SkeletonCard';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

function getSourceModeLabel(value: string): string {
    if (value === 'hybrid') {
        return 'Hibrit (Topic + Soru)';
    }

    if (value === 'questions-only') {
        return 'Sadece Soru Bankasi';
    }

    if (value === 'topics-only') {
        return 'Sadece Topic';
    }

    if (value === 'yds') {
        return 'YDS';
    }

    if (value === 'custom') {
        return 'Ozel';
    }

    return value;
}

export default function QuizTabScreen() {
    const { sources, isLoading, error, fetchSources } = useSources();
    const [sourceStatsById, setSourceStatsById] = useState<
        Record<string, { topicCount: number; questionCount: number }>
    >({});

    useEffect(() => {
        if (sources.length === 0) {
            setSourceStatsById({});
            return;
        }

        let cancelled = false;
        const loadSourceStats = async () => {
            const sourceIds = sources.map((source) => source.id);
            const { data: topicRows, error: topicError } = await supabase
                .from('topics')
                .select('id, source_id')
                .in('source_id', sourceIds);

            if (cancelled || topicError || !topicRows) {
                return;
            }

            const topicCountBySource = new Map<string, number>();
            const sourceIdByTopicId = new Map<string, string>();
            for (const topic of topicRows) {
                sourceIdByTopicId.set(topic.id, topic.source_id);
                topicCountBySource.set(
                    topic.source_id,
                    (topicCountBySource.get(topic.source_id) ?? 0) + 1
                );
            }

            const questionCountBySource = new Map<string, number>();
            if (topicRows.length > 0) {
                const topicIds = topicRows.map((topic) => topic.id);
                const { data: questionRows } = await supabase
                    .from('questions')
                    .select('topic_id')
                    .in('topic_id', topicIds);

                for (const question of questionRows ?? []) {
                    const sourceId = sourceIdByTopicId.get(question.topic_id);
                    if (!sourceId) {
                        continue;
                    }

                    questionCountBySource.set(
                        sourceId,
                        (questionCountBySource.get(sourceId) ?? 0) + 1
                    );
                }
            }

            if (cancelled) {
                return;
            }

            const nextStats: Record<string, { topicCount: number; questionCount: number }> = {};
            for (const source of sources) {
                nextStats[source.id] = {
                    topicCount: topicCountBySource.get(source.id) ?? 0,
                    questionCount: questionCountBySource.get(source.id) ?? 0,
                };
            }

            setSourceStatsById(nextStats);
        };

        void loadSourceStats();

        return () => {
            cancelled = true;
        };
    }, [sources]);

    return (
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
            <View style={styles.heroCard}>
                <View style={styles.heroTopRow}>
                    <View style={styles.heroIconWrap}>
                        <Text style={styles.heroIconText}>Q</Text>
                    </View>
                    <Text style={styles.heroBadge}>Quiz Merkezi</Text>
                </View>
                <Text style={styles.title}>Hazir Soru Akisina Basla</Text>
                <Text style={styles.description}>
                    Kaynak sec, tek tikla quiz akisini baslat. Once kayitli soru bankasi kullanilir,
                    gerekirse AI yeni soru uretir.
                </Text>
            </View>

            <Pressable
                style={({ pressed }) => [styles.refreshButton, pressed ? styles.refreshButtonPressed : null]}
                onPress={() => void fetchSources()}
            >
                <Text style={styles.refreshGlyph}>R</Text>
                <Text style={styles.refreshButtonText}>Listeyi Yenile</Text>
            </Pressable>

            {isLoading ? <SkeletonCard height={84} /> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {!isLoading && sources.length === 0 ? (
                <View style={styles.card}>
                    <Text style={styles.emptyTitle}>Quiz icin kaynak bulunamadi ✨</Text>
                    <Text style={styles.emptyDescription}>
                        Ilk kaynagini ekleyerek basla, sonra buradan akisi baslatabilirsin.
                    </Text>
                    <Link href="/(tabs)" style={styles.linkButton}>
                        Kaynaklara Git
                    </Link>
                </View>
            ) : null}

            {sources.map((source, index) => (
                <AnimatedCard
                    key={source.id}
                    style={styles.card}
                    delayMs={Math.min(120, index * 30)}
                    resetKey={source.id}
                >
                    <Text style={styles.cardTitle}>{source.title}</Text>
                    <View style={styles.metaRow}>
                        <Text style={styles.modeChip}>{getSourceModeLabel(source.source_type)}</Text>
                        <Text style={styles.metricChip}>
                            {sourceStatsById[source.id]?.topicCount ?? 0} Konu
                        </Text>
                        <Text style={styles.metricChip}>
                            {sourceStatsById[source.id]?.questionCount ?? 0} Soru
                        </Text>
                    </View>
                    <Link href={`/quiz/${source.id}`} style={styles.linkButton}>
                        Quizi Baslat
                    </Link>
                </AnimatedCard>
            ))}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: spacing.lg,
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
    description: {
        fontSize: 16,
        color: colors.textSecondary,
        lineHeight: 24,
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
    metaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    modeChip: {
        borderRadius: radius.pill,
        backgroundColor: colors.primarySurface,
        color: colors.primary,
        fontSize: 12,
        fontWeight: '700',
        paddingHorizontal: 10,
        paddingVertical: 5,
        overflow: 'hidden',
    },
    metricChip: {
        borderRadius: radius.pill,
        backgroundColor: colors.primarySurface,
        color: colors.primary,
        fontSize: 12,
        fontWeight: '700',
        paddingHorizontal: 10,
        paddingVertical: 5,
        overflow: 'hidden',
    },
    emptyTitle: {
        ...typography.heading,
        color: colors.textPrimary,
    },
    emptyDescription: {
        fontSize: 14,
        color: colors.textMuted,
        lineHeight: 22,
    },
    linkButton: {
        marginTop: 4,
        alignSelf: 'flex-start',
        backgroundColor: colors.primary,
        color: colors.surface,
        borderRadius: radius.md,
        overflow: 'hidden',
        paddingVertical: 10,
        paddingHorizontal: 14,
        fontSize: 14,
        fontWeight: '700',
    },
    errorText: {
        color: colors.error,
        fontSize: 14,
    },
});
