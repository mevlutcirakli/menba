import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { extractQuestionsFromSource } from '../services/geminiService';
import type { Database } from '../types/database.types';

type Source = Database['public']['Tables']['sources']['Row'];
export type IngestMode = 'hybrid' | 'questions-only' | 'topics-only';

interface CreateSourceInput {
    title: string;
    contentText: string;
    sourceType?: string;
    topicNames?: string[];
    ingestMode?: IngestMode;
}

interface CreateSourceResult {
    sourceId: string;
    appliedIngestMode: IngestMode;
    insertedTopicCount: number;
    insertedQuestionCount: number;
    skippedDuplicateQuestionCount: number;
    skippedSimilarQuestionCount: number;
    insertedQuestionCountByTopic: Array<{ topicName: string; questionCount: number }>;
}

const DEFAULT_FUZZY_DUPLICATE_SIMILARITY_THRESHOLD = 0.82;

function resolveFuzzyDuplicateSimilarityThreshold(): number {
    const raw = process.env.EXPO_PUBLIC_QUESTION_FUZZY_THRESHOLD;
    if (!raw) {
        return DEFAULT_FUZZY_DUPLICATE_SIMILARITY_THRESHOLD;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_FUZZY_DUPLICATE_SIMILARITY_THRESHOLD;
    }

    return Math.max(0, Math.min(1, parsed));
}

const FUZZY_DUPLICATE_SIMILARITY_THRESHOLD = resolveFuzzyDuplicateSimilarityThreshold();
const MAX_AUTO_EXTRACT_QUESTIONS_TOTAL = 80;
const MAX_AUTO_EXTRACT_QUESTIONS_PER_TOPIC = 25;
const DEFAULT_QUESTIONS_ONLY_TOPIC_NAME = 'Genel Soru Bankasi';

function estimateQuestionLikeCount(text: string): number {
    const numberedStemCount =
        text.match(/(?:^|\n)\s*\d{1,3}[.)-]\s+.+/g)?.length ?? 0;
    const optionStemCount =
        text.match(/(?:^|\n)\s*[A-Ea-e][.)]\s+.+/g)?.length ?? 0;

    return Math.max(numberedStemCount, Math.floor(optionStemCount / 4));
}

function normalizeQuestionText(value: string): string {
    return value
        .toLocaleLowerCase('tr-TR')
        .replace(/\s+/g, ' ')
        .replace(/[?!.,;:]+$/g, '')
        .trim();
}

function tokenizeQuestion(value: string): Set<string> {
    const cleaned = value
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) {
        return new Set<string>();
    }

    return new Set(
        cleaned
            .split(' ')
            .map((token) => token.trim())
            .filter((token) => token.length > 2)
    );
}

function calculateJaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) {
        return 1;
    }

    if (a.size === 0 || b.size === 0) {
        return 0;
    }

    let intersectionCount = 0;
    for (const token of a) {
        if (b.has(token)) {
            intersectionCount += 1;
        }
    }

    const unionCount = a.size + b.size - intersectionCount;
    if (unionCount === 0) {
        return 0;
    }

    return intersectionCount / unionCount;
}

