import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { AnimatedCard } from '../../src/components/AnimatedCard';
import { AppHeader } from '../../src/components/AppHeader';
import * as Haptics from 'expo-haptics';
import { SkeletonCard } from '../../src/components/SkeletonCard';
import { useSources } from '../../src/hooks/useSources';
import { supabase } from '../../src/services/supabase';
import { palette, radius, spacing, uiType } from '../../src/theme/tokens';

const COLLAPSED_TOPIC_COUNT = 3;

interface SourceStats {
    topicCount: number;
    questionCount: number;
    topicQuestionBreakdown: Array<{ topicName: string; questionCount: number }>;
}

function getSourceModeLabel(value: string): string {
    if (value === 'hybrid') {
        return 'Hibrit';
    }
    if (value === 'questions-only') {
        return 'Soru Bankası';
    }
    if (value === 'topics-only') {
        return 'Topic';
    }
    if (value === 'yds') {
        return 'YDS';
    }
    if (value === 'custom') {
        return 'Özel';
    }

    return value;
}

export default function SourcesListScreen() {
    const router = useRouter();
    const { sources, isLoading, error, fetchSources, deleteSource } = useSources();
    const [searchText, setSearchText] = useState('');
    const [isLoadingSourceStats, setIsLoadingSourceStats] = useState(false);
    const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
    const [actionInfo, setActionInfo] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [sourceStatsById, setSourceStatsById] = useState<Record<string, SourceStats>>({});
    const [expandedTopicSourceIds, setExpandedTopicSourceIds] = useState<string[]>([]);

    const toggleTopicList = (targetSourceId: string) => {
        setExpandedTopicSourceIds((previous) =>
            previous.includes(targetSourceId)
                ? previous.filter((id) => id !== targetSourceId)
                : [...previous, targetSourceId]
        );
    };

    const normalizedSearchText = searchText.trim().toLocaleLowerCase('tr-TR');
    const filteredSources = useMemo(
        () =>
            sources.filter((source) => {
                if (!normalizedSearchText) {
                    return true;
                }

                const title = source.title.toLocaleLowerCase('tr-TR');
                const modeLabel = getSourceModeLabel(source.source_type).toLocaleLowerCase(
                    'tr-TR'
                );
                return (
                    title.includes(normalizedSearchText) ||
                    modeLabel.includes(normalizedSearchText)
                );
            }),
        [sources, normalizedSearchText]
    );

    // Sekmeye her donuste liste tazelensin.
    useFocusEffect(
        useCallback(() => {
            void fetchSources();
        }, [fetchSources])
    );

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

            const nextStats: Record<string, SourceStats> = {};
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
            'Kaynağı Sil',
            `"${sourceTitle}" silinecek.\n\nBu işlem geri alınamaz.\nSilinecek veri: ${topicCount} konu, ${questionCount} soru ve bu sorulara ait log kayıtları.`,
            [
                { text: 'Vazgeç', style: 'cancel' },
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
                                setActionInfo('Kaynak başarıyla silindi.');
                            } catch (deleteError) {
                                setActionError(
                                    deleteError instanceof Error
                                        ? deleteError.message
                                        : 'Kaynak silinirken hata oluştu.'
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
        <View style={styles.screen}>
            <AppHeader
                rightAction={{
                    icon: 'add',
                    onPress: () => router.push('/add-source'),
                }}
            />

            <ScrollView
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    <RefreshControl
                        refreshing={isLoading}
                        onRefresh={() => void fetchSources()}
                        tintColor={palette.indigo600}
                        colors={[palette.indigo600]}
                    />
                }
            >
                <View style={styles.pageHead}>
                    <Text style={styles.pageTitle}>Kaynak Kütüphanesi</Text>
                    <Text style={styles.pageSubtitle}>
                        İşlenmiş içeriklerin, konu dağılımları ve üretilen soru bankaları
                    </Text>
                </View>

                <View style={styles.searchWrap}>
                    <Ionicons name="search" size={17} color={palette.textMuted} />
                    <TextInput
                        value={searchText}
                        onChangeText={setSearchText}
                        placeholder="Kaynaklarda ara..."
                        placeholderTextColor={palette.textMuted}
                        style={styles.searchInput}
                    />
                    {searchText.length > 0 ? (
                        <Pressable onPress={() => setSearchText('')} hitSlop={8}>
                            <Ionicons
                                name="close-circle"
                                size={17}
                                color={palette.textMuted}
                            />
                        </Pressable>
                    ) : null}
                </View>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                {actionInfo ? <Text style={styles.infoText}>{actionInfo}</Text> : null}
                {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

                {isLoading ? <SkeletonCard height={120} /> : null}

                {!isLoading && sources.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Ionicons
                            name="documents-outline"
                            size={26}
                            color={palette.textMuted}
                        />
                        <Text style={styles.emptyText}>Henüz kaynak bulunmuyor</Text>
                        <Text style={styles.emptyHint}>
                            Bir dosya yükleyip ilk soru bankanı oluşturarak başla.
                        </Text>
                        <Pressable
                            onPress={() => {
                                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                router.push('/add-source');
                            }}
                            style={({ pressed }) => [
                                styles.emptyCta,
                                pressed ? styles.pressed : null,
                            ]}
                        >
                            <Ionicons name="add" size={16} color={palette.onDarkPrimary} />
                            <Text style={styles.emptyCtaText}>Kaynak Ekle</Text>
                        </Pressable>
                    </View>
                ) : null}

                {!isLoading && sources.length > 0 && filteredSources.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>Aramaya uyan kaynak bulunamadı</Text>
                    </View>
                ) : null}

                {filteredSources.map((source, index) => {
                    const stats = sourceStatsById[source.id];
                    const isDeleting = deletingSourceId === source.id;

                    return (
                        <AnimatedCard
                            key={source.id}
                            style={styles.sourceCard}
                            delayMs={Math.min(240, index * 40)}
                            resetKey={source.id}
                        >
                            <View style={styles.cardTopRow}>
                                <View style={styles.docIcon}>
                                    <Ionicons
                                        name="document-text-outline"
                                        size={19}
                                        color={palette.indigo600}
                                    />
                                </View>

                                <View style={styles.cardTitleBlock}>
                                    <View style={styles.badgeRow}>
                                        <View style={styles.typeBadge}>
                                            <Text style={styles.typeBadgeText}>
                                                {getSourceModeLabel(
                                                    source.source_type
                                                ).toLocaleUpperCase('tr-TR')}
                                            </Text>
                                        </View>
                                        <Text style={styles.dateText}>
                                            {source.created_at
                                                ? new Date(source.created_at).toLocaleDateString(
                                                      'tr-TR'
                                                  )
                                                : '—'}
                                        </Text>
                                    </View>
                                    <Text style={styles.sourceTitle} numberOfLines={2}>
                                        {source.title}
                                    </Text>
                                </View>
                            </View>

                            {source.content_text ? (
                                <Text style={styles.sourcePreview} numberOfLines={2}>
                                    {source.content_text.trim()}
                                </Text>
                            ) : null}

                            {(stats?.topicQuestionBreakdown?.length ?? 0) > 0 ? (
                                <View style={styles.breakdownBox}>
                                    {/* Onceden yalnizca ilk 3 konu gosteriliyordu;
                                        8 konulu bir kaynakta gerisi gorunmuyordu. */}
                                    {(expandedTopicSourceIds.includes(source.id)
                                        ? stats?.topicQuestionBreakdown ?? []
                                        : (stats?.topicQuestionBreakdown ?? []).slice(
                                              0,
                                              COLLAPSED_TOPIC_COUNT
                                          )
                                    ).map((item) => (
                                        <View
                                            key={`${source.id}-${item.topicName}`}
                                            style={styles.breakdownRow}
                                        >
                                            <Text
                                                style={styles.breakdownName}
                                                numberOfLines={2}
                                            >
                                                {item.topicName}
                                            </Text>
                                            <Text style={styles.breakdownCount}>
                                                {item.questionCount} soru
                                            </Text>
                                        </View>
                                    ))}

                                    {(stats?.topicQuestionBreakdown?.length ?? 0) >
                                    COLLAPSED_TOPIC_COUNT ? (
                                        <Pressable
                                            onPress={() => toggleTopicList(source.id)}
                                            style={({ pressed }) => [
                                                styles.breakdownToggle,
                                                pressed ? styles.pressed : null,
                                            ]}
                                            hitSlop={6}
                                        >
                                            <Text style={styles.breakdownToggleText}>
                                                {expandedTopicSourceIds.includes(source.id)
                                                    ? 'Konuları gizle'
                                                    : `Tüm ${stats?.topicQuestionBreakdown.length} konuyu göster`}
                                            </Text>
                                            <Ionicons
                                                name={
                                                    expandedTopicSourceIds.includes(source.id)
                                                        ? 'chevron-up'
                                                        : 'chevron-down'
                                                }
                                                size={14}
                                                color={palette.indigo600}
                                            />
                                        </Pressable>
                                    ) : null}
                                </View>
                            ) : null}

                            <View style={styles.divider} />

                            <View style={styles.cardFooter}>
                                <View style={styles.metricGroup}>
                                    <View style={styles.metric}>
                                        <Ionicons
                                            name="layers-outline"
                                            size={14}
                                            color={palette.textMuted}
                                        />
                                        <Text style={styles.metricText}>
                                            {stats?.topicCount ?? 0} Konu
                                        </Text>
                                    </View>
                                    <View style={styles.metric}>
                                        <Ionicons
                                            name="help-circle-outline"
                                            size={14}
                                            color={palette.textMuted}
                                        />
                                        <Text style={styles.metricText}>
                                            {stats?.questionCount ?? 0} Soru
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.footerActions}>
                                    <Pressable
                                        style={({ pressed }) => [
                                            styles.deleteButton,
                                            pressed ? styles.pressed : null,
                                            isDeleting ? styles.disabled : null,
                                        ]}
                                        onPress={() =>
                                            handleDeleteSource(
                                                source.id,
                                                source.title,
                                                stats?.topicCount ?? 0,
                                                stats?.questionCount ?? 0
                                            )
                                        }
                                        disabled={isDeleting}
                                        hitSlop={6}
                                    >
                                        <Ionicons
                                            name="trash-outline"
                                            size={16}
                                            color={palette.error}
                                        />
                                    </Pressable>

                                    {/* Link asChild kullanilmiyor: cocuga kendi
                                        proplarini gecirirken `style`i undefined ile
                                        eziyor, buton arka planini kaybedip beyaz
                                        kartta gorunmez ama basilabilir kaliyordu. */}
                                    <Pressable
                                        onPress={() => router.push(`/quiz/${source.id}`)}
                                        style={({ pressed }) => [
                                            styles.primaryButton,
                                            pressed ? styles.pressed : null,
                                        ]}
                                    >
                                        <Ionicons
                                            name="list-outline"
                                            size={13}
                                            color={palette.onDarkPrimary}
                                        />
                                        <Text style={styles.primaryButtonText}>Konular</Text>
                                    </Pressable>
                                </View>
                            </View>
                        </AnimatedCard>
                    );
                })}

                {isLoadingSourceStats ? (
                    <Text style={styles.footnote}>Konu ve soru özetleri yükleniyor...</Text>
                ) : null}
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
    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        backgroundColor: palette.cardBg,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 11,
        fontSize: 14,
        color: palette.textPrimary,
    },
    sourceCard: {
        backgroundColor: palette.cardBg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        padding: spacing.md,
        gap: spacing.sm,
    },
    cardTopRow: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    docIcon: {
        width: 38,
        height: 38,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.indigoSurface,
    },
    cardTitleBlock: {
        flex: 1,
    },
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        marginBottom: spacing.xs,
    },
    typeBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.sm,
        backgroundColor: palette.indigoSurface,
    },
    typeBadgeText: {
        color: palette.indigo600,
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    dateText: {
        ...uiType.small,
        color: palette.textMuted,
    },
    sourceTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    sourcePreview: {
        ...uiType.body,
        color: palette.textSecondary,
    },
    breakdownToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingTop: 8,
    },
    breakdownToggleText: {
        color: palette.indigo600,
        fontSize: 12,
        fontWeight: '700',
    },
    breakdownBox: {
        borderRadius: radius.md,
        backgroundColor: palette.pageBg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: spacing.xs,
    },
    breakdownRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: spacing.sm,
    },
    breakdownName: {
        ...uiType.small,
        color: palette.textSecondary,
        flex: 1,
    },
    breakdownCount: {
        ...uiType.small,
        color: palette.textMuted,
        fontWeight: '600',
    },
    divider: {
        height: 1,
        backgroundColor: palette.cardBorder,
    },
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
    },
    metricGroup: {
        flexDirection: 'row',
        gap: spacing.md,
        flexShrink: 1,
    },
    metric: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    metricText: {
        ...uiType.small,
        color: palette.textMuted,
        fontWeight: '600',
    },
    footerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    deleteButton: {
        width: 32,
        height: 32,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: palette.cardBorder,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: palette.indigo600,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: radius.sm,
    },
    primaryButtonText: {
        color: palette.onDarkPrimary,
        fontSize: 13,
        fontWeight: '700',
    },
    emptyCard: {
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
        backgroundColor: palette.cardBg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
    },
    emptyText: {
        fontSize: 15,
        fontWeight: '700',
        color: palette.textSecondary,
    },
    emptyHint: {
        ...uiType.body,
        color: palette.textMuted,
        textAlign: 'center',
    },
    emptyCta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        marginTop: spacing.sm,
        paddingVertical: 10,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.pill,
        backgroundColor: palette.indigo600,
    },
    emptyCtaText: {
        color: palette.onDarkPrimary,
        fontSize: 13,
        fontWeight: '700',
    },
    footnote: {
        ...uiType.small,
        color: palette.textMuted,
        textAlign: 'center',
    },
    pressed: {
        opacity: 0.7,
    },
    disabled: {
        opacity: 0.5,
    },
    errorText: {
        color: palette.error,
        fontSize: 14,
    },
    infoText: {
        color: palette.emerald500,
        fontSize: 14,
    },
});
