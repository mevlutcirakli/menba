import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateTopicWeights, pickNextTopic } from '../services/adaptiveEngine';
import { generateQuestion } from '../services/geminiService';
import { supabase } from '../services/supabase';
import type { Database } from '../types/database.types';
import type { GeneratedQuestion } from '../types/quiz.types';

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

function getQueueKey(topicId: string, difficulty: number): string {
    return `${topicId}:${difficulty}`;
}

function mapQuestionRowToGeneratedQuestion(row: QuestionRow): GeneratedQuestion {
    const options = Array.isArray(row.options)
        ? row.options.filter((item): item is string => typeof item === 'string')
        : [];

    return {
        soru: row.question_text,
        secenekler: options,
        dogruCevap: row.correct_answer,
        aciklama: row.explanation ?? 'Aciklama bulunmuyor.',
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
    const prefetchedQuestionsRef = useRef<Map<string, GeneratedQuestion[]>>(new Map());
    const prefetchInFlightRef = useRef<Set<string>>(new Set());
    const askedQuestionIdsRef = useRef<Set<string>>(new Set());

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
            setError('Gecerli bir kaynak secilmedi.');
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
            setError(sourceError.message);
            setIsLoading(false);
            return;
        }

        if (!sourceData) {
            setError('Kaynak bulunamadi veya bu kaynaga erisim izniniz yok.');
            setIsLoading(false);
            return;
        }

        if (topicError) {
            setError(topicError.message);
            setIsLoading(false);
            return;
        }

        const safeTopics = topicData ?? [];
        setSource(sourceData);
        setTopics(safeTopics);

        if (safeTopics.length === 0) {
            setRecommendedTopicId(null);
            setIsLoading(false);
            return;
        }

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setRecommendedTopicId(safeTopics[0].id);
            setIsLoading(false);
            return;
        }

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
                .limit(50);

            if (queryError) {
                return null;
            }

            const rows = data ?? [];
            if (rows.length === 0) {
                return null;
            }

            const unseen = rows.filter((row) => !askedQuestionIdsRef.current.has(row.id));
            const pool = unseen.length > 0 ? unseen : rows;
            const picked = pool[Math.floor(Math.random() * pool.length)] ?? null;

            if (!picked) {
                return null;
            }

            if (unseen.length === 0) {
                askedQuestionIdsRef.current.clear();
            }

            askedQuestionIdsRef.current.add(picked.id);
            return picked;
        },
        []
    );

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
                const nextQuestion = await requestQuestionForTopic(topic, difficulty);
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
        [requestQuestionForTopic, source, updatePrefetchedCount]
    );

    const ensureTopic = useCallback(
        async (topicName: string): Promise<Topic> => {
            if (!sourceId) {
                throw new Error('Kaynak secimi gecersiz.');
            }

            const trimmedName = topicName.trim();
            if (!trimmedName) {
                throw new Error('Konu adi bos olamaz.');
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
                })
                .select('*')
                .single();

            if (insertError || !data) {
                throw new Error(insertError?.message ?? 'Konu olusturulamadi.');
            }

            setTopics((prev) => [...prev, data]);
            return data;
        },
        [sourceId, topics]
    );

    const generateForTopic = useCallback(
        async ({ topicId, topicName, difficulty = 3 }: GenerateForTopicOptions) => {
            if (!source) {
                throw new Error('Kaynak yuklenemedi.');
            }

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
                    throw new Error('Lutfen bir konu secin veya konu adi girin.');
                }

                const queueKey = getQueueKey(selectedTopic.id, difficulty);
                const queue = prefetchedQuestionsRef.current.get(queueKey) ?? [];
                const queuedQuestion = queue.shift();
                if (queuedQuestion) {
                    prefetchedQuestionsRef.current.set(queueKey, queue);
                    updatePrefetchedCount();

                    setActiveTopic(selectedTopic);
                    setActiveDifficulty(difficulty);
                    setCurrentQuestion(queuedQuestion);
                    setCurrentQuestionId(null);
                    setAnswerFeedback(null);
                    setQuestionStartedAt(Date.now());
                    setGenerationStatus('Hazir soru gosterildi. Siradaki soru arka planda hazirlaniyor...');

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
                    setAnswerFeedback(null);
                    setQuestionStartedAt(Date.now());
                    setGenerationStatus('Kaynakta hazir soru bulundu ve gosterildi.');
                    return;
                }

                setIsGenerating(true);
                setGenerationStatus('AI yeni soru uretiyor...');

                const generated = await requestQuestionForTopic(selectedTopic, difficulty);

                setActiveTopic(selectedTopic);
                setActiveDifficulty(difficulty);
                setCurrentQuestion(generated);
                setCurrentQuestionId(null);
                setAnswerFeedback(null);
                setQuestionStartedAt(Date.now());
                setGenerationStatus('Soru hazirlandi. Siradaki soru arka planda hazirlaniyor...');

                void prefetchNextQuestion(selectedTopic, difficulty);
            } catch (generationError) {
                setError(
                    generationError instanceof Error
                        ? generationError.message
                        : 'Soru uretimi sirasinda hata olustu.'
                );
                setGenerationStatus('Soru uretimi basarisiz oldu. Tekrar deneyebilirsin.');
                throw generationError;
            } finally {
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
        async (selectedOption: string) => {
            if (!currentQuestion || !activeTopic) {
                throw new Error('Cevaplanacak aktif soru yok.');
            }

            setIsSubmittingAnswer(true);
            setError(null);

            try {
                const {
                    data: { user },
                    error: userError,
                } = await supabase.auth.getUser();

                if (userError || !user) {
                    throw new Error(userError?.message ?? 'Kullanici oturumu bulunamadi.');
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
                        })
                        .select('id')
                        .single();

                    if (questionError || !insertedQuestion) {
                        throw new Error(questionError?.message ?? 'Soru kaydi olusturulamadi.');
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
            } catch (submitError) {
                setError(submitError instanceof Error ? submitError.message : 'Cevap kaydedilemedi.');
                throw submitError;
            } finally {
                setIsSubmittingAnswer(false);
            }
        },
        [
            activeDifficulty,
            activeTopic,
            currentQuestion,
            currentQuestionId,
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
        }),
        [
            source,
            topics,
            currentQuestion,
            currentQuestionId,
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
        ]
    );
}
