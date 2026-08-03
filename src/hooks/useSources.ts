import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import {
    extractQuestionsFromSource,
    extractTopicsFromSource,
    type ExtractedQuestionItem,
} from '../services/geminiService';
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
    /**
     * Kaynak metinde karsiligi bulunamadigi icin elenen soru sayisi. Sifirdan
     * buyukse model soru uydurmaya calismis demektir.
     */
    skippedUngroundedQuestionCount: number;
    insertedQuestionCountByTopic: Array<{ topicName: string; questionCount: number }>;
    /**
     * Kaynak kaydedildi ama konu/soru uretimi kismen ya da tamamen basarisiz
     * olduysa sebebi burada doner. Bos birakilmasi "her sey yolunda" demektir;
     * cagiran ekran bunu kullaniciya gostermeli.
     */
    warning: string | null;
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
// Edge Function tek cagrida konu basina en fazla 30 soru donduruyor
// (extract-questions icindeki safeQuestionCount). Bunun uzerine cikmak
// anlamsiz; hacim parcalama ile saglaniyor.
const MAX_AUTO_EXTRACT_QUESTIONS_PER_TOPIC = 30;
const MIN_AUTO_EXTRACT_QUESTIONS_PER_TOPIC = 3;
// Bir sinav kitapciginda 15'e yakin ayri soru bolumu olabiliyor; konu sayisi
// dar tutulunca bolumlerin bir kismi konusuz kaliyor ve sorulari dusuyor.
const MAX_AUTO_EXTRACT_TOPICS = 16;
const DEFAULT_QUESTIONS_ONLY_TOPIC_NAME = 'Genel Soru Bankasi';

// Bir parca bos donerse (HTTP 200 + `questions: []`) bu gecici bir arizadir;
// olculdu, ayni istek tekrarlandiginda cogu zaman dolu donuyor. Bos donusu
// "0 soru vardi" saymak yerine tekrar deniyoruz.
const MAX_EMPTY_CHUNK_ATTEMPTS = 3;

/**
 * Kaynak-dogrulama (grounding) penceresi.
 *
 * Olculdu: model, konu basina istenen sayiyi HEDEF sanip metinde olmayan
 * sorular uyduruyor. 63.000 karakterlik gercek bir YDS PDF'inin ilk 10.000
 * karakterlik parcasindan donen 79 sorunun yalnizca 40'i metinde vardi;
 * gerisi (orn. "greenhouse gas", "infectious diseases" iceren sikklar)
 * PDF'in hicbir yerinde gecmiyordu. Bu yuzden her sorunun kokunden alinan
 * ardisik kelime dizilerinden en az biri kaynak metinde bulunmali.
 *
 * Pencere 5 kelime: cloze sorularinda model "(22)----" gibi numaralari
 * attigi icin tek bir noktada kopma oluyor, ama diger diziler tutuyor.
 */
const GROUNDING_NGRAM_SIZE = 5;

