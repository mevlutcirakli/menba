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
    const { data, error } = await supabase.functions.invoke('generate-question', {
        body: params,
    });

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
    const { data, error } = await supabase.functions.invoke('explain-answer', {
        body: { question, userAnswer, correctAnswer },
    });

    if (error) {
        throw new Error(`Aciklama alinamadi: ${error.message}`);
    }

    return data.explanation as string;
}

export async function extractSourceTextFromFile(
    params: ExtractSourceTextParams
): Promise<string> {
    const { data, error } = await supabase.functions.invoke('extract-source-text', {
        body: params,
    });

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
    const { data, error } = await supabase.functions.invoke('extract-topics', {
        body: params,
    });

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
    const { data, error } = await supabase.functions.invoke('extract-questions', {
        body: params,
    });

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
