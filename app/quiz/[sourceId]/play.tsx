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
import { Ionicons } from '@expo/vector-icons';
import { AnimatedCard } from '../../../src/components/AnimatedCard';
import { QuestionCard } from '../../../src/components/QuestionCard';
import { SkeletonCard } from '../../../src/components/SkeletonCard';
import { useQuiz } from '../../../src/hooks/useQuiz';
import { explainWrongAnswer } from '../../../src/services/geminiService';
import { palette, radius, spacing, typography } from '../../../src/theme/tokens';

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
        questionOrigin,
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

    // Akis adaptif ve acik uclu; sabit bir soru sayisi yok. Bu yuzden
    // "SORU 3 / 10" gibi bir payda gosterilmiyor, sadece cozulen sayilıyor.
    const [answeredCount, setAnsweredCount] = useState(0);
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
        <ScrollView contentContainerStyle={styles.container} stickyHeaderIndices={[0]}>
            <View style={styles.stickyHeader}>
                <View style={styles.headerTopRow}>
                    <View style={styles.headerTextBlock}>
                        <Text style={styles.headerEyebrow}>
                            {/* Geri bildirim ekrandayken hala o soruyu gosteriyoruz */}
                            SORU {answerFeedback ? answeredCount : answeredCount + 1}
                        </Text>
                        <Text style={styles.headerTitle} numberOfLines={1}>
                            {source?.title ?? 'Kaynak'}
                        </Text>
                    </View>

                    <Link href={`/quiz/${sourceId}`} asChild>
                        <Pressable style={styles.closeButton} hitSlop={8}>
                            <Text style={styles.closeButtonText}>✕</Text>
                        </Pressable>
                    </Link>
                </View>

                <View style={styles.headerChipRow}>
                    {/* Kaynaktaki sorular bitince AI uretimine geciliyor;
                        kullanici hangisini cozdugunu bilmeli. */}
                    {questionOrigin ? (
                        <Text
                            style={[
                                styles.headerChip,
                                questionOrigin === 'bank'
                                    ? styles.headerChipBank
                                    : styles.headerChipAi,
                            ]}
                        >
                            {questionOrigin === 'bank' ? 'Kaynaktan' : 'AI üretti'}
                        </Text>
                    ) : null}
                    <Text style={[styles.headerChip, styles.headerChipQueue]}>
                        Hazırda {prefetchedQuestionCount}
                    </Text>
                    <Text style={[styles.headerChip, styles.headerChipBank]}>
                        Bankada {storedQuestionCount}
                    </Text>
                    <Text style={[styles.headerChip, styles.headerChipAuto]}>
                        Oto geçiş: {autoAdvanceEnabled ? 'Açık' : 'Kapalı'}
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
                    <QuestionCard
                        question={currentQuestion}
                        topicName={activeTopic?.name ?? activeTopicName}
                        selectedOption={answerFeedback?.userChoice ?? null}
                        correctOption={answerFeedback?.correctChoice ?? null}
                        disabled={isSubmittingAnswer || Boolean(answerFeedback)}
                        onSelectOption={(option) => {
                            if (isSubmittingAnswer) {
                                return;
                            }
                            setWrongAnswerExplanation(null);
                            setAnsweredCount((count) => count + 1);
                            void submitAnswer(option);
                        }}
                    />
                    {isSubmittingAnswer ? <ActivityIndicator size="small" color={palette.indigo600} /> : null}
                </AnimatedCard>
            ) : null}

            {answerFeedback ? (
                <AnimatedCard
                    style={styles.solutionCard}
                    delayMs={60}
                    resetKey={`${answerFeedback.userChoice}-${answerFeedback.correctChoice}-${answerFeedback.isCorrect}`}
                >
                    <View style={styles.solutionHeader}>
                        <View style={styles.solutionHeaderText}>
                            <Text style={styles.solutionEyebrow}>ÇÖZÜM &amp; AÇIKLAMA</Text>
                            <View style={styles.verdictRow}>
                                <Ionicons
                                    name={
                                        answerFeedback.isCorrect
                                            ? 'checkmark-circle'
                                            : 'close-circle'
                                    }
                                    size={19}
                                    color={
                                        answerFeedback.isCorrect
                                            ? palette.emerald500
                                            : palette.error
                                    }
                                />
                                <Text
                                    style={[
                                        styles.verdictText,
                                        answerFeedback.isCorrect
                                            ? styles.verdictTextCorrect
                                            : styles.verdictTextWrong,
                                    ]}
                                >
                                    {answerFeedback.isCorrect ? 'Doğru Cevap' : 'Yanlış Cevap'}
                                </Text>
                            </View>
                        </View>

                        {!answerFeedback.isCorrect ? (
                            <Pressable
                                onPress={() => {
                                    void handleExplainWrong();
                                }}
                                disabled={isExplaining}
                                style={({ pressed }) => [
                                    styles.deepAnalysisButton,
                                    pressed ? styles.pressed : null,
                                    isExplaining ? styles.buttonDisabled : null,
                                ]}
                            >
                                <Ionicons
                                    name="sparkles"
                                    size={13}
                                    color={palette.onDarkPrimary}
                                />
                                <Text style={styles.deepAnalysisButtonText}>
                                    {isExplaining ? 'Analiz alınıyor...' : 'AI Derin Analiz İstedi'}
                                </Text>
                            </Pressable>
                        ) : null}
                    </View>

                    <View style={styles.answerSummary}>
                        <View style={styles.answerSummaryRow}>
                            <Text style={styles.answerSummaryLabel}>Senin cevabın</Text>
                            <Text
                                style={[
                                    styles.answerSummaryValue,
                                    answerFeedback.isCorrect
                                        ? styles.answerSummaryValueCorrect
                                        : styles.answerSummaryValueWrong,
                                ]}
                                numberOfLines={2}
                            >
                                {answerFeedback.userChoice}
                            </Text>
                        </View>
                        <View style={styles.answerSummaryDivider} />
                        <View style={styles.answerSummaryRow}>
                            <Text style={styles.answerSummaryLabel}>Doğru cevap</Text>
                            <Text
                                style={[
                                    styles.answerSummaryValue,
                                    styles.answerSummaryValueCorrect,
                                ]}
                                numberOfLines={2}
                            >
                                {answerFeedback.correctChoice}
                            </Text>
                        </View>
                    </View>

                    <Text style={styles.solutionBody}>{answerFeedback.explanation}</Text>

                    {!answerFeedback.isCorrect && (isExplaining || wrongAnswerExplanation) ? (
                        <View style={styles.coachBox}>
                            <View style={styles.coachHeaderRow}>
                                <View style={styles.coachIcon}>
                                    <Ionicons
                                        name="sparkles"
                                        size={13}
                                        color={palette.onDarkPrimary}
                                    />
                                </View>
                                <Text style={styles.coachTitle}>Gemini AI Koç Tespiti</Text>
                            </View>

                            {isExplaining && !wrongAnswerExplanation ? (
                                <View style={styles.coachLoadingRow}>
                                    <ActivityIndicator size="small" color={palette.indigo600} />
                                    <Text style={styles.coachLoadingText}>
                                        Koç bu soruyu inceliyor...
                                    </Text>
                                </View>
                            ) : (
                                <Text style={styles.coachText}>{wrongAnswerExplanation}</Text>
                            )}
                        </View>
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
        backgroundColor: palette.cardBg,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    stickyHeader: {
        borderWidth: 1,
        borderColor: palette.cardBorder,
        borderRadius: radius.lg,
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 4,
        backgroundColor: palette.cardBg,
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
    },
    headerTextBlock: {
        flex: 1,
    },
    headerEyebrow: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.8,
        color: palette.textMuted,
    },
    headerTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: palette.textPrimary,
        marginTop: 2,
    },
    closeButton: {
        width: 30,
        height: 30,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.pageBg,
    },
    closeButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: palette.textSecondary,
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
        borderColor: palette.indigo500,
        backgroundColor: palette.indigoSurface,
        color: palette.indigo600,
    },
    headerChipBank: {
        borderColor: palette.indigo500,
        backgroundColor: palette.indigoSurface,
        color: palette.indigo600,
    },
    headerChipAuto: {
        borderColor: palette.indigo500,
        backgroundColor: palette.indigoSurface,
        color: palette.indigo600,
    },
    headerChipAi: {
        borderColor: palette.amber500,
        backgroundColor: palette.amberSurface,
        color: palette.amber600,
    },
    card: {
        borderWidth: 1,
        borderColor: palette.cardBorder,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: 10,
        backgroundColor: palette.cardBg,
    },
    sectionTitle: {
        ...typography.heading,
        color: palette.textPrimary,
    },
    pressed: {
        opacity: 0.85,
    },

    // --- Cozum & aciklama karti ---
    solutionCard: {
        borderWidth: 1,
        borderColor: palette.cardBorder,
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: spacing.md,
        backgroundColor: palette.cardBg,
    },
    solutionHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.sm,
    },
    solutionHeaderText: {
        flex: 1,
        gap: 4,
    },
    solutionEyebrow: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.9,
        color: palette.indigo600,
    },
    verdictRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    verdictText: {
        fontSize: 18,
        fontWeight: '800',
    },
    verdictTextCorrect: {
        color: '#065f46',
    },
    verdictTextWrong: {
        color: palette.error,
    },
    deepAnalysisButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: radius.pill,
        backgroundColor: palette.indigo600,
        paddingVertical: 8,
        paddingHorizontal: 12,
        maxWidth: 180,
    },
    deepAnalysisButtonText: {
        color: palette.onDarkPrimary,
        fontSize: 12,
        fontWeight: '700',
        flexShrink: 1,
    },
    answerSummary: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        backgroundColor: palette.pageBg,
        paddingVertical: 4,
        paddingHorizontal: spacing.md,
    },
    answerSummaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingVertical: 10,
    },
    answerSummaryDivider: {
        height: 1,
        backgroundColor: palette.cardBorder,
    },
    answerSummaryLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: palette.textMuted,
    },
    answerSummaryValue: {
        flex: 1,
        textAlign: 'right',
        fontSize: 14,
        fontWeight: '700',
    },
    answerSummaryValueCorrect: {
        color: '#065f46',
    },
    answerSummaryValueWrong: {
        color: palette.error,
    },
    solutionBody: {
        fontSize: 15,
        lineHeight: 23,
        color: palette.textSecondary,
    },

    // --- Gemini AI Koc Tespiti kutusu ---
    coachBox: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.indigoBorder,
        backgroundColor: palette.indigoSurface,
        padding: spacing.md,
        gap: spacing.sm,
    },
    coachHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    coachIcon: {
        width: 22,
        height: 22,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.indigo600,
    },
    coachTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: palette.indigo600,
        letterSpacing: 0.2,
    },
    coachText: {
        fontSize: 14,
        lineHeight: 22,
        color: palette.textPrimary,
    },
    coachLoadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    coachLoadingText: {
        fontSize: 13,
        color: palette.indigo600,
        fontWeight: '600',
    },
    description: {
        fontSize: 16,
        color: palette.textSecondary,
        lineHeight: 24,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    secondaryButton: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.indigo600,
        paddingVertical: 10,
        alignItems: 'center',
        marginTop: 4,
    },
    secondaryButtonText: {
        color: palette.indigo600,
        fontSize: 14,
        fontWeight: '700',
    },
    explanationTitle: {
        marginTop: 2,
        fontSize: 14,
        color: palette.textPrimary,
        fontWeight: '700',
    },
    error: {
        color: palette.error,
        fontSize: 14,
    },
    errorTitle: {
        color: palette.error,
        fontSize: 16,
        fontWeight: '700',
    },
    errorCard: {
        borderColor: palette.error,
        backgroundColor: '#fef2f2',
    },
    stateCard: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 120,
    },
    stateLinkButton: {
        marginTop: 4,
        alignSelf: 'flex-start',
        backgroundColor: palette.indigo600,
        color: palette.cardBg,
        borderRadius: radius.md,
        overflow: 'hidden',
        paddingVertical: 10,
        paddingHorizontal: 14,
        fontSize: 14,
        fontWeight: '700',
    },
    autoNextHint: {
        fontSize: 13,
        color: palette.textSecondary,
    },
    generationInfo: {
        fontSize: 13,
        color: palette.indigo600,
    },
    prefetchReadyHint: {
        fontSize: 12,
        color: palette.indigo600,
    },
    countdownText: {
        fontSize: 13,
        color: palette.indigo600,
        fontWeight: '700',
    },
    ghostButton: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        paddingVertical: 10,
        alignItems: 'center',
        marginTop: 4,
        backgroundColor: palette.indigoSurface,
    },
    ghostButtonText: {
        color: palette.textSecondary,
        fontSize: 14,
        fontWeight: '700',
    },
});
