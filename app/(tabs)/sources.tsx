import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedCard } from '../../src/components/AnimatedCard';
import { ProgressRing } from '../../src/components/ProgressRing';
import { SkeletonCard } from '../../src/components/SkeletonCard';
import { useSources } from '../../src/hooks/useSources';
import { supabase } from '../../src/services/supabase';
import { palette, radius, spacing, uiType } from '../../src/theme/tokens';

interface SourceStats {
    topicCount: number;
    questionCount: number;
    /** En az bir kez cevaplanmis soru sayisi. */
    solvedCount: number;
    /** Halkadaki yuzde: cozulen soru / toplam soru. */
    completion: number;
}

export default function SourcesListScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { sources, isLoading, error, fetchSources, deleteSource } = useSources();
    const [searchText, setSearchText] = useState('');
    const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [sourceStatsById, setSourceStatsById] = useState<Record<string, SourceStats>>({});

    const normalizedSearchText = searchText.trim().toLocaleLowerCase('tr-TR');
    const filteredSources = useMemo(
        () =>
            sources.filter((source) => {
                if (!normalizedSearchText) {
                    return true;
                }

                return source.title
                    .toLocaleLowerCase('tr-TR')
                    .includes(normalizedSearchText);
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
            const sourceIds = sources.map((source) => source.id);
            const { data: topicRows, error: topicError } = await supabase
                .from('topics')
                .select('id, source_id')
                .in('source_id', sourceIds);

            if (cancelled || topicError || !topicRows) {
                if (!cancelled) {
                    setSourceStatsById({});
                }
                return;
            }

            const sourceIdByTopicId = new Map<string, string>();
            const topicCountBySource = new Map<string, number>();
            for (const topic of topicRows) {
                sourceIdByTopicId.set(topic.id, topic.source_id);
                topicCountBySource.set(
                    topic.source_id,
                    (topicCountBySource.get(topic.source_id) ?? 0) + 1
                );
            }

            const questionCountBySource = new Map<string, number>();
            const solvedCountBySource = new Map<string, number>();

            if (topicRows.length > 0) {
                const topicIds = topicRows.map((topic) => topic.id);

                const { data: questionRows } = await supabase
                    .from('questions')
                    .select('id, topic_id')
                    .in('topic_id', topicIds);

                if (cancelled) {
                    return;
                }

                const sourceIdByQuestionId = new Map<string, string>();
                for (const question of questionRows ?? []) {
                    const parentSourceId = sourceIdByTopicId.get(question.topic_id);
                    if (!parentSourceId) {
                        continue;
                    }

                    sourceIdByQuestionId.set(question.id, parentSourceId);
                    questionCountBySource.set(
                        parentSourceId,
                        (questionCountBySource.get(parentSourceId) ?? 0) + 1
                    );
                }

                // Halka "cozulen soru / toplam soru" gosteriyor; ayni soru
                // birden fazla kez cevaplanmis olabilecegi icin log'lar
                // benzersiz soru kimligine indirgeniyor.
                const questionIds = Array.from(sourceIdByQuestionId.keys());
                if (questionIds.length > 0) {
                    const { data: logRows } = await supabase
                        .from('question_logs')
                        .select('question_id')
                        .in('question_id', questionIds);

                    if (cancelled) {
                        return;
                    }

                    const solvedQuestionIds = new Set(
                        (logRows ?? []).map((row) => row.question_id)
                    );

                    for (const questionId of solvedQuestionIds) {
                        const parentSourceId = sourceIdByQuestionId.get(questionId);
                        if (!parentSourceId) {
                            continue;
                        }

                        solvedCountBySource.set(
                            parentSourceId,
                            (solvedCountBySource.get(parentSourceId) ?? 0) + 1
                        );
                    }
                }
            }

            if (cancelled) {
                return;
            }

            const nextStats: Record<string, SourceStats> = {};
            for (const source of sources) {
                const questionCount = questionCountBySource.get(source.id) ?? 0;
                const solvedCount = solvedCountBySource.get(source.id) ?? 0;

                nextStats[source.id] = {
                    topicCount: topicCountBySource.get(source.id) ?? 0,
                    questionCount,
                    solvedCount,
                    completion:
                        questionCount === 0
                            ? 0
                            : Math.round((solvedCount / questionCount) * 100),
                };
            }

            setSourceStatsById(nextStats);
        };

        void loadSourceStats();

        return () => {
            cancelled = true;
        };
    }, [sources]);

    const handleDeleteSource = (sourceId: string, sourceTitle: string) => {
        const stats = sourceStatsById[sourceId];

        Alert.alert(
            'Kaynağı Sil',
            `"${sourceTitle}" silinecek.\n\nBu işlem geri alınamaz.\nSilinecek veri: ${
                stats?.topicCount ?? 0
            } konu, ${stats?.questionCount ?? 0} soru ve bu sorulara ait log kayıtları.`,
            [
                { text: 'Vazgeç', style: 'cancel' },
                {
                    text: 'Sil',
                    style: 'destructive',
                    onPress: () => {
                        void (async () => {
                            setDeletingSourceId(sourceId);
                            setActionError(null);

                            try {
                                await deleteSource(sourceId);
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

    const openAddSource = () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/add-source');
    };

    const hasNoSources = !isLoading && sources.length === 0;

    return (
        <View style={styles.screen}>
            <StatusBar style="dark" />

            <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
                <Text style={styles.pageTitle}>Kaynaklarım</Text>
                <Pressable
                    onPress={openAddSource}
                    style={({ pressed }) => [styles.addButton, pressed ? styles.pressed : null]}
                    hitSlop={8}
                >
                    <Ionicons name="add" size={22} color={palette.onDarkPrimary} />
                </Pressable>
            </View>

            <ScrollView
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    <RefreshControl
                        refreshing={isLoading}
                        onRefresh={() => void fetchSources()}
                        tintColor={palette.accent}
                        colors={[palette.accent]}
                    />
                }
            >
                {!hasNoSources ? (
                    <View style={styles.searchWrap}>
                        <Ionicons name="search" size={17} color={palette.textMuted} />
                        <TextInput
                            value={searchText}
                            onChangeText={setSearchText}
                            placeholder="Kaynaklarında ara..."
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
                ) : null}

                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

                {isLoading ? <SkeletonCard height={96} /> : null}

                {hasNoSources ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIcon}>
                            <Ionicons
                                name="library-outline"
                                size={44}
                                color={palette.accent}
                            />
                        </View>
                        <Text style={styles.emptyTitle}>Henüz kaynak eklemediniz</Text>
                        <Text style={styles.emptyHint}>
                            PDF veya metin dosyası yükleyerek AI ile soru bankası oluşturun
                        </Text>
                        <Pressable
                            onPress={openAddSource}
                            style={({ pressed }) => [
                                styles.emptyCta,
                                pressed ? styles.pressed : null,
                            ]}
                        >
                            <Ionicons
                                name="cloud-upload-outline"
                                size={17}
                                color={palette.onDarkPrimary}
                            />
                            <Text style={styles.emptyCtaText}>İlk Kaynağı Ekle</Text>
                        </Pressable>
                    </View>
                ) : null}

                {!isLoading && sources.length > 0 && filteredSources.length === 0 ? (
                    <Text style={styles.noMatchText}>Aramaya uyan kaynak bulunamadı</Text>
                ) : null}

                {filteredSources.map((source, index) => {
                    const stats = sourceStatsById[source.id];
                    const isDeleting = deletingSourceId === source.id;

                    return (
                        <AnimatedCard
                            key={source.id}
                            delayMs={Math.min(240, index * 40)}
                            resetKey={source.id}
                        >
                            <Pressable
                                onPress={() => router.push(`/quiz/${source.id}`)}
                                disabled={isDeleting}
                                style={({ pressed }) => [
                                    styles.sourceCard,
                                    pressed ? styles.cardPressed : null,
                                    isDeleting ? styles.disabled : null,
                                ]}
                            >
                                <View style={styles.sourceText}>
                                    <Text style={styles.sourceTitle} numberOfLines={2}>
                                        {source.title}
                                    </Text>
                                    <Text style={styles.sourceMeta}>
                                        {stats?.topicCount ?? 0} konu • {stats?.questionCount ?? 0}{' '}
                                        soru
                                    </Text>
                                </View>

                                <ProgressRing value={stats?.completion ?? 0} />

                                <Pressable
                                    onPress={() =>
                                        handleDeleteSource(source.id, source.title)
                                    }
                                    disabled={isDeleting}
                                    style={({ pressed }) => [
                                        styles.deleteButton,
                                        pressed ? styles.deleteButtonPressed : null,
                                    ]}
                                    hitSlop={8}
                                >
                                    <Ionicons
                                        name="trash-outline"
                                        size={17}
                                        color={palette.textMuted}
                                    />
                                </Pressable>
                            </Pressable>
                        </AnimatedCard>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: palette.pageBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.md,
    },
    pageTitle: {
        flex: 1,
        ...uiType.pageTitle,
        color: palette.textPrimary,
    },
    addButton: {
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.primary,
    },
    container: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xl,
        gap: spacing.sm,
    },
    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        marginBottom: spacing.xs,
        borderRadius: radius.md,
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
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        backgroundColor: palette.cardBg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
    },
    cardPressed: {
        backgroundColor: palette.primarySurface,
    },
    deleteButton: {
        width: 34,
        height: 34,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteButtonPressed: {
        backgroundColor: palette.dangerSurface,
    },
    sourceText: {
        flex: 1,
    },
    sourceTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    sourceMeta: {
        ...uiType.small,
        color: palette.textMuted,
        marginTop: 3,
    },
    emptyState: {
        alignItems: 'center',
        gap: spacing.sm,
        paddingTop: spacing.xl * 2,
    },
    emptyIcon: {
        width: 128,
        height: 128,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.primarySurface,
        marginBottom: spacing.lg,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: palette.textPrimary,
    },
    emptyHint: {
        ...uiType.body,
        color: palette.textMuted,
        textAlign: 'center',
        paddingHorizontal: spacing.md,
    },
    emptyCta: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        alignSelf: 'stretch',
        marginTop: spacing.lg,
        paddingVertical: 15,
        borderRadius: radius.md,
        backgroundColor: palette.primary,
    },
    emptyCtaText: {
        color: palette.onDarkPrimary,
        fontSize: 15,
        fontWeight: '700',
    },
    noMatchText: {
        ...uiType.body,
        color: palette.textMuted,
        textAlign: 'center',
        paddingVertical: spacing.lg,
    },
    pressed: {
        opacity: 0.7,
    },
    disabled: {
        opacity: 0.5,
    },
    errorText: {
        color: palette.danger,
        fontSize: 13,
    },
});
