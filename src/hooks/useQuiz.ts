import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateTopicWeights, pickNextTopic } from '../services/adaptiveEngine';
import { generateQuestion } from '../services/geminiService';
import { supabase } from '../services/supabase';
import type { Database } from '../types/database.types';
import type { GeneratedQuestion } from '../types/quiz.types';
import { localizeError } from '../utils/errors';

type Source = Database['public']['Tables']['sources']['Row'];
type Topic = Database['public']['Tables']['topics']['Row'];
type QuestionRow = Database['public']['Tables']['questions']['Row'];

interface AnswerFeedback {
    isCorrect: boolean;
    userChoice: string;
    correctChoice: string;
    explanation: string;
}

interface GenerateForTopicOptions {
    topicId?: string;
    topicName?: string;
    difficulty?: number;
}

const MAX_SOURCE_CONTEXT_CHARS = 9000;
const PREFETCH_QUEUE_LIMIT = 2;
// Konudaki hazir sorularin tamami dolasilabilsin diye havuz genis tutuluyor.
const STORED_QUESTION_POOL_LIMIT = 500;

/**
 * Sorunun nereden geldigi.
 * - 'bank': kaynak metinden cikarilmis, gercek soru
 * - 'ai'  : konudaki hazir sorular bitince AI'in urettigi yeni soru
 */
export type QuestionOrigin = 'bank' | 'ai';

interface PreparedQuestion {
    question: GeneratedQuestion;
    /** Bankadan geldiyse satir kimligi, uretildiyse null. */
    questionId: string | null;
    origin: QuestionOrigin;
}

function getQueueKey(topicId: string, difficulty: number): string {
    return `${topicId}:${difficulty}`;
}

/**
 * extract-questions, aciklama uretemedigi sorulara bu yer tutucuyu yaziyor.
 * Ekranda ham haliyle gostermek yerine bos kabul edip UI'in kendi Turkce
 * mesajini basmasina birakiyoruz.
 */
const EXPLANATION_PLACEHOLDER = 'Aciklama bulunmuyor.';

function mapQuestionRowToGeneratedQuestion(row: QuestionRow): GeneratedQuestion {
    const options = Array.isArray(row.options)
        ? row.options.filter((item): item is string => typeof item === 'string')
        : [];

    const explanation = row.explanation?.trim() ?? '';

    return {
        soru: row.question_text,
        secenekler: options,
        dogruCevap: row.correct_answer,
        aciklama: explanation === EXPLANATION_PLACEHOLDER ? '' : explanation,
    };
}

function normalizeChoice(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }

    return trimmed.charAt(0).toUpperCase();
}

function selectRelevantSourceExcerpt(sourceText: string, topicName: string): string {
    if (sourceText.length <= MAX_SOURCE_CONTEXT_CHARS) {
        return sourceText;
    }

    const topicTokens = topicName
        .toLowerCase()
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);

    const paragraphs = sourceText
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);

    const scoredParagraphs = paragraphs
        .map((paragraph) => {
            const lower = paragraph.toLowerCase();
            const score = topicTokens.reduce(
                (sum, token) => sum + (lower.includes(token) ? 1 : 0),
                0
            );
            return { paragraph, score };
        })
        .sort((a, b) => b.score - a.score);

    let result = '';
    for (const item of scoredParagraphs) {
        if (result.length >= MAX_SOURCE_CONTEXT_CHARS) {
            break;
        }

        if (item.score === 0 && result.length > 0) {
            continue;
        }

        const nextChunk = `${item.paragraph}\n\n`;
        if (result.length + nextChunk.length > MAX_SOURCE_CONTEXT_CHARS) {
            const remaining = MAX_SOURCE_CONTEXT_CHARS - result.length;
            result += `${nextChunk.slice(0, Math.max(0, remaining))}`;
            break;
        }

        result += nextChunk;
    }

    if (!result.trim()) {
        return sourceText.slice(0, MAX_SOURCE_CONTEXT_CHARS);
    }

    return result.trim();
}

