import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { useSources } from '../../src/hooks/useSources';
import { supabase } from '../../src/services/supabase';
import { gradients, palette, radius, spacing, uiType } from '../../src/theme/tokens';

interface TopicOption {
    id: string;
    name: string;
    questionCount: number;
}

interface SourceStats {
    topicCount: number;
    questionCount: number;
    topics: TopicOption[];
}

export default function QuizTabScreen() {
    const router = useRouter();
    const { sources, isLoading, error, fetchSources } = useSources();
    const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
    // null = "Tum Konular"
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
    const [sourceStatsById, setSourceStatsById] = useState<Record<string, SourceStats>>({});

    const selectedStats = selectedSourceId ? sourceStatsById[selectedSourceId] : undefined;
    const topicOptions = selectedStats?.topics ?? [];

    // Soru sayisi secilmiyor: secilen konudaki (ya da "Tum Konular" ise
    // kaynaktaki) hazir sorularin tamami tek testte cozuluyor.
    const selectedTopic = selectedTopicId
        ? topicOptions.find((topic) => topic.id === selectedTopicId)
        : undefined;
    const questionCount = selectedTopicId
        ? selectedTopic?.questionCount ?? 0
        : selectedStats?.questionCount ?? 0;

    // Kaynak degisince konu filtresi sifirlanir; onceki kaynagin konusu
    // yeni kaynakta yok.
    useEffect(() => {
        setSelectedTopicId(null);
    }, [selectedSourceId]);

    useFocusEffect(
        useCallback(() => {
            void fetchSources();
        }, [fetchSources])
    );

    // Liste degisince secili kaynak artik yoksa secimi birak.
    useEffect(() => {
        if (
            selectedSourceId &&
            !sources.some((source) => source.id === selectedSourceId)
        ) {
            setSelectedSourceId(null);
        }
    }, [sources, selectedSourceId]);

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
                .select('id, source_id, name')
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
            const questionCountByTopicId = new Map<string, number>();
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

                    questionCountByTopicId.set(
                        question.topic_id,
                        (questionCountByTopicId.get(question.topic_id) ?? 0) + 1
                    );

                    questionCountBySource.set(
                        sourceId,
                        (questionCountBySource.get(sourceId) ?? 0) + 1
                    );
                }
            }

            if (cancelled) {
                return;
            }

            const nextStats: Record<string, SourceStats> = {};
            for (const source of sources) {
                nextStats[source.id] = {
                    topicCount: topicCountBySource.get(source.id) ?? 0,
                    questionCount: questionCountBySource.get(source.id) ?? 0,
                    topics: topicRows
                        .filter((topic) => topic.source_id === source.id)
                        .map((topic) => ({
                            id: topic.id,
                            name: topic.name,
                            questionCount: questionCountByTopicId.get(topic.id) ?? 0,
                        }))
                        .sort((a, b) => b.questionCount - a.questionCount),
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
        <View style={styles.screen}>
            <AppHeader />

            <ScrollView
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={isLoading}
                        onRefresh={() => void fetchSources()}
                        tintColor={palette.indigo600}
                        colors={[palette.indigo600]}
                    />
                }
            >
                <LinearGradient
                    colors={gradients.hero}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.hero}
                >
                    <Text style={styles.heroEyebrow}>PRATİK & SINAV SİMÜLATÖRÜ</Text>
                    <Text style={styles.heroTitle}>Özelleştirilmiş Test Başlat</Text>
                    <Text style={styles.heroDescription}>
                        Test etmek istediğin kaynağı seç. Sonraki adımda konu başlıklarını
                        belirleyip adaptif pratik moduna başlayabilirsin.
                    </Text>
                </LinearGradient>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <View style={styles.panel}>
                    <Text style={styles.sectionLabel}>1. TEST EDİLECEK KAYNAK</Text>

                    {isLoading ? <SkeletonCard height={80} /> : null}

                    {!isLoading && sources.length === 0 ? (
                        <View style={styles.emptyBox}>
                            <Ionicons
                                name="albums-outline"
                                size={24}
                                color={palette.textMuted}
                            />
                            <Text style={styles.emptyTitle}>
                                Test çözülecek kaynak bulunamadı
                            </Text>
                            <Text style={styles.emptyHint}>
                                Önce &apos;Ekle&apos; sekmesinden bir kaynak yükle.
                            </Text>
                        </View>
                    ) : null}

                    {sources.map((source, index) => {
                        const stats = sourceStatsById[source.id];
                        const isSelected = selectedSourceId === source.id;

                        return (
                            <AnimatedCard
                                key={source.id}
                                delayMs={Math.min(120, index * 30)}
                                resetKey={source.id}
                            >
                                <Pressable
                                    style={[
                                        styles.sourceOption,
                                        isSelected ? styles.sourceOptionSelected : null,
                                    ]}
                                    onPress={() => setSelectedSourceId(source.id)}
                                >
                                    <View style={styles.sourceOptionText}>
                                        <Text
                                            style={styles.sourceOptionTitle}
                                            numberOfLines={2}
                                        >
                                            {source.title}
                                        </Text>
                                        <Text style={styles.sourceOptionMeta}>
                                            {stats?.topicCount ?? 0} Konu •{' '}
                                            {stats?.questionCount ?? 0} Soru
                                        </Text>
                                    </View>

                                    {isSelected ? (
                                        <Ionicons
                                            name="checkmark-circle"
                                            size={22}
                                            color={palette.indigo600}
                                        />
                                    ) : null}
                                </Pressable>
                            </AnimatedCard>
                        );
                    })}

                    {/* Konu filtresi test baslamadan ONCE burada; secilen
                        kaynagin konulari dinamik geliyor. */}
                    {selectedSourceId ? (
                        <>
                            <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
                                2. KONU FİLTRESİ
                            </Text>

                            {topicOptions.length === 0 ? (
                                <Text style={styles.emptyHint}>
                                    Bu kaynakta henüz konu yok.
                                </Text>
                            ) : (
                                <View style={styles.pillRow}>
                                    <Pressable
                                        onPress={() => setSelectedTopicId(null)}
                                        style={({ pressed }) => [
                                            styles.pill,
                                            selectedTopicId === null ? styles.pillActive : null,
                                            pressed ? styles.pressed : null,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.pillText,
                                                selectedTopicId === null
                                                    ? styles.pillTextActive
                                                    : null,
                                            ]}
                                        >
                                            Tüm Konular ·{' '}
                                            {selectedStats?.questionCount ?? 0} soru
                                        </Text>
                                    </Pressable>

                                    {topicOptions.map((topic) => {
                                        const isActive = selectedTopicId === topic.id;

                                        return (
                                            <Pressable
                                                key={topic.id}
                                                onPress={() => setSelectedTopicId(topic.id)}
                                                style={({ pressed }) => [
                                                    styles.pill,
                                                    isActive ? styles.pillActive : null,
                                                    pressed ? styles.pressed : null,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.pillText,
                                                        isActive ? styles.pillTextActive : null,
                                                    ]}
                                                    numberOfLines={1}
                                                >
                                                    {topic.name} · {topic.questionCount} soru
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            )}

                            {topicOptions.length > 0 ? (
                                <View style={styles.summaryBox}>
                                    <Ionicons
                                        name="list-outline"
                                        size={16}
                                        color={palette.indigo600}
                                    />
                                    <Text style={styles.summaryText}>
                                        {questionCount > 0
                                            ? `Bu testte ${questionCount} soru çözeceksin.`
                                            : 'Bu seçimde hazır soru yok.'}
                                    </Text>
                                </View>
                            ) : null}
                        </>
                    ) : null}

                    {sources.length > 0 ? (
                        <Pressable
                            style={({ pressed }) => [
                                styles.startButton,
                                pressed ? styles.pressed : null,
                                !selectedSourceId || questionCount === 0
                                    ? styles.startButtonDisabled
                                    : null,
                            ]}
                            disabled={!selectedSourceId || questionCount === 0}
                            onPress={() => {
                                if (!selectedSourceId || questionCount === 0) {
                                    return;
                                }

                                // Konu ve test ayarlari akisa parametre olarak
                                // gecer; ic ekranda tekrar secim yok.
                                router.push({
                                    pathname: '/quiz/[sourceId]/play',
                                    params: {
                                        sourceId: selectedSourceId,
                                        ...(selectedTopicId ? { topicId: selectedTopicId } : {}),
                                        count: String(questionCount),
                                    },
                                });
                            }}
                        >
                            <Ionicons name="play" size={15} color={palette.onDarkPrimary} />
                            <Text style={styles.startButtonText}>Testi Şimdi Başlat</Text>
                        </Pressable>
                    ) : null}
                </View>
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
    hero: {
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: spacing.sm,
    },
    heroEyebrow: {
        color: palette.indigo300,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.9,
    },
    heroTitle: {
        color: palette.onDarkPrimary,
        fontSize: 24,
        fontWeight: '800',
    },
    heroDescription: {
        color: palette.onDarkMuted,
        fontSize: 14,
        lineHeight: 21,
    },
    panel: {
        backgroundColor: palette.cardBg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        padding: spacing.md,
        gap: spacing.sm,
    },
    sectionLabel: {
        ...uiType.statLabel,
        color: palette.textSecondary,
        marginBottom: spacing.xs,
    },
    sectionLabelSpaced: {
        marginTop: spacing.md,
    },
    pillRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        backgroundColor: palette.cardBg,
        maxWidth: '100%',
    },
    pillActive: {
        borderColor: palette.indigo600,
        backgroundColor: palette.indigo600,
    },
    pillText: {
        fontSize: 13,
        fontWeight: '700',
        color: palette.textSecondary,
        flexShrink: 1,
    },
    pillTextActive: {
        color: palette.onDarkPrimary,
    },
    summaryBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginTop: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.indigo500,
        backgroundColor: palette.indigoSurface,
    },
    summaryText: {
        flex: 1,
        fontSize: 13,
        fontWeight: '700',
        color: palette.textSecondary,
    },
    sourceOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        backgroundColor: palette.cardBg,
    },
    sourceOptionSelected: {
        borderColor: palette.indigo500,
        backgroundColor: palette.indigoSurface,
    },
    sourceOptionText: {
        flex: 1,
    },
    sourceOptionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    sourceOptionMeta: {
        ...uiType.small,
        color: palette.textMuted,
        marginTop: 3,
    },
    startButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        marginTop: spacing.sm,
        paddingVertical: 13,
        borderRadius: radius.pill,
        backgroundColor: palette.indigo600,
    },
    startButtonDisabled: {
        backgroundColor: palette.indigo500,
        opacity: 0.45,
    },
    startButtonText: {
        color: palette.onDarkPrimary,
        fontSize: 15,
        fontWeight: '700',
    },
    emptyBox: {
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.xl,
    },
    emptyTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: palette.textSecondary,
    },
    emptyHint: {
        ...uiType.body,
        color: palette.textMuted,
        textAlign: 'center',
    },
    pressed: {
        opacity: 0.8,
    },
    errorText: {
        color: palette.error,
        fontSize: 14,
    },
});
