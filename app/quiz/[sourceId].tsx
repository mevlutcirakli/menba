import { useEffect, useMemo, useState } from 'react';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { AnimatedCard } from '../../src/components/AnimatedCard';
import { SkeletonCard } from '../../src/components/SkeletonCard';
import { useQuiz } from '../../src/hooks/useQuiz';
import { supabase } from '../../src/services/supabase';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

interface QuizUiSessionState {
    selectedTopicId: string | null;
    newTopicName: string;
}

const quizUiStateBySource = new Map<string, QuizUiSessionState>();

export default function QuizBySourceScreen() {
    const router = useRouter();
    const { sourceId } = useLocalSearchParams<{ sourceId: string }>();
    const {
        source,
        topics,
        recommendedTopicId,
        isLoading,
        error,
    } = useQuiz(sourceId);
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
    const [newTopicName, setNewTopicName] = useState('');
    const [questionCountByTopicId, setQuestionCountByTopicId] = useState<Record<string, number>>({});
    const [flowNotice, setFlowNotice] = useState<string | null>(null);
    const trimmedNewTopicName = newTopicName.trim();

    useEffect(() => {
        if (!sourceId) {
            return;
        }

        const cached = quizUiStateBySource.get(sourceId);
        if (!cached) {
            setSelectedTopicId(null);
            setNewTopicName('');
            return;
        }

        setSelectedTopicId(cached.selectedTopicId);
        setNewTopicName(cached.newTopicName);
    }, [sourceId]);

    useEffect(() => {
        if (!sourceId) {
            return;
        }

        quizUiStateBySource.set(sourceId, {
            selectedTopicId,
            newTopicName,
        });
    }, [newTopicName, selectedTopicId, sourceId]);

    const recommendedTopicName = useMemo(
        () => topics.find((topic) => topic.id === recommendedTopicId)?.name ?? null,
        [topics, recommendedTopicId]
    );

    const selectedTopicName = useMemo(
        () => topics.find((topic) => topic.id === selectedTopicId)?.name ?? null,
        [selectedTopicId, topics]
    );

    const selectedTopicQuestionCount = useMemo(() => {
        const focusTopicId = selectedTopicId ?? recommendedTopicId;
        if (!focusTopicId) {
            return 0;
        }

        return questionCountByTopicId[focusTopicId] ?? 0;
    }, [questionCountByTopicId, recommendedTopicId, selectedTopicId]);

    useEffect(() => {
        if (!recommendedTopicId) {
            return;
        }

        setSelectedTopicId((prev) => {
            if (prev && topics.some((topic) => topic.id === prev)) {
                return prev;
            }

            return recommendedTopicId;
        });
    }, [recommendedTopicId, topics]);

    useEffect(() => {
        if (flowNotice) {
            setFlowNotice(null);
        }
    }, [flowNotice, newTopicName, selectedTopicId]);

    useEffect(() => {
        if (topics.length === 0) {
            setQuestionCountByTopicId({});
            return;
        }

        let cancelled = false;
        const loadTopicQuestionCounts = async () => {
            const topicIds = topics.map((topic) => topic.id);
            const { data } = await supabase
                .from('questions')
                .select('topic_id')
                .in('topic_id', topicIds);

            if (cancelled) {
                return;
            }

            const nextCounts: Record<string, number> = {};
            for (const topic of topics) {
                nextCounts[topic.id] = 0;
            }

            for (const row of data ?? []) {
                nextCounts[row.topic_id] = (nextCounts[row.topic_id] ?? 0) + 1;
            }

            setQuestionCountByTopicId(nextCounts);
        };

        void loadTopicQuestionCounts();

        return () => {
            cancelled = true;
        };
    }, [topics]);

    const openFlow = (params: { topicId?: string; topicName?: string }) => {
        if (!sourceId) {
            return;
        }

        router.push({
            pathname: '/quiz/[sourceId]/play',
            params: {
                sourceId,
                ...(params.topicId ? { topicId: params.topicId } : {}),
                ...(params.topicName ? { topicName: params.topicName } : {}),
            },
        });
    };

    const handleOpenFlowForSelection = () => {
        if (trimmedNewTopicName) {
            setFlowNotice('Yeni konu kutusu dolu. Bu konuda soru uretmek icin alttaki butonu kullan.');
            return;
        }

        if (selectedTopicId) {
            openFlow({ topicId: selectedTopicId });
            return;
        }

        if (recommendedTopicId) {
            openFlow({ topicId: recommendedTopicId });
            return;
        }

        setFlowNotice('Lutfen bir konu secin veya yeni konu adi girin.');
    };

    const handleOpenFlowForNewTopic = () => {
        if (!trimmedNewTopicName) {
            setFlowNotice('Yeni konu olusturmak icin once konu adini yaz.');
            return;
        }

        openFlow({ topicName: trimmedNewTopicName });
    };

    if (isLoading) {
        return (
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.title}>Kaynak Bazli Test</Text>
                <View style={[styles.card, styles.stateCard]}>
                    <SkeletonCard height={92} />
                    <Text style={styles.description}>Quiz ortami hazirlaniyor...</Text>
                </View>
            </ScrollView>
        );
    }

    if (error) {
        return (
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.title}>Kaynak Bazli Test</Text>
                <View style={[styles.card, styles.errorCard]}>
                    <Text style={styles.errorTitle}>Quiz acilamadi</Text>
                    <Text style={styles.error}>{error}</Text>
                    <Link href="/(tabs)" style={styles.stateLinkButton}>
                        Kaynaklara Don
                    </Link>
                </View>
            </ScrollView>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Kaynak Bazli Test</Text>
            <View style={styles.stickyHeader}>
                <Text style={styles.stickyHeaderTitle}>{source?.title ?? 'Kaynak yukleniyor'}</Text>
                <Text style={styles.stickyHeaderMeta}>
                    Konu odagi: {selectedTopicName ?? recommendedTopicName ?? '-'}
                </Text>
                <View style={styles.headerChipRow}>
                    <Text style={[styles.headerChip, styles.headerChipQueue]}>
                        Secili konuda {selectedTopicQuestionCount} kayitli soru
                    </Text>
                    <Text style={[styles.headerChip, styles.headerChipBank]}>
                        Toplam {topics.length} konu
                    </Text>
                </View>
            </View>

            <AnimatedCard style={styles.card} delayMs={30} resetKey={`setup-${sourceId}`}>
                <Text style={styles.sectionTitle}>Konu Secimi</Text>

                {recommendedTopicName ? (
                    <Text style={styles.recommendedText}>
                        Onerilen konu secildi: {recommendedTopicName}
                    </Text>
                ) : null}

                {topics.length === 0 ? (
                    <Text style={styles.description}>
                        Bu kaynaga ait konu yok. Yeni konu adi girip soru uretebilirsin.
                    </Text>
                ) : (
                    <View style={styles.topicList}>
                        {topics.map((topic) => {
                            const isActive = selectedTopicId === topic.id;
                            return (
                                <Pressable
                                    key={topic.id}
                                    onPress={() => setSelectedTopicId(topic.id)}
                                    style={[styles.topicPill, isActive ? styles.topicPillActive : null]}
                                >
                                    <Text
                                        style={[
                                            styles.topicPillText,
                                            isActive ? styles.topicPillTextActive : null,
                                        ]}
                                    >
                                        {topic.name} ({questionCountByTopicId[topic.id] ?? 0})
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                )}

                <TextInput
                    value={newTopicName}
                    onChangeText={setNewTopicName}
                    placeholder="Yeni konu adi (ornek: Phrasal Verbs)"
                    style={styles.input}
                />

                <View style={styles.flowInfoCard}>
                    <Text style={styles.flowInfoTitle}>Nasil Calisir?</Text>
                    <Text style={styles.flowInfoLine}>
                        1) Bu ekranda konuyu secersin.
                    </Text>
                    <Text style={styles.flowInfoLine}>
                        2) "Akisi Baslat" deyince yeni bir sayfa acilir.
                    </Text>
                    <Text style={styles.flowInfoLine}>
                        3) Soru-cevap akisi o sayfada devam eder.
                    </Text>
                </View>

                <View style={styles.apiInfoCard}>
                    <Text style={styles.apiInfoTitle}>API Ne Zaman Cagrilir?</Text>
                    <Text style={styles.apiInfoLine}>
                        Hazir kuyrukta veya soru bankasinda soru varsa API cagrisi yapilmaz.
                    </Text>
                    <Text style={styles.apiInfoLine}>
                        Yalnizca elde soru kalmadiysa AI servisine gidip yeni soru uretilir.
                    </Text>
                </View>

                <Pressable
                    onPress={() => {
                        handleOpenFlowForSelection();
                    }}
                    disabled={isLoading}
                    style={[styles.button, isLoading ? styles.buttonDisabled : null]}
                >
                    <Text style={styles.buttonText}>Secili Konuda Akisi Baslat</Text>
                </Pressable>

                <Pressable
                    onPress={() => {
                        handleOpenFlowForNewTopic();
                    }}
                    disabled={isLoading}
                    style={[styles.secondaryButton, isLoading ? styles.buttonDisabled : null]}
                >
                    <Text style={styles.secondaryButtonText}>Yeni Konu ile Akisi Baslat</Text>
                </Pressable>

                {flowNotice ? <Text style={styles.flowNoticeText}>{flowNotice}</Text> : null}
                <Text style={styles.prefetchInfo}>
                    Not: Yeni konu yazarsan, akis sayfasi acilirken konu otomatik olusturulur.
                </Text>

                {recommendedTopicId ? (
                    <Pressable
                        onPress={() => {
                            setSelectedTopicId(recommendedTopicId);
                            handleOpenFlowForSelection();
                        }}
                        disabled={isLoading}
                        style={[styles.secondaryButton, isLoading ? styles.buttonDisabled : null]}
                    >
                        <Text style={styles.secondaryButtonText}>Onerilen Konu ile Baslat</Text>
                    </Pressable>
                ) : null}

                <Text style={styles.emptyStateHint}>
                    Bu ekranda soru gosterilmez. Akis, yeni soru sayfasinda acilir.
                </Text>
            </AnimatedCard>

            <Link href="/(tabs)/quiz" style={styles.stateLinkButton}>
                Kaynak Listesine Don
            </Link>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: spacing.lg,
        gap: 12,
        backgroundColor: colors.surface,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    stickyHeader: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 3,
        backgroundColor: colors.primarySurface,
    },
    stickyHeaderTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    stickyHeaderMeta: {
        fontSize: 12,
        color: colors.primary,
    },
    headerChipRow: {
        marginTop: 4,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    headerChip: {
        borderRadius: 9999,
        borderWidth: 1,
        fontSize: 11,
        fontWeight: '700',
        paddingHorizontal: 10,
        paddingVertical: 6,
        overflow: 'hidden',
    },
    headerChipQueue: {
        borderColor: colors.primaryLight,
        backgroundColor: colors.primarySurface,
        color: colors.primary,
    },
    headerChipBank: {
        borderColor: colors.primaryLight,
        backgroundColor: colors.primarySurface,
        color: colors.primary,
    },
    description: {
        fontSize: 16,
        color: colors.textSecondary,
        lineHeight: 24,
    },
    card: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: 10,
        backgroundColor: colors.surface,
    },
    sectionTitle: {
        ...typography.heading,
        color: colors.textPrimary,
    },
    topicList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    topicPill: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.pill,
        paddingVertical: 6,
        paddingHorizontal: 10,
    },
    topicPillActive: {
        borderColor: colors.primary,
        backgroundColor: colors.primarySurface,
    },
    topicPillText: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    topicPillTextActive: {
        color: colors.primary,
        fontWeight: '700',
    },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        color: colors.textPrimary,
        backgroundColor: colors.surface,
    },
    flowInfoCard: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        backgroundColor: colors.primarySurface,
        paddingHorizontal: 10,
        paddingVertical: 10,
        gap: 4,
    },
    flowInfoTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.primary,
    },
    flowInfoLine: {
        fontSize: 12,
        lineHeight: 18,
        color: colors.textSecondary,
    },
    apiInfoCard: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        backgroundColor: colors.primarySurface,
        paddingHorizontal: 10,
        paddingVertical: 10,
        gap: 4,
    },
    apiInfoTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.primary,
    },
    apiInfoLine: {
        fontSize: 12,
        lineHeight: 18,
        color: colors.textSecondary,
    },
    button: {
        backgroundColor: colors.primary,
        borderRadius: radius.md,
        paddingVertical: 12,
        alignItems: 'center',
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: colors.surface,
        fontSize: 15,
        fontWeight: '700',
    },
    secondaryButton: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.primary,
        paddingVertical: 10,
        alignItems: 'center',
        marginTop: 4,
    },
    secondaryButtonText: {
        color: colors.primary,
        fontSize: 14,
        fontWeight: '700',
    },
    error: {
        color: colors.error,
        fontSize: 14,
    },
    errorTitle: {
        color: colors.error,
        fontSize: 16,
        fontWeight: '700',
    },
    errorCard: {
        borderColor: colors.error,
        backgroundColor: colors.errorSurface,
    },
    stateCard: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 120,
    },
    stateLinkButton: {
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
    recommendedText: {
        fontSize: 14,
        color: colors.primary,
        fontWeight: '600',
    },
    flowNoticeText: {
        fontSize: 13,
        color: colors.textPrimary,
        backgroundColor: colors.primarySurface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    prefetchInfo: {
        fontSize: 12,
        color: colors.textMuted,
    },
    emptyStateHint: {
        fontSize: 13,
        color: colors.textSecondary,
    },
});