export function useQuiz(sourceId?: string) {
    const [source, setSource] = useState<Source | null>(null);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [currentQuestion, setCurrentQuestion] = useState<GeneratedQuestion | null>(null);
    const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
    const [questionOrigin, setQuestionOrigin] = useState<QuestionOrigin | null>(null);
    const [activeTopic, setActiveTopic] = useState<Topic | null>(null);
    const [answerFeedback, setAnswerFeedback] = useState<AnswerFeedback | null>(null);
    const [questionStartedAt, setQuestionStartedAt] = useState<number | null>(null);
    const [recommendedTopicId, setRecommendedTopicId] = useState<string | null>(null);
    const [activeDifficulty, setActiveDifficulty] = useState(3);
    const [generationStatus, setGenerationStatus] = useState<string | null>(null);
    const [prefetchedQuestionCount, setPrefetchedQuestionCount] = useState(0);
    const [storedQuestionCount, setStoredQuestionCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const prefetchedQuestionsRef = useRef<Map<string, PreparedQuestion[]>>(new Map());
    const prefetchInFlightRef = useRef<Set<string>>(new Set());
    // Uretim/banka cekimi surerken gelen ikinci cagriyi engeller. `isGenerating`
    // state'i tek basina yetmiyor: iki dokunus ayni render'da islenirse ikisi de
    // eski (false) degeri gorup ayni anda soru tuketiyordu.
    const generationInFlightRef = useRef(false);
    /** Ayni soruya cift dokunusun iki log satiri yazmasini engeller. */
    const submitInFlightRef = useRef(false);
    const askedQuestionIdsRef = useRef<Set<string>>(new Set());
    // "Tum Konular" modunda siradaki konuyu secebilmek icin konu basina
    // bankadaki soru sayisi ve bu oturumda kacinin cozuldugu tutuluyor.
    const bankCountByTopicRef = useRef<Map<string, number>>(new Map());
    const askedBankCountByTopicRef = useRef<Map<string, number>>(new Map());

    const updatePrefetchedCount = useCallback(() => {
        let total = 0;
        for (const queue of prefetchedQuestionsRef.current.values()) {
            total += queue.length;
        }
        setPrefetchedQuestionCount(total);
    }, []);

    const clearPrefetchedQuestions = useCallback(() => {
        prefetchedQuestionsRef.current.clear();
        prefetchInFlightRef.current.clear();
        setPrefetchedQuestionCount(0);
    }, []);

    useEffect(() => {
        clearPrefetchedQuestions();
        askedQuestionIdsRef.current.clear();
        bankCountByTopicRef.current.clear();
        askedBankCountByTopicRef.current.clear();
        setCurrentQuestionId(null);
        setGenerationStatus(null);
        setStoredQuestionCount(0);
    }, [clearPrefetchedQuestions, sourceId]);

    useEffect(() => {
        const focusTopicId = activeTopic?.id ?? recommendedTopicId;
        if (!focusTopicId) {
            setStoredQuestionCount(0);
            return;
        }

        let cancelled = false;
        const loadStoredCount = async () => {
            const { count } = await supabase
                .from('questions')
                .select('*', { head: true, count: 'exact' })
                .eq('topic_id', focusTopicId);

            if (!cancelled) {
                setStoredQuestionCount(count ?? 0);
            }
        };

        void loadStoredCount();

        return () => {
            cancelled = true;
        };
    }, [activeTopic?.id, recommendedTopicId]);

    const refresh = useCallback(async () => {
        if (!sourceId) {
            setError('Geçerli bir kaynak seçilmedi.');
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        const [{ data: sourceData, error: sourceError }, { data: topicData, error: topicError }] =
            await Promise.all([
                supabase.from('sources').select('*').eq('id', sourceId).maybeSingle(),
                supabase.from('topics').select('*').eq('source_id', sourceId).order('created_at'),
            ]);

        if (sourceError) {
            setError(localizeError(sourceError, 'Kaynak açılamadı.'));
            setIsLoading(false);
            return;
        }

        if (!sourceData) {
            setError('Kaynak bulunamadı veya bu kaynağa erişim izniniz yok.');
            setIsLoading(false);
            return;
        }

        if (topicError) {
            setError(localizeError(topicError, 'Konular yüklenemedi.'));
            setIsLoading(false);
            return;
        }

        const safeTopics = topicData ?? [];
        setSource(sourceData);
        setTopics(safeTopics);

        if (safeTopics.length === 0) {
            setRecommendedTopicId(null);
            bankCountByTopicRef.current.clear();
            setIsLoading(false);
            return;
        }

        // Konu basina banka sayilari: "Tum Konular" testinde siradaki konuyu
        // hala cozulmemis sorusu olanlar arasindan secmek icin.
        const { data: bankRows } = await supabase
            .from('questions')
            .select('id, topic_id')
            .in(
                'topic_id',
                safeTopics.map((topic) => topic.id)
            );

        const bankCounts = new Map<string, number>();
        for (const row of bankRows ?? []) {
            bankCounts.set(row.topic_id, (bankCounts.get(row.topic_id) ?? 0) + 1);
        }
        bankCountByTopicRef.current = bankCounts;

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setRecommendedTopicId(safeTopics[0].id);
            setIsLoading(false);
            return;
        }

        // Daha once cevaplanmis sorular "gorulmus" sayiliyor. Bu kume onceden
        // yalnizca bellekte (bu mount suresince) tutuluyordu; ekrandan cikip
        // teste yeniden baslayinca sifirlaniyor ve ayni sorular tekrar
        // servis ediliyordu. Gecmis question_logs'ta duruyor, oradan
        // tohumlaniyor ki banka gercekten tukensin.
        const bankQuestionIds = new Set((bankRows ?? []).map((row) => row.id));
        if (bankQuestionIds.size > 0) {
            // Loglar kullanici bazinda cekilip istemcide kesistiriliyor:
            // .in(...) ile binlerce soru kimligi gondermek URL sinirina
            // takilabiliyor.
            const { data: answeredRows } = await supabase
                .from('question_logs')
                .select('question_id')
                .eq('user_id', user.id);

            for (const row of answeredRows ?? []) {
                if (bankQuestionIds.has(row.question_id)) {
                    askedQuestionIdsRef.current.add(row.question_id);
                }
            }
        }

        // Konu basina "gorulmus" sayisi sifirdan hesaplaniyor; refresh birden
        // fazla kez kosarsa sayac sismesin.
        const askedCounts = new Map<string, number>();
        for (const row of bankRows ?? []) {
            if (askedQuestionIdsRef.current.has(row.id)) {
                askedCounts.set(row.topic_id, (askedCounts.get(row.topic_id) ?? 0) + 1);
            }
        }
        askedBankCountByTopicRef.current = askedCounts;

        const topicIds = safeTopics.map((topic) => topic.id);
        const { data: progressRows, error: progressError } = await supabase
            .from('user_progress')
            .select('*')
            .eq('user_id', user.id)
            .in('topic_id', topicIds);

        if (progressError) {
            setRecommendedTopicId(safeTopics[0].id);
            setIsLoading(false);
            return;
        }

        const progressMap = new Map((progressRows ?? []).map((row) => [row.topic_id, row]));
        const weighted = calculateTopicWeights(
            safeTopics.map((topic) => {
                const progress = progressMap.get(topic.id);
                return {
                    topicId: topic.id,
                    totalAttempts: progress?.total_attempts ?? 0,
                    correctAttempts: progress?.correct_attempts ?? 0,
                    lastAttemptedAt: progress?.last_attempted_at
                        ? new Date(progress.last_attempted_at)
                        : null,
                };
            })
        );

        const pickedTopicId = pickNextTopic(weighted);
        setRecommendedTopicId(pickedTopicId);

        setIsLoading(false);
    }, [sourceId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const requestQuestionForTopic = useCallback(
        async (topic: Topic, difficulty: number): Promise<GeneratedQuestion> => {
            if (!source) {
                throw new Error('Kaynak yuklenemedi.');
            }

            return generateQuestion({
                sourceContent: selectRelevantSourceExcerpt(source.content_text, topic.name),
                topicName: topic.name,
                difficulty,
            });
        },
        [source]
    );

    const pickStoredQuestionForTopic = useCallback(
        async (topicId: string): Promise<QuestionRow | null> => {
            const { data, error: queryError } = await supabase
                .from('questions')
                .select('*')
                .eq('topic_id', topicId)
                .order('created_at', { ascending: false })
                .limit(STORED_QUESTION_POOL_LIMIT);

            if (queryError) {
                return null;
            }

            const rows = data ?? [];
            if (rows.length === 0) {
                return null;
            }

            // "Gorulmus" = bu oturumda sorulmus VEYA gecmiste cevaplanmis
            // (bkz. refresh: askedQuestionIdsRef question_logs'tan
            // tohumlaniyor). Gorulmemis soru kalmadiysa null donuyoruz;
            // cagiran taraf boylece AI uretimine geciyor.
            const unseen = rows.filter((row) => !askedQuestionIdsRef.current.has(row.id));
            if (unseen.length === 0) {
                return null;
            }

            // Kullanicinin kendi kaynagindan cikan sorular her zaman once
            // sorulur; daha once uretilmis AI sorulari ancak onlar bitince
            // devreye girer.
            const fromSource = unseen.filter((row) => row.origin !== 'ai');
            const pool = fromSource.length > 0 ? fromSource : unseen;

            const picked = pool[Math.floor(Math.random() * pool.length)] ?? null;
            if (!picked) {
                return null;
            }

            askedQuestionIdsRef.current.add(picked.id);
            askedBankCountByTopicRef.current.set(
                topicId,
                (askedBankCountByTopicRef.current.get(topicId) ?? 0) + 1
            );
            return picked;
        },
        []
    );

    /**
     * "Tum Konular" modunda siradaki konuyu dondurur: bankasinda hala
     * cozulmemis sorusu olan konular arasindan en cok kalani secer. Boylece
     * tek konuya takilip kalmadan kaynaktaki tum sorular tuketilir.
     * Hepsi bittiyse null doner (cagiran taraf AI uretimine dusebilir).
     */
    const pickTopicWithRemainingBank = useCallback((): string | null => {
        let bestTopicId: string | null = null;
        let bestRemaining = 0;

        for (const topic of topics) {
            const remaining =
                (bankCountByTopicRef.current.get(topic.id) ?? 0) -
                (askedBankCountByTopicRef.current.get(topic.id) ?? 0);

            if (remaining > bestRemaining) {
                bestRemaining = remaining;
                bestTopicId = topic.id;
            }
        }

        return bestTopicId;
    }, [topics]);

    const prefetchNextQuestion = useCallback(
        async (topic: Topic, difficulty: number) => {
            if (!source) {
                return;
            }

            const queueKey = getQueueKey(topic.id, difficulty);
            const currentQueue = prefetchedQuestionsRef.current.get(queueKey) ?? [];
            if (currentQueue.length >= PREFETCH_QUEUE_LIMIT) {
                return;
            }

            if (prefetchInFlightRef.current.has(queueKey)) {
                return;
            }

            prefetchInFlightRef.current.add(queueKey);
            try {
                // ONCE BANKA, SONRA URETIM. Burasi eskiden kosulsuz uretim
                // cagiriyordu; kuyruk `generateForTopic`'ten once tuketildigi
                // icin kaynaktaki gercek sorular bitmeden AI sorulari araya
                // giriyordu.
                const storedRow = await pickStoredQuestionForTopic(topic.id);
                const nextQuestion: PreparedQuestion = storedRow
                    ? {
                          question: mapQuestionRowToGeneratedQuestion(storedRow),
                          questionId: storedRow.id,
                          origin: 'bank',
                      }
                    : {
                          question: await requestQuestionForTopic(topic, difficulty),
                          questionId: null,
                          origin: 'ai',
                      };

                const updatedQueue = prefetchedQuestionsRef.current.get(queueKey) ?? [];

                if (updatedQueue.length < PREFETCH_QUEUE_LIMIT) {
                    updatedQueue.push(nextQuestion);
                    prefetchedQuestionsRef.current.set(queueKey, updatedQueue);
                    updatePrefetchedCount();
                }
            } catch {
                // Ignore prefetch failures to avoid interrupting quiz flow.
            } finally {
                prefetchInFlightRef.current.delete(queueKey);
            }
        },
        [
            pickStoredQuestionForTopic,
            requestQuestionForTopic,
            source,
            updatePrefetchedCount,
        ]
    );

    const ensureTopic = useCallback(
        async (topicName: string): Promise<Topic> => {
            if (!sourceId) {
                throw new Error('Kaynak seçimi geçersiz.');
            }

            const trimmedName = topicName.trim();
            if (!trimmedName) {
                throw new Error('Konu adı boş olamaz.');
            }

            const existingTopic = topics.find(
                (topic) => topic.name.toLowerCase() === trimmedName.toLowerCase()
            );

            if (existingTopic) {
                return existingTopic;
            }

            const { data, error: insertError } = await supabase
                .from('topics')
                .insert({
                    source_id: sourceId,
                    name: trimmedName,
                    // Kullanici elle ekledi; kaynagin kendi konu hiyerarsisinden
                    // ayirt edilsin ki silme yalnizca burada acilsin.
                    origin: 'manual',
                })
                .select('*')
                .single();

            if (insertError || !data) {
                throw new Error(localizeError(insertError, 'Konu oluşturulamadı.'));
            }

            setTopics((prev) => [...prev, data]);
            return data;
        },
        [sourceId, topics]
    );

    const generateForTopic = useCallback(
        async ({ topicId, topicName, difficulty = 3 }: GenerateForTopicOptions) => {
            if (!source) {
                throw new Error('Kaynak henüz yüklenmedi. Lütfen biraz bekleyip tekrar dene.');
            }

            // Zaten bir soru hazirlaniyorsa ikinci cagriyi yok say. Aksi halde
            // "Sonraki Soru"ya iki kez dokunmak iki soru tuketip birini hic
            // gostermiyordu.
            if (generationInFlightRef.current) {
                return;
            }

            generationInFlightRef.current = true;
            // Bayrak BANKA yolunda da kaldiriliyor. Onceden yalnizca AI
            // uretiminde set ediliyordu; bankadan soru cekilirken ekran
            // "soru yok" sanip "Akisi Tekrar Baslat" butonunu gosteriyor,
            // "Sonraki Soru" butonu da hicbir ilerleme isareti vermiyordu.
            setIsGenerating(true);
            setError(null);
            setGenerationStatus('Konu hazirlaniyor...');

            try {
                let selectedTopic: Topic | undefined;

                if (topicId) {
                    selectedTopic = topics.find((topic) => topic.id === topicId);
                }

                if (!selectedTopic && topicName) {
                    selectedTopic = await ensureTopic(topicName);
                }

                if (!selectedTopic) {
                    throw new Error('Lütfen bir konu seçin veya konu adı girin.');
                }

                const queueKey = getQueueKey(selectedTopic.id, difficulty);
                const queue = prefetchedQuestionsRef.current.get(queueKey) ?? [];
                const queuedQuestion = queue.shift();
                if (queuedQuestion) {
                    prefetchedQuestionsRef.current.set(queueKey, queue);
                    updatePrefetchedCount();

                    setActiveTopic(selectedTopic);
                    setActiveDifficulty(difficulty);
                    setCurrentQuestion(queuedQuestion.question);
                    setCurrentQuestionId(queuedQuestion.questionId);
                    setQuestionOrigin(queuedQuestion.origin);
                    setAnswerFeedback(null);
                    setQuestionStartedAt(Date.now());
                    setGenerationStatus(
                        queuedQuestion.origin === 'bank'
                            ? 'Kaynaktaki soru gosterildi.'
                            : 'Konudaki sorular bitti; AI yeni soru uretti.'
                    );

                    void prefetchNextQuestion(selectedTopic, difficulty);
                    return;
                }

                setGenerationStatus('Hazir soru bankasi kontrol ediliyor...');
                const storedQuestion = await pickStoredQuestionForTopic(selectedTopic.id);
                if (storedQuestion) {
                    setActiveTopic(selectedTopic);
                    setActiveDifficulty(difficulty);
                    setCurrentQuestion(mapQuestionRowToGeneratedQuestion(storedQuestion));
                    setCurrentQuestionId(storedQuestion.id);
                    setQuestionOrigin('bank');
                    setAnswerFeedback(null);
                    setQuestionStartedAt(Date.now());
                    setGenerationStatus('Kaynakta hazir soru bulundu ve gosterildi.');

                    void prefetchNextQuestion(selectedTopic, difficulty);
                    return;
                }

                // Buraya ancak konudaki hazir sorularin tamami cozuldukten
                // sonra gelinir.
                setGenerationStatus('Konudaki sorular bitti. AI yeni soru uretiyor...');

                const generated = await requestQuestionForTopic(selectedTopic, difficulty);

                setActiveTopic(selectedTopic);
                setActiveDifficulty(difficulty);
                setCurrentQuestion(generated);
                setCurrentQuestionId(null);
                setQuestionOrigin('ai');
                setAnswerFeedback(null);
                setQuestionStartedAt(Date.now());
                setGenerationStatus('AI yeni soru uretti. Siradaki soru arka planda hazirlaniyor...');

                void prefetchNextQuestion(selectedTopic, difficulty);
            } catch (generationError) {
                setError(localizeError(generationError, 'Soru hazırlanamadı.'));
                setGenerationStatus('Soru uretimi basarisiz oldu. Tekrar deneyebilirsin.');
                throw generationError;
            } finally {
                generationInFlightRef.current = false;
                setIsGenerating(false);
            }
        },
        [
            ensureTopic,
            pickStoredQuestionForTopic,
            prefetchNextQuestion,
            requestQuestionForTopic,
            source,
            topics,
            updatePrefetchedCount,
        ]
    );

    const submitAnswer = useCallback(
        /**
         * Cevap gercekten kaydedildiyse true doner. Ayni soruya cift dokunusta
         * ikinci cagri false doner; cagiran taraf sayaclarini bu degere gore
         * artirmali, aksi halde tek cevap iki kez sayiliyor.
         */
        async (selectedOption: string): Promise<boolean> => {
            if (!currentQuestion || !activeTopic) {
                throw new Error('Cevaplanacak aktif soru yok.');
            }

            if (submitInFlightRef.current) {
                return false;
            }

            submitInFlightRef.current = true;

            setIsSubmittingAnswer(true);
            setError(null);

            try {
                const {
                    data: { user },
                    error: userError,
                } = await supabase.auth.getUser();

                if (userError || !user) {
                    throw new Error(localizeError(userError, 'Oturum bulunamadı.'));
                }

                const correctChoice = normalizeChoice(currentQuestion.dogruCevap);
                const userChoice = normalizeChoice(selectedOption);
                const isCorrect = correctChoice === userChoice;

                let questionIdForLog = currentQuestionId;

                if (!questionIdForLog) {
                    const { data: insertedQuestion, error: questionError } = await supabase
                        .from('questions')
                        .insert({
                            topic_id: activeTopic.id,
                            question_text: currentQuestion.soru,
                            options: currentQuestion.secenekler,
                            correct_answer: correctChoice,
                            explanation: currentQuestion.aciklama,
                            // Kaydi olmayan tek soru turu AI uretimi. Isaret
                            // konmazsa konu kartindaki "X soru" sayaci test
                            // cozuldukce sisiyor (bkz. migration 0007).
                            origin: 'ai',
                        })
                        .select('id')
                        .single();

                    if (questionError || !insertedQuestion) {
                        throw new Error(
                            localizeError(questionError, 'Soru kaydı oluşturulamadı.')
                        );
                    }

                    questionIdForLog = insertedQuestion.id;
                    askedQuestionIdsRef.current.add(questionIdForLog);
                    setCurrentQuestionId(questionIdForLog);
                }

                const elapsedSeconds = questionStartedAt
                    ? Math.max(1, Math.round((Date.now() - questionStartedAt) / 1000))
                    : null;

                const { error: logError } = await supabase.from('question_logs').insert({
                    user_id: user.id,
                    question_id: questionIdForLog,
                    is_correct: isCorrect,
                    time_spent_seconds: elapsedSeconds,
                });

                if (logError) {
                    throw new Error(logError.message);
                }

                setAnswerFeedback({
                    isCorrect,
                    userChoice,
                    correctChoice,
                    explanation: currentQuestion.aciklama,
                });

                void prefetchNextQuestion(activeTopic, activeDifficulty);
                return true;
            } catch (submitError) {
                setError(localizeError(submitError, 'Cevabın kaydedilemedi.'));
                throw submitError;
            } finally {
                submitInFlightRef.current = false;
                setIsSubmittingAnswer(false);
            }
        },
        [
            activeDifficulty,
            activeTopic,
            currentQuestion,
            currentQuestionId,
            questionOrigin,
            prefetchNextQuestion,
            questionStartedAt,
        ]
    );

    return useMemo(
        () => ({
            source,
            topics,
            currentQuestion,
            currentQuestionId,
            questionOrigin,
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
            refresh,
            generateForTopic,
            submitAnswer,
            pickTopicWithRemainingBank,
        }),
        [
            source,
            topics,
            currentQuestion,
            currentQuestionId,
            questionOrigin,
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
            refresh,
            generateForTopic,
            submitAnswer,
            pickTopicWithRemainingBank,
        ]
    );
}