function normalizeForGrounding(value: string): string {
    return value
        .toLocaleLowerCase('tr-TR')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function toNgramList(value: string): string[] {
    const words = normalizeForGrounding(value).split(' ').filter(Boolean);
    if (words.length < GROUNDING_NGRAM_SIZE) {
        return [];
    }

    const ngrams: string[] = [];
    for (let index = 0; index + GROUNDING_NGRAM_SIZE <= words.length; index += 1) {
        ngrams.push(words.slice(index, index + GROUNDING_NGRAM_SIZE).join(' '));
    }

    return ngrams;
}

function buildSourceNgramIndex(sourceText: string): Set<string> {
    return new Set(toNgramList(sourceText));
}

/**
 * Sorunun koku gercekten kaynak metinden mi geliyor?
 *
 * Kararsiz kaldigimiz durumlarda (cok kisa kok, bos indeks) soruyu ELEMIYORUZ;
 * amac uydurmayi kesmek, dogru cikarimi yanlislikla atmak degil.
 */
function isQuestionGroundedInSource(questionText: string, sourceIndex: Set<string>): boolean {
    if (sourceIndex.size === 0) {
        return true;
    }

    const ngrams = toNgramList(questionText);
    if (ngrams.length === 0) {
        return true;
    }

    return ngrams.some((ngram) => sourceIndex.has(ngram));
}

// Edge Function icerigi 28.000 karakterde kirpiyor. Daha kucuk parcalar
// modelin her soruyu gormesini kolaylastiriyor; ust ust binme, parca
// sinirina denk gelen sorunun kaybolmasini engelliyor.
const CONTENT_CHUNK_SIZE = 10000;
const CONTENT_CHUNK_OVERLAP = 800;
const MAX_CONTENT_CHUNKS = 8;

function splitContentIntoChunks(text: string): string[] {
    if (text.length <= CONTENT_CHUNK_SIZE) {
        return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length && chunks.length < MAX_CONTENT_CHUNKS) {
        const end = Math.min(text.length, start + CONTENT_CHUNK_SIZE);
        chunks.push(text.slice(start, end));

        if (end >= text.length) {
            break;
        }

        start = end - CONTENT_CHUNK_OVERLAP;
    }

    return chunks;
}

// extract-topics de icerigi 28.000 karakterde kirpiyor. 63.000 karakterlik bir
// sinav PDF'inde bu, belgenin ikinci yarisindaki bolumlerin (diyalog, yeniden
// ifade, alakasiz cumle...) hic konu almamasi demek; konusu olmayan sorular da
// extract-questions tarafinda eslesmeyip dusuyor. Bu yuzden konu cikarimina
// belgenin tamamina yayilmis bir ornek gonderiyoruz.
const TOPIC_SAMPLE_BUDGET = 24000;
const TOPIC_SAMPLE_WINDOW_COUNT = 8;

function buildTopicSamplingExcerpt(text: string): string {
    if (text.length <= TOPIC_SAMPLE_BUDGET) {
        return text;
    }

    const windowSize = Math.floor(TOPIC_SAMPLE_BUDGET / TOPIC_SAMPLE_WINDOW_COUNT);
    const stride = Math.floor(text.length / TOPIC_SAMPLE_WINDOW_COUNT);
    const windows: string[] = [];

    for (let index = 0; index < TOPIC_SAMPLE_WINDOW_COUNT; index += 1) {
        const start = index * stride;
        windows.push(text.slice(start, start + windowSize));
    }

    return windows.join('\n\n[...]\n\n');
}

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
            let warning: string | null = null;

            // Ekrandan konu gelmediyse burada bir daha dene. Bu her modda
            // yapiliyor: soru sayisi konu basina tavana bagli oldugu icin tek
            // "Genel Soru Bankasi" kovasina dusmek soru sayisini de kisitliyor.
            let resolvedTopics = normalizedTopics;
            if (resolvedTopics.length === 0) {
                try {
                    const aiTopics = await extractTopicsFromSource({
                        contentText: buildTopicSamplingExcerpt(contentText),
                        maxTopics: MAX_AUTO_EXTRACT_TOPICS,
                    });
                    resolvedTopics = Array.from(
                        new Map(
                            aiTopics
                                .map((name) => name.trim())
                                .filter((name) => name.length >= 3)
                                .map((name) => [name.toLocaleLowerCase('tr-TR'), name])
                        ).values()
                    );
                } catch (topicError) {
                    warning =
                        topicError instanceof Error
                            ? `Konu cikarimi basarisiz: ${topicError.message}`
                            : 'Konu cikarimi basarisiz oldu.';
                }
            }

            const topicNamesForProcessing =
                resolvedTopics.length === 0
                    ? [DEFAULT_QUESTIONS_ONLY_TOPIC_NAME]
                    : resolvedTopics;

            let insertedTopicCount = 0;
            let insertedQuestionCount = 0;
            let skippedDuplicateQuestionCount = 0;
            let skippedSimilarQuestionCount = 0;
            let skippedUngroundedQuestionCount = 0;
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
                        // Edge Function tek cagrida konu basina en fazla 30 soru
                        // donduruyor ve icerigi 28.000 karakterde kirpiyor. 80
                        // soruluk bir sinav PDF'i tek cagriya sigmiyor; bu yuzden
                        // metni parcalara bolup her parca icin ayri cagri yapiyor,
                        // sonuclari biriktiriyoruz.
                        const chunks = splitContentIntoChunks(contentText);
                        const sourceNgramIndex = buildSourceNgramIndex(contentText);
                        const extractedQuestions: ExtractedQuestionItem[] = [];
                        const seenQuestionKeys = new Set<string>();
                        let chunkFailureCount = 0;
                        let emptyChunkCount = 0;

                        // Butun parcalar okunuyor. Onceden toplam hedefe ulasinca
                        // donguden cikiliyordu; olcumde ilk parca tek basina hedefi
                        // doldurdugu icin kaynagin %84'u hic okunmuyordu.
                        for (const chunk of chunks) {
                            // Bütce parca basina hesaplaniyor. Once toplam hedef tum
                            // konulara bolunuyordu (80/8 = 10); her parca yalnizca
                            // 1-2 konu icerdiginden bu, icinde 19 soru olan parcayi
                            // 10'da kesiyordu.
                            const maxQuestionsPerTopic = Math.min(
                                MAX_AUTO_EXTRACT_QUESTIONS_PER_TOPIC,
                                Math.max(
                                    MIN_AUTO_EXTRACT_QUESTIONS_PER_TOPIC,
                                    estimateQuestionLikeCount(chunk)
                                )
                            );

                            let chunkQuestions: ExtractedQuestionItem[] = [];
                            let chunkFailed = false;

                            for (let attempt = 1; attempt <= MAX_EMPTY_CHUNK_ATTEMPTS; attempt += 1) {
                                try {
                                    chunkQuestions = await extractQuestionsFromSource({
                                        contentText: chunk,
                                        topicNames: topicNamesForProcessing,
                                        maxQuestionsPerTopic,
                                    });
                                    chunkFailed = false;

                                    if (chunkQuestions.length > 0) {
                                        break;
                                    }
                                } catch {
                                    // Tek parcanin patlamasi tum yuklemeyi dusurmesin.
                                    chunkFailed = true;
                                }
                            }

                            if (chunkFailed) {
                                chunkFailureCount += 1;
                                continue;
                            }

                            if (chunkQuestions.length === 0) {
                                emptyChunkCount += 1;
                                continue;
                            }

                            for (const item of chunkQuestions) {
                                const key = normalizeQuestionText(item.questionText);
                                if (!key || seenQuestionKeys.has(key)) {
                                    continue;
                                }

                                seenQuestionKeys.add(key);
                                extractedQuestions.push(item);
                            }
                        }

                        const unreadableChunkCount = chunkFailureCount + emptyChunkCount;
                        if (unreadableChunkCount > 0) {
                            warning = `Kaynagin ${unreadableChunkCount}/${chunks.length} parcasindan soru alinamadi; soru sayisi eksik olabilir.`;
                        }

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

                                    // Kaynakta karsiligi olmayan soru uydurulmustur;
                                    // bankaya girmesin.
                                    if (!isQuestionGroundedInSource(item.questionText, sourceNgramIndex)) {
                                        skippedUngroundedQuestionCount += 1;
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

                            // Toplam sinir en sonda uygulaniyor. Konular arasinda
                            // sirayla secim yapiliyor ki tek konu butun kotayi
                            // yemesin.
                            if (rowsToInsert.length > MAX_AUTO_EXTRACT_QUESTIONS_TOTAL) {
                                const queueByTopicId = new Map<string, typeof rowsToInsert>();
                                for (const row of rowsToInsert) {
                                    const queue = queueByTopicId.get(row.topic_id) ?? [];
                                    queue.push(row);
                                    queueByTopicId.set(row.topic_id, queue);
                                }

                                const balanced: typeof rowsToInsert = [];
                                while (balanced.length < MAX_AUTO_EXTRACT_QUESTIONS_TOTAL) {
                                    let tookAny = false;

                                    for (const queue of queueByTopicId.values()) {
                                        if (balanced.length >= MAX_AUTO_EXTRACT_QUESTIONS_TOTAL) {
                                            break;
                                        }

                                        const next = queue.shift();
                                        if (next) {
                                            balanced.push(next);
                                            tookAny = true;
                                        }
                                    }

                                    if (!tookAny) {
                                        break;
                                    }
                                }

                                rowsToInsert.length = 0;
                                rowsToInsert.push(...balanced);
                            }

                            if (rowsToInsert.length > 0) {
                                const { error: questionInsertError } = await supabase
                                    .from('questions')
                                    .insert(rowsToInsert);

                                if (questionInsertError) {
                                    warning = `Sorular veritabanina yazilamadi: ${questionInsertError.message}`;
                                } else {
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
                            } else if (skippedUngroundedQuestionCount > 0) {
                                // Model soru dondurdu ama hicbiri kaynakta yoktu.
                                warning =
                                    `Uretilen ${skippedUngroundedQuestionCount} sorunun hicbiri kaynak metinde bulunamadi, ` +
                                    'hepsi elendi. Kaynak metin soru icermiyor olabilir.';
                            }
                        } else {
                            warning =
                                'Soru uretimi bos dondu. Kaynak metni soru cikarmak icin yetersiz olabilir.';
                        }
                    } catch (questionError) {
                        // Soru uretimi patlasa da kaynak kaydi ayakta kalir, ama
                        // sebebi yutulmaz: kullanici neden 0 soru geldigini gormeli.
                        warning =
                            questionError instanceof Error
                                ? `Soru uretimi basarisiz: ${questionError.message}`
                                : 'Soru uretimi basarisiz oldu.';
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
                skippedUngroundedQuestionCount,
                insertedQuestionCountByTopic,
                warning,
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
