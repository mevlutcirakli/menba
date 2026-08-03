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

export default function QuizTabScreen() {
    const router = useRouter();
    const { sources, isLoading, error, fetchSources } = useSources();
    const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
    const [sourceStatsById, setSourceStatsById] = useState<
        Record<string, { topicCount: number; questionCount: number }>
    >({});

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

            const nextStats: Record<
                string,
                { topicCount: number; questionCount: number }
            > = {};
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

                    {sources.length > 0 ? (
                        <Pressable
                            style={({ pressed }) => [
                                styles.startButton,
                                pressed ? styles.pressed : null,
                                !selectedSourceId ? styles.startButtonDisabled : null,
                            ]}
                            disabled={!selectedSourceId}
                            onPress={() => {
                                if (selectedSourceId) {
                                    router.push(`/quiz/${selectedSourceId}`);
                                }
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
