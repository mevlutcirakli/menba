import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
    const insets = useSafeAreaInsets();
    const { sourceId, topicId, topicName, count } = useLocalSearchParams<{
        sourceId: string;
        topicId?: string;
        topicName?: string;
        count?: string;
    }>();

    const initialTopicId = typeof topicId === 'string' ? topicId : undefined;
    const initialTopicName = typeof topicName === 'string' ? topicName.trim() : '';

    // Test uzunlugu = secilen konudaki (ya da tum kaynaktaki) hazir soru
    // sayisi. Konu ekranindan parametre olarak geliyor; ust sinir yok,
    // amac bankadaki sorularin tamamini cozdurmek.
    const sessionQuestionCount = useMemo(() => {
        const parsed = Number(count);
        return Number.isFinite(parsed) && parsed > 0
            ? Math.round(parsed)
            : DEFAULT_SESSION_QUESTION_COUNT;
    }, [count]);

    const {
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

    const closeFlow = () => router.push('/(tabs)/sources');

    if (isLoading) {
        return (
            <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
                <StatusBar style="dark" />
                <View style={styles.stateWrap}>
                    <SkeletonCard height={96} />
                    <Text style={styles.stateText}>Soru ortamı hazırlanıyor...</Text>
                </View>
            </View>
        );
    }

    if (error) {
        return (
            <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
                <StatusBar style="dark" />
                <View style={styles.stateWrap}>
                    <Text style={styles.errorTitle}>Akış açılamadı</Text>
                    <Text style={styles.errorText}>{error}</Text>
                    <Link href="/(tabs)/sources" style={styles.stateLinkButton}>
                        Kaynaklara Dön
                    </Link>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.screen}>
            <StatusBar style="dark" />

            <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
                <View style={styles.headerTopRow}>
                    <Text style={styles.headerEyebrow} numberOfLines={1}>
                        {activeTopicName.toLocaleUpperCase('tr-TR')}
                    </Text>

                    {currentQuestion && !answerFeedback ? (
                        <View style={styles.timerChip}>
                            <Ionicons
                                name="time-outline"
                                size={12}
                                color={palette.textMuted}
                            />
                            <Text style={styles.timerChipText}>
                                {formatElapsed(elapsedSeconds)}
                            </Text>
                        </View>
                    ) : null}

                    {/* Link asChild cocugun `style`ini undefined ile ezdigi icin
                        router.push kullaniliyor. */}
                    <Pressable onPress={closeFlow} style={styles.closeButton} hitSlop={8}>
                        <Ionicons name="close" size={18} color={palette.textSecondary} />
                    </Pressable>
                </View>

                <View style={styles.progressRow}>
                    <View style={styles.progressTrack}>
                        <View
                            style={[styles.progressFill, { width: `${progressRatio * 100}%` }]}
                        />
                    </View>
                    <Text style={styles.progressLabel}>
                        {currentQuestionNumber} / {sessionQuestionCount}
                    </Text>
                </View>

                {/* Kaynaktaki sorular bitince AI uretimine geciliyor; yalnizca
                    o durumda rozet gosteriliyor. */}
                {questionOrigin === 'ai' ? (
                    <View style={styles.aiBadge}>
                        <Ionicons name="sparkles" size={10} color={palette.accent} />
                        <Text style={styles.aiBadgeText}>AI üretti</Text>
                    </View>
                ) : null}
            </View>

            <ScrollView
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
            >
                {bootError ? <Text style={styles.errorText}>{bootError}</Text> : null}

                {!currentQuestion && isGenerating ? (
                    <View style={styles.stateWrap}>
                        <SkeletonCard height={96} />
                        <Text style={styles.stateText}>İlk soru hazırlanıyor...</Text>
                    </View>
                ) : null}

                {!currentQuestion && !isGenerating ? (
                    <Pressable
                        onPress={() => {
                            hasBootstrappedRef.current = true;
                            void bootstrapQuestion();
                        }}
                        style={({ pressed }) => [
                            styles.secondaryButton,
                            pressed ? styles.pressed : null,
                        ]}
                    >
                        <Text style={styles.secondaryButtonText}>Akışı Tekrar Başlat</Text>
                    </Pressable>
                ) : null}

                {currentQuestion ? (
                    <AnimatedCard
                        delayMs={40}
                        resetKey={`${currentQuestion.soru}-${activeTopic?.id ?? 'unknown'}`}
                    >
                        <QuestionCard
                            question={currentQuestion}
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
                        {isSubmittingAnswer ? (
                            <ActivityIndicator
                                size="small"
                                color={palette.accent}
                                style={styles.inlineSpinner}
                            />
                        ) : null}
                    </AnimatedCard>
                ) : null}

                {answerFeedback ? (
                    <AnimatedCard
                        style={styles.solutionCard}
                        delayMs={60}
                        resetKey={`${answerFeedback.userChoice}-${answerFeedback.correctChoice}-${answerFeedback.isCorrect}`}
                    >
                        <View style={styles.solutionHead}>
                            <Ionicons name="sparkles" size={13} color={palette.accent} />
                            <Text style={styles.solutionEyebrow}>AI ÇÖZÜM AÇIKLAMASI</Text>
                        </View>

                        <Text style={styles.solutionBody}>{answerFeedback.explanation}</Text>

                        {!answerFeedback.isCorrect ? (
                            <Pressable
                                onPress={() => {
                                    void handleExplainWrong();
                                }}
                                disabled={isExplaining}
                                style={({ pressed }) => [
                                    styles.deepAnalysisButton,
                                    pressed ? styles.pressed : null,
                                    isExplaining ? styles.disabled : null,
                                ]}
                            >
                                <Ionicons name="sparkles" size={12} color={palette.accent} />
                                <Text style={styles.deepAnalysisText}>
                                    {isExplaining ? 'Analiz alınıyor...' : 'Derin analiz iste'}
                                </Text>
                            </Pressable>
                        ) : null}

                        {!answerFeedback.isCorrect && (isExplaining || wrongAnswerExplanation) ? (
                            <View style={styles.coachBox}>
                                {isExplaining && !wrongAnswerExplanation ? (
                                    <View style={styles.coachLoadingRow}>
                                        <ActivityIndicator
                                            size="small"
                                            color={palette.accent}
                                        />
                                        <Text style={styles.coachText}>
                                            Koç bu soruyu inceliyor...
                                        </Text>
                                    </View>
                                ) : (
                                    <Text style={styles.coachText}>
                                        {wrongAnswerExplanation}
                                    </Text>
                                )}
                            </View>
                        ) : null}
                    </AnimatedCard>
                ) : null}

                {isSessionFinished ? (
                    <View style={styles.summaryBox}>
                        <Text style={styles.summaryTitle}>Test tamamlandı</Text>
                        <Text style={styles.summaryText}>
                            {sessionQuestionCount} sorudan {correctCount} doğru
                        </Text>
                    </View>
                ) : null}
            </ScrollView>

            {/* Tasarimda birincil aksiyon ekranin altina sabit. */}
            {answerFeedback ? (
                <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
                    {isSessionFinished ? (
                        <Pressable
                            onPress={closeFlow}
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
                                isGenerating ? styles.disabled : null,
                            ]}
                        >
                            {isGenerating ? (
                                <ActivityIndicator
                                    size="small"
                                    color={palette.onDarkPrimary}
                                />
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
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: palette.pageBg,
    },
    header: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.md,
        gap: spacing.sm,
        backgroundColor: palette.pageBg,
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    headerEyebrow: {
        flex: 1,
        ...uiType.statLabel,
        color: palette.accent,
    },
    timerChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: radius.pill,
        backgroundColor: palette.subtleBg,
    },
    timerChipText: {
        fontSize: 11,
        fontWeight: '700',
        color: palette.textMuted,
    },
    closeButton: {
        width: 30,
        height: 30,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.subtleBg,
    },
    progressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    progressTrack: {
        flex: 1,
        height: 6,
        borderRadius: radius.pill,
        backgroundColor: palette.teal50,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: radius.pill,
        backgroundColor: palette.accent,
    },
    progressLabel: {
        ...uiType.small,
        fontWeight: '700',
        color: palette.textMuted,
    },
    aiBadge: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: radius.pill,
        backgroundColor: palette.primarySurface,
    },
    aiBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: palette.accent,
    },
    container: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xl,
        gap: spacing.md,
    },
    inlineSpinner: {
        marginTop: spacing.sm,
    },
    solutionCard: {
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: palette.primarySurface,
    },
    solutionHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    solutionEyebrow: {
        ...uiType.statLabel,
        color: palette.accent,
    },
    solutionBody: {
        ...uiType.small,
        lineHeight: 19,
        color: palette.textSecondary,
    },
    deepAnalysisButton: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: spacing.xs,
        paddingVertical: 7,
        paddingHorizontal: 11,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: palette.primaryBorder,
        backgroundColor: palette.cardBg,
    },
    deepAnalysisText: {
        fontSize: 12,
        fontWeight: '700',
        color: palette.accent,
    },
    coachBox: {
        marginTop: spacing.xs,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: palette.cardBg,
    },
    coachLoadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    coachText: {
        flex: 1,
        ...uiType.small,
        lineHeight: 19,
        color: palette.textSecondary,
    },
    summaryBox: {
        alignItems: 'center',
        gap: spacing.xs,
        padding: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.successBorder,
        backgroundColor: palette.successSurface,
    },
    summaryTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: palette.teal900,
    },
    summaryText: {
        ...uiType.small,
        color: palette.textSecondary,
    },
    footer: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
        backgroundColor: palette.pageBg,
        borderTopWidth: 1,
        borderTopColor: palette.cardBorder,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: 15,
        borderRadius: radius.md,
        backgroundColor: palette.primary,
    },
    primaryButtonText: {
        color: palette.onDarkPrimary,
        fontSize: 15,
        fontWeight: '700',
    },
    secondaryButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 13,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.primaryBorder,
        backgroundColor: palette.cardBg,
    },
    secondaryButtonText: {
        color: palette.accent,
        fontSize: 14,
        fontWeight: '700',
    },
    stateWrap: {
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
    },
    stateText: {
        ...uiType.body,
        color: palette.textMuted,
        textAlign: 'center',
    },
    stateLinkButton: {
        alignSelf: 'flex-start',
        marginTop: spacing.sm,
        backgroundColor: palette.primary,
        color: palette.onDarkPrimary,
        borderRadius: radius.md,
        overflow: 'hidden',
        paddingVertical: 11,
        paddingHorizontal: 16,
        fontSize: 14,
        fontWeight: '700',
    },
    errorTitle: {
        color: palette.danger,
        fontSize: 16,
        fontWeight: '700',
    },
    errorText: {
        color: palette.danger,
        fontSize: 13,
        lineHeight: 19,
    },
    pressed: {
        opacity: 0.75,
    },
    disabled: {
        opacity: 0.55,
    },
});
