import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
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
import { palette, radius, spacing, uiType } from '../../../src/theme/tokens';

const DEFAULT_SESSION_QUESTION_COUNT = 5;

function formatElapsed(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function QuizPlayScreen() {
    const router = useRouter();
    const { sourceId, topicId, topicName, count } = useLocalSearchParams<{
        sourceId: string;
        topicId?: string;
        topicName?: string;
        count?: string;
    }>();

    const initialTopicId = typeof topicId === 'string' ? topicId : undefined;
    const initialTopicName = typeof topicName === 'string' ? topicName.trim() : '';

    // Test uzunlugu = secilen konudaki (ya da tum kaynaktaki) hazir soru
    // sayisi. Test Coz ekranindan parametre olarak geliyor; ust sinir yok,
    // amac bankadaki sorularin tamamini cozdurmek.
    const sessionQuestionCount = useMemo(() => {
        const parsed = Number(count);
        return Number.isFinite(parsed) && parsed > 0
            ? Math.round(parsed)
            : DEFAULT_SESSION_QUESTION_COUNT;
    }, [count]);

    const {
        source,
        topics,
        currentQuestion,
        activeTopic,
        answerFeedback,
        questionOrigin,
        recommendedTopicId,
        isLoading,
        isGenerating,
        isSubmittingAnswer,
        error,
        generateForTopic,
        submitAnswer,
        pickTopicWithRemainingBank,
    } = useQuiz(sourceId);

    const [answeredCount, setAnsweredCount] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [wrongAnswerExplanation, setWrongAnswerExplanation] = useState<string | null>(null);
    const [isExplaining, setIsExplaining] = useState(false);
    const [bootError, setBootError] = useState<string | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const hasBootstrappedRef = useRef(false);

    const isSessionFinished = answeredCount >= sessionQuestionCount && Boolean(answerFeedback);
    const currentQuestionNumber = Math.min(
        sessionQuestionCount,
        answerFeedback ? answeredCount : answeredCount + 1
    );
    const progressRatio = Math.min(1, currentQuestionNumber / sessionQuestionCount);

    // Soru basina gecen sure; her yeni soruda sifirlanir.
    useEffect(() => {
        setElapsedSeconds(0);

        if (!currentQuestion || answerFeedback) {
            return;
        }

        const timer = setInterval(() => {
            setElapsedSeconds((previous) => previous + 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [currentQuestion, answerFeedback]);

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

            const firstTopicId = pickTopicWithRemainingBank() ?? recommendedTopicId;
            if (firstTopicId) {
                await generateForTopic({ topicId: firstTopicId });
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
    }, [
        generateForTopic,
        initialTopicId,
        initialTopicName,
        isGenerating,
        isLoading,
        pickTopicWithRemainingBank,
        recommendedTopicId,
    ]);

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

        setWrongAnswerExplanation(null);

        if (initialTopicName) {
            await generateForTopic({ topicName: initialTopicName });
            return;
        }

        if (initialTopicId) {
            await generateForTopic({ topicId: initialTopicId });
            return;
        }

        // "Tum Konular" modu: aktif konuya sabitlenmek yerine bankasinda hala
        // cozulmemis sorusu olan konuya geciyoruz, boylece kaynaktaki tum
        // sorular tuketiliyor.
        const nextTopicId =
            pickTopicWithRemainingBank() ?? activeTopic?.id ?? recommendedTopicId;

        if (nextTopicId) {
            await generateForTopic({ topicId: nextTopicId });
            return;
        }

        setBootError('Sonraki soru icin uygun konu bulunamadi.');
    }, [
        activeTopic?.id,
        generateForTopic,
        initialTopicId,
        initialTopicName,
        isGenerating,
        pickTopicWithRemainingBank,
        recommendedTopicId,
    ]);

    // Otomatik gecis yok: sonraki soruya kullanici tiklayarak geciyor.

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
                    <Link href="/(tabs)/sources" style={styles.stateLinkButton}>
                        Test Seçimine Dön
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
                            SORU {currentQuestionNumber} / {sessionQuestionCount}
                        </Text>
                        {/* Konu adi zaten soru kartindaki rozette; burada kaynak. */}
                        <Text style={styles.headerTitle} numberOfLines={1}>
                            {source?.title ?? 'Kaynak'}
                        </Text>
                    </View>

                    <View style={styles.headerActions}>
                        {currentQuestion && !answerFeedback ? (
                            <View style={styles.timerChip}>
                                <Ionicons
                                    name="time-outline"
                                    size={13}
                                    color={palette.textSecondary}
                                />
                                <Text style={styles.timerChipText}>
                                    {formatElapsed(elapsedSeconds)}
                                </Text>
                            </View>
                        ) : null}

                        {/* Link asChild cocugun `style`ini undefined ile
                            ezdigi icin router.push kullaniliyor. */}
                        <Pressable
                            onPress={() => router.push('/(tabs)/sources')}
                            style={styles.closeButton}
                            hitSlop={8}
                        >
                            <Ionicons
                                name="close"
                                size={17}
                                color={palette.textSecondary}
                            />
                        </Pressable>
                    </View>
                </View>

                {/* Kaynaktaki sorular bitince AI uretimine geciliyor; yalnizca
                    o durumda rozet gosteriliyor. */}
                {questionOrigin === 'ai' ? (
                    <View style={styles.originRow}>
                        <Text style={[styles.headerChip, styles.headerChipAi]}>
                            AI üretti
                        </Text>
                    </View>
                ) : null}
            </View>

            <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressRatio * 100}%` }]} />
            </View>

            {bootError ? <Text style={styles.error}>{bootError}</Text> : null}

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
                            setAnsweredCount((previous) => previous + 1);
                            const isCorrect =
                                option.trim().charAt(0).toUpperCase() ===
                                currentQuestion.dogruCevap.trim().charAt(0).toUpperCase();

                            void submitAnswer(option)
                                .then(() => {
                                    if (isCorrect) {
                                        setCorrectCount((previous) => previous + 1);
                                    }
                                })
                                // Hata durumu useQuiz icinde zaten ekrana
                                // yansiyor; burada yutulmasi yeterli.
                                .catch(() => undefined);
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

                    {isSessionFinished ? (
                        <View style={styles.summaryBox}>
                            <Text style={styles.summaryTitle}>Test tamamlandı</Text>
                            <Text style={styles.summaryText}>
                                {sessionQuestionCount} sorudan {correctCount} doğru
                            </Text>
                        </View>
                    ) : null}

                    {isSessionFinished ? (
                        <Pressable
                            onPress={() => router.push('/(tabs)/sources')}
                            style={({ pressed }) => [
                                styles.primaryButton,
                                pressed ? styles.pressed : null,
                            ]}
                        >
                            <Text style={styles.primaryButtonText}>Testi Bitir</Text>
                        </Pressable>
                    ) : (
                        <Pressable
                            onPress={() => {
                                void handleNextQuestion();
                            }}
                            disabled={isGenerating}
                            style={({ pressed }) => [
                                styles.primaryButton,
                                pressed ? styles.pressed : null,
                                isGenerating ? styles.buttonDisabled : null,
                            ]}
                        >
                            {isGenerating ? (
                                <ActivityIndicator size="small" color={palette.onDarkPrimary} />
                            ) : (
                                <>
                                    <Text style={styles.primaryButtonText}>Sonraki Soru</Text>
                                    <Ionicons
                                        name="arrow-forward"
                                        size={16}
                                        color={palette.onDarkPrimary}
                                    />
                                </>
                            )}
                        </Pressable>
                    )}
                </AnimatedCard>
            ) : null}
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
    headerChipBank: {
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
        ...uiType.heading,
        color: palette.textPrimary,
    },
    pressed: {
        opacity: 0.85,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    timerChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 5,
        paddingHorizontal: 9,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        backgroundColor: palette.pageBg,
    },
    timerChipText: {
        fontSize: 12,
        fontWeight: '700',
        color: palette.textSecondary,
    },
    originRow: {
        flexDirection: 'row',
        marginTop: 8,
    },
    progressTrack: {
        height: 6,
        borderRadius: radius.pill,
        backgroundColor: palette.cardBorder,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: radius.pill,
        backgroundColor: palette.indigo600,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        marginTop: spacing.sm,
        paddingVertical: 13,
        borderRadius: radius.pill,
        backgroundColor: palette.indigo600,
    },
    primaryButtonText: {
        color: palette.onDarkPrimary,
        fontSize: 15,
        fontWeight: '700',
    },
    summaryBox: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.emerald500,
        backgroundColor: palette.emeraldSurface,
        padding: spacing.md,
        gap: 4,
    },
    summaryTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#065f46',
    },
    summaryText: {
        fontSize: 14,
        color: palette.textSecondary,
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
    generationInfo: {
        fontSize: 13,
        color: palette.indigo600,
    },
});
