import { supabase } from './supabase';
import type { GeneratedQuestion } from '../types/quiz.types';

interface GenerateQuestionParams {
    sourceContent: string;
    topicName: string;
    difficulty?: number;
}

interface ExtractSourceTextParams {
    base64Data: string;
    mimeType: string;
    fileName?: string;
}

interface ExtractTopicsParams {
    contentText: string;
    maxTopics?: number;
}

interface ExtractQuestionsParams {
    contentText: string;
    topicNames: string[];
    maxQuestionsPerTopic?: number;
}

export interface ExtractedQuestionItem {
    topicName: string;
    questionText: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    difficulty: number;
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_INVOKE_ATTEMPTS = 3;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Edge Function cagrilarini gecici hatalarda tekrar dener.
 *
 * Gerekcesi olcumlu: ayni istek arka arkaya bazen 502 doner (gateway/soguk
 * baslangic). Tekrar denemeyince extract-topics bos donuyor, kaynak tek
 * varsayilan konuyla kaydediliyor ve soru sayisi konu basina tavana takiliyor.
 */
async function invokeWithRetry<T>(
    functionName: string,
    body: object,
    extraRetryableStatusCodes: number[] = []
): Promise<{ data: T | null; error: { message: string } | null }> {
    let lastError: { message: string } | null = null;

    for (let attempt = 1; attempt <= MAX_INVOKE_ATTEMPTS; attempt += 1) {
        const { data, error } = await supabase.functions.invoke(functionName, { body });

        if (!error) {
            return { data: data as T, error: null };
        }

        const status = (error as { context?: Response }).context?.status;
        lastError = error;

        const isRetryable =
            status === undefined ||
            RETRYABLE_STATUS_CODES.has(status) ||
            extraRetryableStatusCodes.includes(status);
        if (!isRetryable || attempt === MAX_INVOKE_ATTEMPTS) {
            break;
        }

        await sleep(600 * attempt);
    }

    return { data: null, error: lastError };
}

async function readEdgeFunctionErrorMessage(context?: Response): Promise<string | null> {
    if (!context) {
        return null;
    }

    const jsonContext = context.clone();
    try {
        const payload = (await jsonContext.json()) as { error?: string };
        if (typeof payload?.error === 'string' && payload.error.trim()) {
            return payload.error;
        }
    } catch {
        // Continue with text body parsing.
    }

    try {
        const text = await context.text();
        if (text.trim()) {
            return text;
        }
    } catch {
        // Ignore and fall back to generic error.
    }

    return null;
}

export async function generateQuestion(
    params: GenerateQuestionParams
): Promise<GeneratedQuestion> {
    const { data, error } = await invokeWithRetry<any>('generate-question', params);

    if (error) {
        throw new Error(`Soru uretilemedi: ${error.message}`);
    }

    return data as GeneratedQuestion;
}

// TODO(gelecek-genisletme): Su an tek seferlik aciklama donduruyor.
// Ileride bunu coklu-tur bir sohbete cevirmek icin:
// 1. Bu fonksiyona `conversationHistory: { role: 'user' | 'model', text: string }[]` parametresi ekle
// 2. Edge Function'a (explain-answer) tum gecmisi gonder, Gemini'nin
//    coklu-turn context'ini kullan
// 3. UI tarafinda (play.tsx) tek aciklama metni yerine bir mesaj listesi
//    ve "devam soru sor" input'u goster
// Bu yorum silinmeden once ozellik gercekten planlanmadan dokunulmasin.
export async function explainWrongAnswer(
    question: string,
    userAnswer: string,
    correctAnswer: string
): Promise<string> {
    const { data, error } = await invokeWithRetry<any>('explain-answer', {
        question,
        userAnswer,
        correctAnswer,
    });

    if (error) {
        throw new Error(`Aciklama alinamadi: ${error.message}`);
    }

    return data.explanation as string;
}

export async function extractSourceTextFromFile(
    params: ExtractSourceTextParams
): Promise<string> {
    // 422 = model bos yanit dondurdu. Olculdu: ayni PDF ilk denemede 422,
    // ikinci denemede basariyla cikiyor. Bu yuzden 422 de tekrar denenir.
    const { data, error } = await invokeWithRetry<any>('extract-source-text', params, [422]);

    if (error) {
        const detailedMessage = await readEdgeFunctionErrorMessage(
            (error as { context?: Response }).context
        );
        if (detailedMessage) {
            throw new Error(`Kaynak metni cikarilamadi: ${detailedMessage}`);
        }

        throw new Error(`Kaynak metni cikarilamadi: ${error.message}`);
    }

    return (data?.text as string | undefined) ?? '';
}

export async function extractTopicsFromSource(
    params: ExtractTopicsParams
): Promise<string[]> {
    const { data, error } = await invokeWithRetry<any>('extract-topics', params);

    if (error) {
        const detailedMessage = await readEdgeFunctionErrorMessage(
            (error as { context?: Response }).context
        );
        if (detailedMessage) {
            throw new Error(`Konu onerileri alinamadi: ${detailedMessage}`);
        }

        throw new Error(`Konu onerileri alinamadi: ${error.message}`);
    }

    const topics = data?.topics;
    if (!Array.isArray(topics)) {
        return [];
    }

    return topics.filter((topic): topic is string => typeof topic === 'string');
}

export async function extractQuestionsFromSource(
    params: ExtractQuestionsParams
): Promise<ExtractedQuestionItem[]> {
    const { data, error } = await invokeWithRetry<any>('extract-questions', params);

    if (error) {
        const detailedMessage = await readEdgeFunctionErrorMessage(
            (error as { context?: Response }).context
        );
        if (detailedMessage) {
            throw new Error(`Soru bankasi cikarilamadi: ${detailedMessage}`);
        }

        throw new Error(`Soru bankasi cikarilamadi: ${error.message}`);
    }

    const questions = data?.questions;
    if (!Array.isArray(questions)) {
        return [];
    }

    return questions.filter((item): item is ExtractedQuestionItem => {
        if (!item || typeof item !== 'object') {
            return false;
        }

        const row = item as Partial<ExtractedQuestionItem>;
        return (
            typeof row.topicName === 'string' &&
            typeof row.questionText === 'string' &&
            Array.isArray(row.options) &&
            typeof row.correctAnswer === 'string' &&
            typeof row.explanation === 'string' &&
            typeof row.difficulty === 'number'
        );
    });
}
