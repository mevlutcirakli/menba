import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSources } from '../../src/hooks/useSources';
import { supabase } from '../../src/services/supabase';
import { AnimatedCard } from '../../src/components/AnimatedCard';
import { SkeletonCard } from '../../src/components/SkeletonCard';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

function getSourceModeLabel(value: string): string {
    if (value === 'hybrid' || value === 'questions-only' || value === 'topics-only') {
        if (value === 'hybrid') {
            return 'Hibrit (Topic + Soru)';
        }

        if (value === 'questions-only') {
            return 'Sadece Soru Bankasi';
        }

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

export default function SourcesListScreen() {
    const { sources, isLoading, error, fetchSources, deleteSource } = useSources();
    const [searchText, setSearchText] = useState('');
    const [isLoadingSourceStats, setIsLoadingSourceStats] = useState(false);
    const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
    const [actionInfo, setActionInfo] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [sourceStatsById, setSourceStatsById] = useState<
        Record<
            string,
            {
                topicCount: number;
                questionCount: number;
                topicQuestionBreakdown: Array<{ topicName: string; questionCount: number }>;
            }
        >
    >({});

    const normalizedSearchText = searchText.trim().toLocaleLowerCase('tr-TR');
    const filteredSources = sources.filter((source) => {
        if (!normalizedSearchText) {
            return true;
        }

        const title = source.title.toLocaleLowerCase('tr-TR');
        const modeLabel = getSourceModeLabel(source.source_type).toLocaleLowerCase('tr-TR');
        return title.includes(normalizedSearchText) || modeLabel.includes(normalizedSearchText);
    });

    useEffect(() => {
        if (sources.length === 0) {
            setSourceStatsById({});
            return;
        }

        let cancelled = false;
        const loadSourceStats = async () => {
            setIsLoadingSourceStats(true);

            const sourceIds = sources.map((source) => source.id);
            const { data: topicRows, error: topicError } = await supabase
                .from('topics')
                .select('id, source_id, name')
                .in('source_id', sourceIds);

            if (cancelled) {
                return;
            }

            if (topicError || !topicRows) {
                setSourceStatsById({});
                setIsLoadingSourceStats(false);
                return;
            }

            const topicCountBySource = new Map<string, number>();
            const sourceIdByTopicId = new Map<string, string>();
            const topicNameByTopicId = new Map<string, string>();
            for (const topic of topicRows) {
                sourceIdByTopicId.set(topic.id, topic.source_id);
                topicNameByTopicId.set(topic.id, topic.name);
                topicCountBySource.set(
                    topic.source_id,
                    (topicCountBySource.get(topic.source_id) ?? 0) + 1
                );
            }

            let questionCountBySource = new Map<string, number>();
            let questionCountByTopicId = new Map<string, number>();
            if (topicRows.length > 0) {
                const topicIds = topicRows.map((topic) => topic.id);
                const { data: questionRows } = await supabase
                    .from('questions')
                    .select('topic_id')
                    .in('topic_id', topicIds);

                if (!cancelled) {
                    questionCountBySource = new Map<string, number>();
                    questionCountByTopicId = new Map<string, number>();
                    for (const question of questionRows ?? []) {
                        const parentSourceId = sourceIdByTopicId.get(question.topic_id);
                        if (!parentSourceId) {
                            continue;
                        }

                        questionCountByTopicId.set(
                            question.topic_id,
                            (questionCountByTopicId.get(question.topic_id) ?? 0) + 1
                        );

                        questionCountBySource.set(
                            parentSourceId,
                            (questionCountBySource.get(parentSourceId) ?? 0) + 1
                        );
                    }
                }
            }

            if (cancelled) {
                return;
            }

            const nextStats: Record<
                string,
                {
                    topicCount: number;
                    questionCount: number;
                    topicQuestionBreakdown: Array<{ topicName: string; questionCount: number }>;
                }
            > = {};
            for (const source of sources) {
                const topicQuestionBreakdown = topicRows
                    .filter((topic) => topic.source_id === source.id)
                    .map((topic) => ({
                        topicName: topicNameByTopicId.get(topic.id) ?? topic.name,
                        questionCount: questionCountByTopicId.get(topic.id) ?? 0,
                    }))
                    .sort((a, b) => b.questionCount - a.questionCount);

                nextStats[source.id] = {
                    topicCount: topicCountBySource.get(source.id) ?? 0,
                    questionCount: questionCountBySource.get(source.id) ?? 0,
                    topicQuestionBreakdown,
                };
            }

            setSourceStatsById(nextStats);
            setIsLoadingSourceStats(false);
        };

        void loadSourceStats();

        return () => {
            cancelled = true;
        };
    }, [sources]);

    const handleDeleteSource = (
        sourceId: string,
        sourceTitle: string,
        topicCount: number,
        questionCount: number
    ) => {
        Alert.alert(
            'Kaynagi Sil',
            `"${sourceTitle}" silinecek.\n\nBu islem geri alinamaz.\nSilinecek veri: ${topicCount} konu, ${questionCount} soru ve bu sorulara ait log kayitlari.`,
            [
                {
                    text: 'Vazgec',
                    style: 'cancel',
                },
                {
                    text: 'Sil',
                    style: 'destructive',
                    onPress: () => {
                        void (async () => {
                            setDeletingSourceId(sourceId);
                            setActionInfo(null);
                            setActionError(null);

                            try {
                                await deleteSource(sourceId);
                                setActionInfo('Kaynak basariyla silindi.');
                            } catch (deleteError) {
                                setActionError(
                                    deleteError instanceof Error
                                        ? deleteError.message
                                        : 'Kaynak silinirken hata olustu.'
                                );
                            } finally {
                                setDeletingSourceId(null);
                            }
                        })();
                    },
                },
            ]
        );
    };

    return (
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
            <View style={styles.heroCard}>
                <View style={styles.heroTopRow}>
                    <View style={styles.heroIconWrap}>
                        <Text style={styles.heroIconText}>K</Text>
                    </View>
                    <Text style={styles.heroBadge}>Kaynak Arsivi</Text>
                </View>
                <Text style={styles.title}>Kaynaklarini Duzenle</Text>
                <Text style={styles.description}>
                    Tum kaynaklarin topic ve soru ozetleriyle burada. Hata eklenen kaynagi bu
                    listeden silebilirsin.
                </Text>
            </View>

            <AnimatedCard style={styles.card} delayMs={20} resetKey="sources-list-card">
                <Text style={styles.sectionTitle}>Kaynak Listesi</Text>
                <View style={styles.hintCard}>
                    <Text style={styles.hintTitle}>Silme Notu</Text>
                    <Text style={styles.hintText}>
                        Bir kaynak silindiginde bagli konu, soru ve gecmis loglar kalici olarak temizlenir.
                    </Text>
                </View>
                <TextInput
                    value={searchText}
                    onChangeText={setSearchText}
                    placeholder="Kaynak ara (ad veya mod)"
                    style={styles.searchInput}
                />
                <Text style={styles.filterMetaText}>
                    Gosterilen: {filteredSources.length} / {sources.length}
                </Text>
                <Pressable
                    style={({ pressed }) => [
                        styles.secondaryButton,
                        pressed ? styles.secondaryButtonPressed : null,
                        isLoading ? styles.buttonDisabled : null,
                    ]}
                    onPress={() => void fetchSources()}
                    disabled={isLoading}
                >
                    <Text style={styles.secondaryGlyph}>R</Text>
                    <Text style={styles.secondaryButtonText}>Kaynak Listesini Yenile</Text>
                </Pressable>
                {isLoading ? <SkeletonCard height={96} /> : null}
                {isLoadingSourceStats ? (
                    <Text style={styles.sourceMeta}>Konu ve soru ozetleri yukleniyor...</Text>
                ) : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                {actionInfo ? <Text style={styles.infoText}>{actionInfo}</Text> : null}
                {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

                {!isLoading && sources.length === 0 ? (
                    <Text style={styles.emptyText}>Ilk kaynagini ekleyerek basla ✨</Text>
                ) : null}

                {!isLoading && sources.length > 0 && filteredSources.length === 0 ? (
                    <Text style={styles.emptyText}>Aramaya uyan kaynak bulunamadi.</Text>
                ) : null}

                {filteredSources.map((source, index) => (
                    <AnimatedCard
                        key={source.id}
                        style={styles.sourceRow}
                        delayMs={Math.min(240, index * 40)}
                        resetKey={source.id}
                    >
                        <View style={styles.sourceInfo}>
                            <View style={styles.sourceTopRow}>
                                <Text style={styles.sourceTitle}>{source.title}</Text>
                                <Text style={styles.dateBadge}>
                                    {source.created_at
                                        ? new Date(source.created_at).toLocaleDateString('tr-TR')
                                        : '-'}
                                </Text>
                            </View>
                            <View style={styles.sourceMetaRow}>
                                <Text style={styles.modeChip}>{getSourceModeLabel(source.source_type)}</Text>
                                <Text style={styles.metricChip}>
                                    {sourceStatsById[source.id]?.topicCount ?? 0} Konu
                                </Text>
                                <Text style={styles.metricChip}>
                                    {sourceStatsById[source.id]?.questionCount ?? 0} Soru
                                </Text>
                            </View>
                            {(sourceStatsById[source.id]?.topicQuestionBreakdown?.length ?? 0) > 0 ? (
                                <View style={styles.breakdownBox}>
                                    <Text style={styles.breakdownTitle}>Topik Dagilimi (ilk 3)</Text>
                                    {sourceStatsById[source.id]?.topicQuestionBreakdown
                                        .slice(0, 3)
                                        .map((item) => (
                                            <Text key={`${source.id}-${item.topicName}`} style={styles.sourceMeta}>
                                                {item.topicName}: {item.questionCount} soru
                                            </Text>
                                        ))}
                                </View>
                            ) : null}
                        </View>
                        <View style={styles.sourceActions}>
                            <Link href={`/quiz/${source.id}`} style={styles.actionPrimaryLink}>
                                Teste Git
                            </Link>
                            <Link href="/(tabs)/quiz" style={styles.actionSecondaryLink}>
                                Quiz Merkezi
                            </Link>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.actionDangerButton,
                                    pressed ? styles.actionDangerPressed : null,
                                    deletingSourceId === source.id ? styles.buttonDisabled : null,
                                ]}
                                onPress={() =>
                                    handleDeleteSource(
                                        source.id,
                                        source.title,
                                        sourceStatsById[source.id]?.topicCount ?? 0,
                                        sourceStatsById[source.id]?.questionCount ?? 0
                                    )
                                }
                                disabled={deletingSourceId === source.id}
                            >
                                <Text style={styles.actionDangerText}>
                                    {deletingSourceId === source.id ? 'Siliniyor...' : 'Sil'}
                                </Text>
                            </Pressable>
                        </View>
                    </AnimatedCard>
                ))}
            </AnimatedCard>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
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
    card: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.lg,
        padding: spacing.md,
        gap: 10,
        backgroundColor: colors.surface,
    },
    sectionTitle: {
        ...typography.heading,
        color: colors.textPrimary,
    },
    hintCard: {
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.primarySurface,
        paddingHorizontal: 10,
        paddingVertical: 9,
        gap: 4,
    },
    hintTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.primary,
    },
    hintText: {
        fontSize: 12,
        lineHeight: 18,
        color: colors.primary,
    },
    searchInput: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: colors.textPrimary,
        backgroundColor: colors.surface,
    },
    filterMetaText: {
        fontSize: 12,
        color: colors.textMuted,
    },
    secondaryButton: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: 10,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: colors.surface,
    },
    secondaryButtonText: {
        color: colors.textPrimary,
        fontSize: 14,
        fontWeight: '700',
    },
    secondaryGlyph: {
        color: colors.textMuted,
        fontSize: 11,
        fontWeight: '700',
    },
    secondaryButtonPressed: {
        backgroundColor: colors.primarySurface,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    emptyText: {
        color: colors.textMuted,
        fontSize: 14,
    },
    sourceRow: {
        flexDirection: 'column',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        padding: 10,
        gap: 10,
        backgroundColor: colors.surface,
    },
    sourceInfo: {
        flex: 1,
        gap: 4,
    },
    sourceTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
    },
    sourceTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.textPrimary,
        flex: 1,
    },
    dateBadge: {
        borderRadius: 999,
        backgroundColor: colors.primarySurface,
        color: colors.textSecondary,
        fontSize: 11,
        fontWeight: '700',
        paddingHorizontal: 8,
        paddingVertical: 4,
        overflow: 'hidden',
    },
    sourceMeta: {
        fontSize: 13,
        color: colors.textMuted,
    },
    sourceMetaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    breakdownBox: {
        marginTop: 4,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.primarySurface,
        paddingHorizontal: 10,
        paddingVertical: 8,
        gap: 4,
    },
    breakdownTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textSecondary,
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
    sourceActions: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
    },
    actionPrimaryLink: {
        borderRadius: radius.sm,
        backgroundColor: colors.primary,
        color: colors.surface,
        fontSize: 14,
        fontWeight: '700',
        paddingHorizontal: 12,
        paddingVertical: 8,
        overflow: 'hidden',
    },
    actionSecondaryLink: {
        borderRadius: radius.sm,
        backgroundColor: colors.primarySurface,
        color: colors.primary,
        fontSize: 13,
        fontWeight: '700',
        paddingHorizontal: 12,
        paddingVertical: 8,
        overflow: 'hidden',
    },
    actionDangerButton: {
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.error,
        backgroundColor: colors.errorSurface,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    actionDangerPressed: {
        backgroundColor: colors.errorSurface,
    },
    actionDangerText: {
        color: colors.error,
        fontSize: 13,
        fontWeight: '700',
    },
    errorText: {
        color: colors.error,
        fontSize: 14,
    },
    infoText: {
        color: colors.primary,
        fontSize: 14,
    },
});