export function useSources() {
    const [sources, setSources] = useState<Source[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSources = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        const { data, error: queryError } = await supabase
            .from('sources')
            .select('*')
            .order('created_at', { ascending: false });

        if (queryError) {
            setError(queryError.message);
            setIsLoading(false);
            return;
        }

        setSources(data ?? []);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        void fetchSources();
    }, [fetchSources]);

    const createSource = useCallback(
        async ({
            title,
            contentText,
            sourceType,
            topicNames,
            ingestMode = 'hybrid',
        }: CreateSourceInput): Promise<CreateSourceResult> => {
            setError(null);

            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError || !user) {
                throw new Error(userError?.message ?? 'Kullanici oturumu bulunamadi.');
            }

            const { data: insertedSource, error: insertError } = await supabase
                .from('sources')
                .insert({
                    user_id: user.id,
                    title,
                    content_text: contentText,
                    source_type: sourceType ?? ingestMode,
                })
                .select('id')
                .single();

            if (insertError || !insertedSource) {
                throw new Error(insertError?.message ?? 'Kaynak kaydedilemedi.');
            }

            const topicMap = new Map<string, string>();
            for (const topicName of topicNames ?? []) {
                const trimmed = topicName.trim();
                if (trimmed.length < 3) {
                    continue;
                }

                const key = trimmed.toLocaleLowerCase('tr-TR');
                if (!topicMap.has(key)) {
                    topicMap.set(key, trimmed);
                }
            }

            const normalizedTopics = Array.from(topicMap.values());
            const topicNamesForProcessing =
                ingestMode === 'questions-only' && normalizedTopics.length === 0
                    ? [DEFAULT_QUESTIONS_ONLY_TOPIC_NAME]
                    : normalizedTopics;

            let insertedTopicCount = 0;
            let insertedQuestionCount = 0;
            let skippedDuplicateQuestionCount = 0;
            let skippedSimilarQuestionCount = 0;
            let insertedQuestionCountByTopic: Array<{ topicName: string; questionCount: number }> = [];
            if (topicNamesForProcessing.length > 0) {
                const topicRows = topicNamesForProcessing.map((name) => ({
                    source_id: insertedSource.id,
                    name,
                }));

                const { data: insertedTopics, error: topicInsertError } = await supabase
                    .from('topics')
                    .insert(topicRows)
                    .select('id, name');

                if (topicInsertError || !insertedTopics) {
                    throw new Error(
                        `Kaynak kaydedildi ama konular eklenemedi: ${topicInsertError?.message ?? 'Bilinmeyen hata'}`
                    );
                }

                insertedTopicCount = topicRows.length;

                if (ingestMode !== 'topics-only') {
                    try {
                        const estimatedQuestionCount = estimateQuestionLikeCount(contentText);
                        const targetTotalQuestionCount = Math.min(
                            MAX_AUTO_EXTRACT_QUESTIONS_TOTAL,
                            Math.max(topicNamesForProcessing.length * 6, estimatedQuestionCount)
                        );
                        const maxQuestionsPerTopic = Math.min(
                            MAX_AUTO_EXTRACT_QUESTIONS_PER_TOPIC,
                            Math.max(3, Math.ceil(targetTotalQuestionCount / topicNamesForProcessing.length))
                        );

                        const extractedQuestions = await extractQuestionsFromSource({
                            contentText,
                            topicNames: topicNamesForProcessing,
                            maxQuestionsPerTopic,
                        });

                        if (extractedQuestions.length > 0) {
                            const topicIdByName = new Map(
                                insertedTopics.map((topic) => [
                                    topic.name.trim().toLocaleLowerCase('tr-TR'),
                                    topic.id,
                                ])
                            );

                            const dedupeSet = new Set<string>();
                            const acceptedQuestionsByTopic = new Map<string, Array<Set<string>>>();
                            const topicNameByTopicId = new Map(
                                insertedTopics.map((topic) => [topic.id, topic.name])
                            );
                            const rowsToInsert = extractedQuestions
                                .map((item) => {
                                    const topicId = topicIdByName.get(
                                        item.topicName.trim().toLocaleLowerCase('tr-TR')
                                    );

                                    if (!topicId) {
                                        return null;
                                    }

                                    const normalizedQuestion = normalizeQuestionText(item.questionText);
                                    if (!normalizedQuestion) {
                                        return null;
                                    }

                                    const dedupeKey = `${topicId}|${normalizedQuestion}`;
                                    if (dedupeSet.has(dedupeKey)) {
                                        skippedDuplicateQuestionCount += 1;
                                        return null;
                                    }

                                    const existingQuestionsForTopic =
                                        acceptedQuestionsByTopic.get(topicId) ?? [];
                                    const candidateTokens = tokenizeQuestion(normalizedQuestion);

                                    const hasSimilarQuestion = existingQuestionsForTopic.some((existing) => {
                                        const similarity = calculateJaccardSimilarity(
                                            candidateTokens,
                                            existing
                                        );
                                        return similarity >= FUZZY_DUPLICATE_SIMILARITY_THRESHOLD;
                                    });

                                    if (hasSimilarQuestion) {
                                        skippedSimilarQuestionCount += 1;
                                        return null;
                                    }

                                    dedupeSet.add(dedupeKey);
                                    existingQuestionsForTopic.push(candidateTokens);
                                    acceptedQuestionsByTopic.set(topicId, existingQuestionsForTopic);

                                    return {
                                        topic_id: topicId,
                                        question_text: item.questionText.trim(),
                                        options: item.options,
                                        correct_answer: item.correctAnswer.trim().charAt(0).toUpperCase(),
                                        explanation: item.explanation.trim(),
                                        difficulty: Math.min(5, Math.max(1, Math.round(item.difficulty))),
                                    };
                                })
                                .filter((row): row is NonNullable<typeof row> => Boolean(row));

                            if (rowsToInsert.length > 0) {
                                const { error: questionInsertError } = await supabase
                                    .from('questions')
                                    .insert(rowsToInsert);

                                if (!questionInsertError) {
                                    insertedQuestionCount = rowsToInsert.length;

                                    const questionCountByTopicId = new Map<string, number>();
                                    for (const row of rowsToInsert) {
                                        questionCountByTopicId.set(
                                            row.topic_id,
                                            (questionCountByTopicId.get(row.topic_id) ?? 0) + 1
                                        );
                                    }

                                    insertedQuestionCountByTopic = Array.from(
                                        questionCountByTopicId.entries()
                                    )
                                        .map(([topicId, questionCount]) => ({
                                            topicName:
                                                topicNameByTopicId.get(topicId) ?? 'Bilinmeyen Konu',
                                            questionCount,
                                        }))
                                        .sort((a, b) => b.questionCount - a.questionCount);
                                }
                            }
                        }
                    } catch {
                        // If question extraction fails, source creation should still succeed.
                    }
                }
            }

            await fetchSources();

            return {
                sourceId: insertedSource.id,
                appliedIngestMode: ingestMode,
                insertedTopicCount,
                insertedQuestionCount,
                skippedDuplicateQuestionCount,
                skippedSimilarQuestionCount,
                insertedQuestionCountByTopic,
            };
        },
        [fetchSources]
    );

    const deleteSource = useCallback(
        async (sourceId: string): Promise<void> => {
            setError(null);

            const { data: topicRows, error: topicsError } = await supabase
                .from('topics')
                .select('id')
                .eq('source_id', sourceId);

            if (topicsError) {
                throw new Error(topicsError.message);
            }

            const topicIds = (topicRows ?? []).map((topic) => topic.id);

            if (topicIds.length > 0) {
                const { data: questionRows, error: questionsQueryError } = await supabase
                    .from('questions')
                    .select('id')
                    .in('topic_id', topicIds);

                if (questionsQueryError) {
                    throw new Error(questionsQueryError.message);
                }

                const questionIds = (questionRows ?? []).map((question) => question.id);

                if (questionIds.length > 0) {
                    const { error: logDeleteError } = await supabase
                        .from('question_logs')
                        .delete()
                        .in('question_id', questionIds);

                    if (logDeleteError) {
                        throw new Error(logDeleteError.message);
                    }

                    const { error: questionDeleteError } = await supabase
                        .from('questions')
                        .delete()
                        .in('id', questionIds);

                    if (questionDeleteError) {
                        throw new Error(questionDeleteError.message);
                    }
                }

                const { error: progressDeleteError } = await supabase
                    .from('user_progress')
                    .delete()
                    .in('topic_id', topicIds);

                if (progressDeleteError) {
                    throw new Error(progressDeleteError.message);
                }

                const { error: topicDeleteError } = await supabase
                    .from('topics')
                    .delete()
                    .in('id', topicIds);

                if (topicDeleteError) {
                    throw new Error(topicDeleteError.message);
                }
            }

            const { error: sourceDeleteError } = await supabase
                .from('sources')
                .delete()
                .eq('id', sourceId);

            if (sourceDeleteError) {
                throw new Error(sourceDeleteError.message);
            }

            await fetchSources();
        },
        [fetchSources]
    );

    return {
        sources,
        isLoading,
        error,
        fetchSources,
        createSource,
        deleteSource,
    };
}
