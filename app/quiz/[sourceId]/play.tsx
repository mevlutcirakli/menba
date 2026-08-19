import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { localizeError } from '../../../src/utils/errors';

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
    const [answerError, setAnswerError] = useState<string | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    // Ilk soru denemesi tamamlanana kadar "Akisi Tekrar Baslat" butonu
    // gosterilmez; aksi halde akis acilirken bir an hata kurtarma butonu
    // goruntuleniyordu.
    const [hasAttemptedBoot, setHasAttemptedBoot] = useState(false);
    const hasBootstrappedRef = useRef(false);
    /**
     * "Derin analiz" sonuclari soru metnine gore saklanir; ayni soru icin
     * ikinci kez istenirse yeni bir AI cagrisi yapilmaz.
     */
    const explanationCacheRef = useRef<Map<string, string>>(new Map());

    const isSessionFinished = answeredCount >= sessionQuestionCount && Boolean(answerFeedback);
    const currentQuestionNumber = Math.min(
        sessionQuestionCount,
        answerFeedback ? answeredCount : answeredCount + 1
    );
    const progressRatio = Math.min(1, currentQuestionNumber / sessionQuestionCount);
    const sessionAccuracy =
        answeredCount === 0 ? 0 : Math.round((correctCount / answeredCount) * 100);

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

            throw new Error('Akışı başlatmak için uygun konu bulunamadı.');
        } catch (generationError) {
            setBootError(localizeError(generationError, 'İlk soru açılamadı.'));
        } finally {
            setHasAttemptedBoot(true);
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
        setAnswerError(null);
        setHasAttemptedBoot(false);
    }, [sourceId, initialTopicId, initialTopicName]);

    useEffect(() => {
        if (isLoading || isGenerating || currentQuestion || hasBootstrappedRef.current) {
            return;
        }

        if (!initialTopicId && !initialTopicName && !recommendedTopicId) {
            // Hicbir konu yok: beklenecek bir sey de yok, kullaniciya
            // gercekten bir cikis yolu gosterilmeli.
            setHasAttemptedBoot(true);
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

        // Ayni soru icin daha once analiz alindiysa tekrar AI cagrisi yapma.
        const cached = explanationCacheRef.current.get(currentQuestion.soru);
        if (cached) {
            setWrongAnswerExplanation(cached);
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

            explanationCacheRef.current.set(currentQuestion.soru, explanation);
            setWrongAnswerExplanation(explanation);
        } catch (explainError) {
            setWrongAnswerExplanation(
                localizeError(explainError, 'Açıklama alınamadı.')
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
        setAnswerError(null);

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

        setBootError('Sonraki soru için uygun konu bulunamadı.');
    }, [
        activeTopic?.id,
        generateForTopic,
        initialTopicId,
        initialTopicName,
        isGenerating,
        pickTopicWithRemainingBank,
        recommendedTopicId,
    ]);

    /**
     * Akistan cikis. `push` yerine `back`: her cikista yeni bir ekran
     * yiginin ustune eklendigi icin Android geri tusu eski, bayat quiz
     * ekranlarini tek tek geri dolasiyordu.
     */
    const closeFlow = useCallback(() => {
        if (router.canGoBack()) {
            router.back();
            return;
        }

        router.replace('/(tabs)/sources');
    }, [router]);

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

    // Yalnizca soru gosterilemiyorken tam ekran hataya dusuyoruz. Onceden her
    // `error` degeri bu dala giriyordu: tek bir cevap kaydedilemediginde
    // ekrandaki soru ve ilerleme tamamen kayboluyordu.
    if (error && !currentQuestion) {
        return (
            <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
                <StatusBar style="dark" />
                <View style={styles.stateWrap}>
                    <Text style={styles.errorTitle}>Akış açılamadı</Text>
                    <Text style={styles.errorText}>{error}</Text>

                    <Pressable
                        onPress={() => {
                            hasBootstrappedRef.current = true;
                            void bootstrapQuestion();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Tekrar dene"
                        style={({ pressed }) => [
                            styles.primaryButton,
                            styles.stateButton,
                            pressed ? styles.pressed : null,
                        ]}
                    >
                        <Ionicons
                            name="refresh"
                            size={16}
                            color={palette.onDarkPrimary}
                        />
                        <Text style={styles.primaryButtonText}>Tekrar Dene</Text>
                    </Pressable>

                    <Pressable
                        onPress={closeFlow}
                        accessibilityRole="button"
                        accessibilityLabel="Kaynaklara dön"
                        style={({ pressed }) => [
                            styles.secondaryButton,
                            pressed ? styles.pressed : null,
                        ]}
                    >
                        <Text style={styles.secondaryButtonText}>Kaynaklara Dön</Text>
                    </Pressable>
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
                        router.back kullaniliyor. */}
                    <Pressable
                        onPress={closeFlow}
                        style={styles.closeButton}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="Testi kapat"
                    >
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

                {/* Yukleme durumu artik banka yolunu da kapsiyor: `isGenerating`
                    yalnizca AI uretiminde kalkiyordu, bu yuzden bankadan soru
                    cekilirken ekran bos gorunup "Akisi Tekrar Baslat" butonunu
                    gosteriyordu. */}
                {!currentQuestion && (isGenerating || !hasAttemptedBoot) ? (
                    <View style={styles.stateWrap}>
                        <SkeletonCard height={96} />
                        <Text style={styles.stateText}>Soru hazırlanıyor...</Text>
                    </View>
                ) : null}

                {!currentQuestion && !isGenerating && hasAttemptedBoot ? (
                    <Pressable
                        onPress={() => {
                            hasBootstrappedRef.current = true;
                            void bootstrapQuestion();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Akışı tekrar başlat"
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
                                setAnswerError(null);

                                const isCorrect =
                                    option.trim().charAt(0).toUpperCase() ===
                                    currentQuestion.dogruCevap.trim().charAt(0).toUpperCase();

                                void submitAnswer(option)
                                    .then((wasRecorded) => {
                                        // Sayaclar ancak cevap gercekten
                                        // kaydedildikten sonra artiyor. Onceden
                                        // `answeredCount` istekten once
                                        // artiriliyordu: ag hatasinda soru
                                        // "cozuldu ama yanlis" sayilip test
                                        // ozetini bozuyordu. `wasRecorded`
                                        // false ise bu cift dokunusun ikinci
                                        // cagrisi, sayilmamali.
                                        if (!wasRecorded) {
                                            return;
                                        }

                                        setAnsweredCount((previous) => previous + 1);
                                        if (isCorrect) {
                                            setCorrectCount((previous) => previous + 1);
                                        }
                                    })
                                    .catch((submitError) => {
                                        setAnswerError(
                                            localizeError(
                                                submitError,
                                                'Cevabın kaydedilemedi.'
                                            )
                                        );
                                    });
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

                {/* Cevap kaydedilemedi: soru ekranda kaliyor, kullanici ayni
                    sikka tekrar dokunarak yeniden deneyebiliyor. */}
                {answerError ? (
                    <View style={styles.answerErrorRow}>
                        <Ionicons name="alert-circle" size={16} color={palette.danger} />
                        <Text style={styles.answerErrorText}>
                            {answerError} Şıkka tekrar dokunarak yeniden deneyebilirsin.
                        </Text>
                    </View>
                ) : null}

                {answerFeedback ? (
                    <AnimatedCard
                        style={[
                            styles.solutionCard,
                            answerFeedback.isCorrect
                                ? styles.solutionCardCorrect
                                : styles.solutionCardWrong,
                        ]}
                        delayMs={60}
                        resetKey={`${answerFeedback.userChoice}-${answerFeedback.correctChoice}-${answerFeedback.isCorrect}`}
                    >
                        {/* Hukum: dogru mu yanlis mi, yanlissa hangi sikki
                            isaretledi ve dogrusu neydi. */}
                        <View style={styles.verdictRow}>
                            <Ionicons
                                name={
                                    answerFeedback.isCorrect
                                        ? 'checkmark-circle'
                                        : 'close-circle'
                                }
                                size={18}
                                color={
                                    answerFeedback.isCorrect
                                        ? palette.success
                                        : palette.danger
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
                                {answerFeedback.isCorrect
                                    ? 'Doğru cevap!'
                                    : `Yanlış cevap — ${answerFeedback.userChoice} şıkkını işaretledin, doğrusu ${answerFeedback.correctChoice}.`}
                            </Text>
                        </View>

                        <View style={styles.solutionHead}>
                            <Ionicons name="sparkles" size={13} color={palette.accent} />
                            <Text style={styles.solutionEyebrow}>ÇÖZÜM AÇIKLAMASI</Text>
                        </View>

                        <Text style={styles.solutionBody}>
                            {/* AI yolunda Edge Function aciklamasiz da
                                donebiliyor; optional chain kasitli. */}
                            {answerFeedback.explanation?.trim()
                                ? answerFeedback.explanation
                                : 'Bu soru için kayıtlı bir açıklama yok.'}
                        </Text>

                        {!answerFeedback.isCorrect ? (
                            <Pressable
                                onPress={() => {
                                    void handleExplainWrong();
                                }}
                                disabled={isExplaining}
                                accessibilityRole="button"
                                accessibilityLabel="Bu soru için derin analiz iste"
                                accessibilityState={{
                                    disabled: isExplaining,
                                    busy: isExplaining,
                                }}
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
                    <AnimatedCard style={styles.summaryBox} delayMs={80} resetKey="summary">
                        <Ionicons name="trophy" size={26} color={palette.accent} />
                        <Text style={styles.summaryTitle}>Test tamamlandı</Text>

                        <View style={styles.summaryStatRow}>
                            <View style={styles.summaryStat}>
                                <Text style={styles.summaryStatValue}>
                                    %{sessionAccuracy}
                                </Text>
                                <Text style={styles.summaryStatLabel}>Başarı</Text>
                            </View>
                            <View style={styles.summaryStatDivider} />
                            <View style={styles.summaryStat}>
                                <Text style={styles.summaryStatValue}>{correctCount}</Text>
                                <Text style={styles.summaryStatLabel}>Doğru</Text>
                            </View>
                            <View style={styles.summaryStatDivider} />
                            <View style={styles.summaryStat}>
                                <Text style={styles.summaryStatValue}>
                                    {Math.max(0, answeredCount - correctCount)}
                                </Text>
                                <Text style={styles.summaryStatLabel}>Yanlış</Text>
                            </View>
                        </View>

                        <Text style={styles.summaryText}>
                            {answeredCount} soru çözdün. Yanlışların konu başarına
                            yansıdı; ana sayfadaki öneriler buna göre güncellenir.
                        </Text>
                    </AnimatedCard>
                ) : null}
            </ScrollView>

            {/* Tasarimda birincil aksiyon ekranin altina sabit. */}
            {answerFeedback ? (
                <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
                    {isSessionFinished ? (
                        <View style={styles.footerRow}>
                            {/* Cikis artik geldigi konu ekranina donuyor:
                                kullanici guncellenen "cozuldu" sayilarini
                                hemen goruyor. */}
                            <Pressable
                                onPress={closeFlow}
                                accessibilityRole="button"
                                accessibilityLabel="Konuya dön"
                                style={({ pressed }) => [
                                    styles.primaryButton,
                                    styles.footerFlex,
                                    pressed ? styles.pressed : null,
                                ]}
                            >
                                <Text style={styles.primaryButtonText}>Konuya Dön</Text>
                            </Pressable>

                            <Pressable
                                onPress={() => router.replace('/(tabs)')}
                                accessibilityRole="button"
                                accessibilityLabel="Ana sayfaya git"
                                style={({ pressed }) => [
                                    styles.secondaryButton,
                                    styles.footerFlex,
                                    pressed ? styles.pressed : null,
                                ]}
                            >
                                <Text style={styles.secondaryButtonText}>Ana Sayfa</Text>
                            </Pressable>
                        </View>
                    ) : (
                        <Pressable
                            onPress={() => {
                                void handleNextQuestion();
                            }}
                            disabled={isGenerating}
                            accessibilityRole="button"
                            accessibilityLabel="Sonraki soru"
                            accessibilityState={{
                                disabled: isGenerating,
                                busy: isGenerating,
                            }}
                            style={({ pressed }) => [
                                styles.primaryButton,
                                pressed ? styles.pressed : null,
                                isGenerating ? styles.disabled : null,
                            ]}
                        >
                            {isGenerating ? (
                                <>
                                    <ActivityIndicator
                                        size="small"
                                        color={palette.onDarkPrimary}
                                    />
                                    <Text style={styles.primaryButtonText}>
                                        Hazırlanıyor...
                                    </Text>
                                </>
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
        borderWidth: 1,
        backgroundColor: palette.primarySurface,
    },
    solutionCardCorrect: {
        borderColor: palette.successBorder,
        backgroundColor: palette.successSurface,
    },
    solutionCardWrong: {
        borderColor: palette.dangerBorder,
        backgroundColor: palette.dangerSurface,
    },
    verdictRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    verdictText: {
        flex: 1,
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '700',
    },
    verdictTextCorrect: {
        color: palette.success,
    },
    verdictTextWrong: {
        color: palette.danger,
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
        gap: spacing.sm,
        padding: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.successBorder,
        backgroundColor: palette.successSurface,
    },
    summaryTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: palette.teal900,
    },
    summaryStatRow: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        marginVertical: spacing.xs,
    },
    summaryStat: {
        flex: 1,
        alignItems: 'center',
        gap: 2,
    },
    summaryStatDivider: {
        width: 1,
        height: 26,
        backgroundColor: palette.successBorder,
    },
    summaryStatValue: {
        fontSize: 20,
        fontWeight: '800',
        color: palette.teal900,
    },
    summaryStatLabel: {
        ...uiType.small,
        color: palette.textSecondary,
    },
    summaryText: {
        ...uiType.small,
        color: palette.textSecondary,
        textAlign: 'center',
    },
    answerErrorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.dangerBorder,
        backgroundColor: palette.dangerSurface,
    },
    answerErrorText: {
        flex: 1,
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
    footerRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    footerFlex: {
        flex: 1,
    },
    stateButton: {
        alignSelf: 'stretch',
        marginTop: spacing.sm,
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
