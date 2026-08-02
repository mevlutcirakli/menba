import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocalSearchParams } from 'expo-router';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { AnimatedCard } from '../../../src/components/AnimatedCard';
import { QuestionCard } from '../../../src/components/QuestionCard';
import { SkeletonCard } from '../../../src/components/SkeletonCard';
import { useQuiz } from '../../../src/hooks/useQuiz';
import { explainWrongAnswer } from '../../../src/services/geminiService';
import { colors, radius, spacing, typography } from '../../../src/theme/tokens';

const AUTO_NEXT_DELAY_CORRECT_MS = 1800;
const AUTO_NEXT_DELAY_WRONG_MS = 3500;

export default function QuizPlayScreen() {
    const { sourceId, topicId, topicName } = useLocalSearchParams<{
        sourceId: string;
        topicId?: string;
        topicName?: string;
    }>();

    const initialTopicId = typeof topicId === 'string' ? topicId : undefined;
    const initialTopicName = typeof topicName === 'string' ? topicName.trim() : '';

    const {
        source,
        topics,
        currentQuestion,
        activeTopic,
        answerFeedback,
        recommendedTopicId,
        generationStatus,
        prefetchedQuestionCount,
        storedQuestionCount,
        isLoading,
        isGenerating,
        isSubmittingAnswer,
        error,
        generateForTopic,
        submitAnswer,
    } = useQuiz(sourceId);

    const [wrongAnswerExplanation, setWrongAnswerExplanation] = useState<string | null>(null);
    const [isExplaining, setIsExplaining] = useState(false);
    const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(true);
    const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);
    const [nextCountdownMs, setNextCountdownMs] = useState<number | null>(null);
    const [bootError, setBootError] = useState<string | null>(null);
    const hasBootstrappedRef = useRef(false);

    const activeTopicName = useMemo(() => {
        if (activeTopic?.name) {
            return activeTopic.name;
        }

        if (initialTopicId) {
            const topicFromId = topics.find((item) => item.id === initialTopicId);
            if (topicFromId) {
                return topicFromId.name;
            }
        }

        if (initialTopicName) {
            return initialTopicName;
        }

        if (recommendedTopicId) {
            const recommended = topics.find((item) => item.id === recommendedTopicId);
            return recommended?.name ?? '-';
        }

        return '-';
    }, [activeTopic?.name, initialTopicId, initialTopicName, recommendedTopicId, topics]);

    const bootstrapQuestion = useCallback(async () => {
        if (isLoading || isGenerating) {
            return;
        }

        setBootError(null);
        try {
            if (initialTopicName) {
                await generateForTopic({ topicName: initialTopicName });
                return;
            }

            if (initialTopicId) {
                await generateForTopic({ topicId: initialTopicId });
                return;
            }

            if (recommendedTopicId) {
                await generateForTopic({ topicId: recommendedTopicId });
                return;
            }

            throw new Error('Akisi baslatmak icin uygun konu bulunamadi.');
        } catch (generationError) {
            setBootError(
                generationError instanceof Error
                    ? generationError.message
                    : 'Ilk soru acilirken bir hata olustu.'
            );
        }
    }, [generateForTopic, initialTopicId, initialTopicName, isGenerating, isLoading, recommendedTopicId]);

    useEffect(() => {
        hasBootstrappedRef.current = false;
        setBootError(null);
    }, [sourceId, initialTopicId, initialTopicName]);

    useEffect(() => {
        if (isLoading || isGenerating || currentQuestion || hasBootstrappedRef.current) {
            return;
        }

        if (!initialTopicId && !initialTopicName && !recommendedTopicId) {
            return;
        }

        hasBootstrappedRef.current = true;
        void bootstrapQuestion();
    }, [
        bootstrapQuestion,
        currentQuestion,
        initialTopicId,
        initialTopicName,
        isGenerating,
        isLoading,
        recommendedTopicId,
    ]);

    const handleExplainWrong = async () => {
        if (!currentQuestion || !answerFeedback || answerFeedback.isCorrect) {
            return;
        }

        setIsExplaining(true);
        setWrongAnswerExplanation(null);

        try {
            const explanation = await explainWrongAnswer(
                currentQuestion.soru,
                answerFeedback.userChoice,
                answerFeedback.correctChoice
            );

            setWrongAnswerExplanation(explanation);
        } catch (explainError) {
            setWrongAnswerExplanation(
                explainError instanceof Error
                    ? explainError.message
                    : 'Aciklama alinirken hata olustu.'
            );
        } finally {
            setIsExplaining(false);
        }
    };

    const handleNextQuestion = useCallback(async () => {
        if (isGenerating) {
            return;
        }

        setIsAutoAdvancing(false);
        setNextCountdownMs(null);
        setWrongAnswerExplanation(null);

        if (activeTopic?.id) {
            await generateForTopic({ topicId: activeTopic.id });
            return;
        }

        if (initialTopicName) {
            await generateForTopic({ topicName: initialTopicName });
            return;
        }

        if (initialTopicId) {
            await generateForTopic({ topicId: initialTopicId });
            return;
        }

        if (recommendedTopicId) {
            await generateForTopic({ topicId: recommendedTopicId });
            return;
        }

        setBootError('Sonraki soru icin uygun konu bulunamadi.');
    }, [
        activeTopic?.id,
        generateForTopic,
        initialTopicId,
        initialTopicName,
        isGenerating,
        recommendedTopicId,
    ]);

    useEffect(() => {
        if (!answerFeedback || !autoAdvanceEnabled) {
            setIsAutoAdvancing(false);
            setNextCountdownMs(null);
            return;
        }

        const delayMs = answerFeedback.isCorrect
            ? AUTO_NEXT_DELAY_CORRECT_MS
            : AUTO_NEXT_DELAY_WRONG_MS;
        const deadline = Date.now() + delayMs;
        setIsAutoAdvancing(true);
        setNextCountdownMs(delayMs);

        const countdownTimer = setInterval(() => {
            const remaining = Math.max(0, deadline - Date.now());
            setNextCountdownMs(remaining);
        }, 100);

        const autoNextTimer = setTimeout(() => {
            setIsAutoAdvancing(false);
            setNextCountdownMs(null);
            void handleNextQuestion();
        }, delayMs);

        return () => {
            clearInterval(countdownTimer);
            clearTimeout(autoNextTimer);
        };
    }, [answerFeedback, autoAdvanceEnabled, handleNextQuestion]);

    if (isLoading) {
        return (
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.title}>Soru Akisi</Text>
                <View style={[styles.card, styles.stateCard]}>
                    <SkeletonCard height={96} />
                    <Text style={styles.description}>Soru ortami hazirlaniyor...</Text>
                </View>
            </ScrollView>
        );
    }

    if (error) {
        return (
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.title}>Soru Akisi</Text>
                <View style={[styles.card, styles.errorCard]}>
                    <Text style={styles.errorTitle}>Akis acilamadi</Text>
                    <Text style={styles.error}>{error}</Text>
                    <Link href={`/quiz/${sourceId}`} style={styles.stateLinkButton}>
                        Konu Secimine Don
                    </Link>
                </View>
            </ScrollView>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container} stickyHeaderIndices={[1]}>
            <Text style={styles.title}>Soru Akisi</Text>
            <View style={styles.stickyHeader}>
                <Text style={styles.stickyHeaderTitle}>{source?.title ?? 'Kaynak'}</Text>
                <Text style={styles.stickyHeaderMeta}>Konu: {activeTopicName}</Text>
                <View style={styles.headerChipRow}>
                    <Text style={[styles.headerChip, styles.headerChipQueue]}>
                        Hazirda {prefetchedQuestionCount} soru
                    </Text>
                    <Text style={[styles.headerChip, styles.headerChipBank]}>
                        Bankada {storedQuestionCount} soru
                    </Text>
                    <Text style={[styles.headerChip, styles.headerChipAuto]}>
                        Oto gecis: {autoAdvanceEnabled ? 'Acik' : 'Kapali'}
                    </Text>
                </View>
            </View>

            {bootError ? <Text style={styles.error}>{bootError}</Text> : null}
            {generationStatus ? <Text style={styles.generationInfo}>{generationStatus}</Text> : null}

            {!currentQuestion && isGenerating ? (
                <View style={[styles.card, styles.stateCard]}>
                    <SkeletonCard height={96} />
                    <Text style={styles.description}>Ilk soru hazirlaniyor...</Text>
                </View>
            ) : null}

            {!currentQuestion && !isGenerating ? (
                <Pressable
                    onPress={() => {
                        hasBootstrappedRef.current = true;
                        void bootstrapQuestion();
                    }}
                    style={styles.secondaryButton}
                >
                    <Text style={styles.secondaryButtonText}>Akisi Tekrar Baslat</Text>
                </Pressable>
            ) : null}

            {currentQuestion ? (
                <AnimatedCard
                    style={styles.card}
                    delayMs={40}
                    resetKey={`${currentQuestion.soru}-${activeTopic?.id ?? 'unknown'}`}
                >
                    <Text style={styles.sectionTitle}>Aktif Konu: {activeTopic?.name ?? activeTopicName}</Text>
                    <QuestionCard
                        question={currentQuestion}
                        onSelectOption={(option) => {
                            if (isSubmittingAnswer) {
                                return;
                            }
                            setWrongAnswerExplanation(null);
                            void submitAnswer(option);
                        }}
                    />
                    {isSubmittingAnswer ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                </AnimatedCard>
            ) : null}

            {answerFeedback ? (
                <AnimatedCard
                    style={styles.card}
                    delayMs={60}
                    resetKey={`${answerFeedback.userChoice}-${answerFeedback.correctChoice}-${answerFeedback.isCorrect}`}
                >
                    <Text style={styles.sectionTitle}>
                        {answerFeedback.isCorrect ? 'Dogru cevap!' : 'Yanlis cevap'}
                    </Text>
                    <Text style={styles.description}>Senin cevabin: {answerFeedback.userChoice}</Text>
                    <Text style={styles.description}>Dogru cevap: {answerFeedback.correctChoice}</Text>
                    <Text style={styles.explanationTitle}>Aciklama</Text>
                    <Text style={styles.description}>{answerFeedback.explanation}</Text>

                    {!answerFeedback.isCorrect ? (
                        <>
                            <Pressable
                                onPress={() => {
                                    void handleExplainWrong();
                                }}
                                disabled={isExplaining}
                                style={[
                                    styles.secondaryButton,
                                    isExplaining ? styles.buttonDisabled : null,
                                ]}
                            >
                                <Text style={styles.secondaryButtonText}>
                                    {isExplaining ? 'Aciklama aliniyor...' : 'Neden yanlis?'}
                                </Text>
                            </Pressable>
                            {wrongAnswerExplanation ? (
                                <Text style={styles.description}>{wrongAnswerExplanation}</Text>
                            ) : null}
                        </>
                    ) : null}

                    <Text style={styles.autoNextHint}>
                        {autoAdvanceEnabled
                            ? answerFeedback.isCorrect
                                ? 'Sonraki soru otomatik geliyor...'
                                : 'Sonraki soru kisa sure sonra otomatik gelecek...'
                            : 'Otomatik gecis kapali. Hazir oldugunda sonraki soruya gecebilirsin.'}
                    </Text>

                    {autoAdvanceEnabled && isAutoAdvancing && nextCountdownMs !== null ? (
                        <Text style={styles.countdownText}>
                            Sonraki soruya gecis: {(nextCountdownMs / 1000).toFixed(1)} sn
                        </Text>
                    ) : null}

                    {prefetchedQuestionCount > 0 ? (
                        <Text style={styles.prefetchReadyHint}>
                            Sonraki sorulardan bazilari hazir, gecis daha hizli olacak.
                        </Text>
                    ) : null}

                    <Pressable
                        onPress={() => {
                            void handleNextQuestion();
                        }}
                        disabled={isGenerating}
                        style={[styles.secondaryButton, isGenerating ? styles.buttonDisabled : null]}
                    >
                        <Text style={styles.secondaryButtonText}>
                            {isGenerating ? 'Yeni soru uretiliyor...' : 'Sonraki Soru'}
                        </Text>
                    </Pressable>

                    <Pressable
                        onPress={() => {
                            setAutoAdvanceEnabled((prev) => !prev);
                            setIsAutoAdvancing(false);
                            setNextCountdownMs(null);
                        }}
                        style={styles.ghostButton}
                    >
                        <Text style={styles.ghostButtonText}>
                            {autoAdvanceEnabled ? 'Otomatik Gecisi Kapat' : 'Otomatik Gecisi Ac'}
                        </Text>
                    </Pressable>
                </AnimatedCard>
            ) : null}

            <Link href={`/quiz/${sourceId}`} style={styles.stateLinkButton}>
                Konu Secimine Don
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
        gap: 4,
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
    headerChipAuto: {
        borderColor: colors.primaryLight,
        backgroundColor: colors.primarySurface,
        color: colors.primary,
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
    description: {
        fontSize: 16,
        color: colors.textSecondary,
        lineHeight: 24,
    },
    buttonDisabled: {
        opacity: 0.7,
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
    explanationTitle: {
        marginTop: 2,
        fontSize: 14,
        color: colors.textPrimary,
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
    autoNextHint: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    generationInfo: {
        fontSize: 13,
        color: colors.primary,
    },
    prefetchReadyHint: {
        fontSize: 12,
        color: colors.primary,
    },
    countdownText: {
        fontSize: 13,
        color: colors.primary,
        fontWeight: '700',
    },
    ghostButton: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: 10,
        alignItems: 'center',
        marginTop: 4,
        backgroundColor: colors.primarySurface,
    },
    ghostButtonText: {
        color: colors.textSecondary,
        fontSize: 14,
        fontWeight: '700',
    },
});
