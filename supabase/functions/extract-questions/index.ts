import { serve } from 'https://deno.land/std/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL =
    Deno.env.get('GEMINI_QUESTION_EXTRACT_MODEL') ??
    Deno.env.get('GEMINI_MODEL') ??
    'gemini-3.6-flash';
const GEMINI_FALLBACK_MODEL =
    Deno.env.get('GEMINI_QUESTION_EXTRACT_FALLBACK_MODEL') ??
    Deno.env.get('GEMINI_FALLBACK_MODEL') ??
    'gemini-3.5-flash-lite';

if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY bulunamadi. Supabase secret olarak tanimlanmali.');
}

const MAX_CONTENT_LENGTH = 28000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES_PER_MODEL = 3;

interface ExtractedQuestion {
    topicName: string;
    questionText: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    difficulty: number;
}

const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiWithRetry(payload: unknown): Promise<{ response: Response } | { error: string }> {
    const models = Array.from(new Set([GEMINI_MODEL, GEMINI_FALLBACK_MODEL]));
    let lastError = 'Gemini istegi basarisiz oldu.';

    for (const model of models) {
        for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt += 1) {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                }
            );

            if (response.ok) {
                return { response };
            }

            const bodyText = await response.text();
            lastError = `Gemini istegi basarisiz (${model}, deneme ${attempt}/${MAX_RETRIES_PER_MODEL}): ${response.status} ${bodyText}`;

            if (!RETRYABLE_STATUS_CODES.has(response.status)) {
                break;
            }

            if (attempt < MAX_RETRIES_PER_MODEL) {
                await sleep(500 * attempt);
            }
        }
    }

    return { error: `${lastError} Gecici yogunluk olabilir; lutfen tekrar deneyin.` };
}

function normalizeTopicName(topicName: string): string {
    return topicName.trim().toLocaleLowerCase('tr-TR');
}

function simplifyTopicName(topicName: string): string {
    return normalizeTopicName(topicName)
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeChoice(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }

    return trimmed.charAt(0).toUpperCase();
}

function extractJsonPayloadText(rawText: string): string {
    const withoutFence = rawText.replace(/```json|```/gi, '').trim();

    const objectStart = withoutFence.indexOf('{');
    const objectEnd = withoutFence.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
        return withoutFence.slice(objectStart, objectEnd + 1);
    }

    const arrayStart = withoutFence.indexOf('[');
    const arrayEnd = withoutFence.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
        return withoutFence.slice(arrayStart, arrayEnd + 1);
    }

    return withoutFence;
}

function parseQuestionCandidates(rawText: string): unknown[] {
    const payloadText = extractJsonPayloadText(rawText);

    try {
        const parsed = JSON.parse(payloadText) as { questions?: unknown } | unknown[];
        if (Array.isArray(parsed)) {
            return parsed;
        }

        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.questions)) {
            return parsed.questions;
        }
    } catch {
        return [];
    }

    return [];
}

function stripOptionPrefix(text: string): string {
    return text
        .replace(/^\s*[A-Ea-e][.)\-:]\s*/g, '')
        .replace(/^\s*\([A-Ea-e]\)\s*/g, '')
        .replace(/^\s*[-*]\s*/g, '')
        .trim();
}

function buildLabeledOptions(rawOptions: string[]): string[] {
    const unique = new Set<string>();
    const normalized = rawOptions
        .map((value) => stripOptionPrefix(value))
        .filter((value) => value.length > 0)
        .filter((value) => {
            const key = value.toLocaleLowerCase('tr-TR');
            if (unique.has(key)) {
                return false;
            }

            unique.add(key);
            return true;
        });

    return normalized
        .slice(0, CHOICE_LETTERS.length)
        .map((optionText, index) => `${CHOICE_LETTERS[index]}) ${optionText}`);
}

function extractInlineOptions(questionText: string): { stem: string; options: string[] } {
    const lines = questionText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length < 2) {
        return { stem: questionText.trim(), options: [] };
    }

    const optionLines = lines.filter((line) => /^([A-Ea-e][.)\-:]|\([A-Ea-e]\))\s*/.test(line));
    if (optionLines.length < 2) {
        return { stem: questionText.trim(), options: [] };
    }

    const nonOptionLines = lines.filter(
        (line) => !/^([A-Ea-e][.)\-:]|\([A-Ea-e]\))\s*/.test(line)
    );

    return {
        stem: nonOptionLines.join(' ').trim(),
        options: optionLines,
    };
}

function resolveCorrectChoice(rawCorrect: unknown, options: string[]): string {
    if (typeof rawCorrect === 'string') {
        const choice = normalizeChoice(rawCorrect);
        if (choice && CHOICE_LETTERS.includes(choice as (typeof CHOICE_LETTERS)[number])) {
            const index = CHOICE_LETTERS.indexOf(choice as (typeof CHOICE_LETTERS)[number]);
            if (index >= 0 && index < options.length) {
                return choice;
            }
        }

        const normalizedAnswer = stripOptionPrefix(rawCorrect).toLocaleLowerCase('tr-TR');
        const optionIndex = options.findIndex(
            (option) => stripOptionPrefix(option).toLocaleLowerCase('tr-TR') === normalizedAnswer
        );
        if (optionIndex >= 0) {
            return CHOICE_LETTERS[optionIndex] ?? '';
        }
    }

    return '';
}

function matchAllowedTopicName(topicName: unknown, allowedMap: Map<string, string>): string | null {
    if (typeof topicName !== 'string') {
        return null;
    }

    const exact = allowedMap.get(normalizeTopicName(topicName));
    if (exact) {
        return exact;
    }

    const simplifiedInput = simplifyTopicName(topicName);
    for (const [_, originalName] of allowedMap.entries()) {
        const simplifiedAllowed = simplifyTopicName(originalName);
        if (simplifiedAllowed && simplifiedAllowed === simplifiedInput) {
            return originalName;
        }

        if (
            simplifiedInput.length >= 4 &&
            simplifiedAllowed.length >= 4 &&
            (simplifiedAllowed.includes(simplifiedInput) || simplifiedInput.includes(simplifiedAllowed))
        ) {
            return originalName;
        }
    }

    return null;
}

function normalizeQuestions(rawQuestions: unknown, allowedTopicNames: string[]): ExtractedQuestion[] {
    const questionCandidates = Array.isArray(rawQuestions) ? rawQuestions : [];

    const allowedMap = new Map(
        allowedTopicNames.map((topicName) => [normalizeTopicName(topicName), topicName])
    );

    const dedupe = new Set<string>();
    const normalized: ExtractedQuestion[] = [];

    for (const item of questionCandidates) {
        if (!item || typeof item !== 'object') {
            continue;
        }

        const maybe = item as {
            topicName?: unknown;
            questionText?: unknown;
            options?: unknown;
            choices?: unknown;
            correctAnswer?: unknown;
            explanation?: unknown;
            difficulty?: unknown;
        };

        const matchedTopicName = matchAllowedTopicName(maybe.topicName, allowedMap);
        if (!matchedTopicName || typeof maybe.questionText !== 'string') {
            continue;
        }

        const rawArrayOptions = Array.isArray(maybe.options)
            ? maybe.options.filter((opt): opt is string => typeof opt === 'string')
            : Array.isArray(maybe.choices)
                ? maybe.choices.filter((opt): opt is string => typeof opt === 'string')
                : [];

        const inlineExtract = extractInlineOptions(maybe.questionText);
        const mergedOptions = buildLabeledOptions([...rawArrayOptions, ...inlineExtract.options]);
        if (mergedOptions.length < 4) {
            continue;
        }

        const correctAnswer = resolveCorrectChoice(maybe.correctAnswer, mergedOptions);
        if (!correctAnswer) {
            continue;
        }

        const normalizedTopicKey = normalizeTopicName(matchedTopicName);

        const normalizedQuestionText = inlineExtract.stem || maybe.questionText.trim();

        const dedupeKey = `${normalizedTopicKey}|${normalizedQuestionText.toLocaleLowerCase('tr-TR')}`;
        if (dedupe.has(dedupeKey)) {
            continue;
        }

        dedupe.add(dedupeKey);
        normalized.push({
            topicName: matchedTopicName,
            questionText: normalizedQuestionText,
            options: mergedOptions,
            correctAnswer,
            explanation:
                typeof maybe.explanation === 'string' && maybe.explanation.trim()
                    ? maybe.explanation.trim()
                    : 'Aciklama bulunmuyor.',
            difficulty:
                typeof maybe.difficulty === 'number'
                    ? Math.min(5, Math.max(1, Math.round(maybe.difficulty)))
                    : 3,
        });
    }

    return normalized;
}

serve(async (req) => {
    try {
        const { contentText, topicNames, maxQuestionsPerTopic = 3 } = await req.json();

        if (!contentText || typeof contentText !== 'string') {
            return new Response(JSON.stringify({ error: 'contentText zorunludur.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (!Array.isArray(topicNames) || topicNames.length === 0) {
            return new Response(JSON.stringify({ questions: [] }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const cleanedTopicNames = Array.from(
            new Set(
                topicNames
                    .filter((name): name is string => typeof name === 'string')
                    .map((name) => name.trim())
                    .filter((name) => name.length >= 3)
            )
        );

        if (cleanedTopicNames.length === 0) {
            return new Response(JSON.stringify({ questions: [] }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const safeQuestionCount = Math.min(30, Math.max(1, Number(maxQuestionsPerTopic) || 3));
        const clippedContent = contentText.slice(0, MAX_CONTENT_LENGTH);

        const prompt =
            'Asagidaki metinden, verilen konular icin coktan secmeli soru seti cikar. ' +
            'Metin bir soru bankasiysa, mevcut sorulari oldugu gibi cikar ve yeni soru uretme. ' +
            'Metinde soru yoksa bos liste dondur. ' +
            'Yalnizca JSON dondur. Format birebir su olsun: ' +
            '{"questions":[{"topicName":"...","questionText":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correctAnswer":"A","explanation":"...","difficulty":3}]}. ' +
            'Dogru cevap harf olarak A/B/C/D/E olmali. ' +
            'Her soruda en az 4 secenek olsun. Konu adini sadece verilen listeden sec.';

        const geminiResult = await callGeminiWithRetry({
            contents: [
                {
                    parts: [
                        {
                            text:
                                `${prompt}\n\n` +
                                `Konu listesi: ${cleanedTopicNames.join(', ')}\n` +
                                `Her konu icin hedef soru sayisi: ${safeQuestionCount}\n\n` +
                                `Metin:\n${clippedContent}`,
                        },
                    ],
                },
            ],
        });

        if ('error' in geminiResult) {
            return new Response(JSON.stringify({ error: geminiResult.error }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const result = await geminiResult.response.json();
        const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawText || typeof rawText !== 'string') {
            return new Response(JSON.stringify({ questions: [] }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const questionCandidates = parseQuestionCandidates(rawText);
        const parsedQuestions = normalizeQuestions(questionCandidates, cleanedTopicNames);

        return new Response(JSON.stringify({ questions: parsedQuestions }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Bilinmeyen hata' }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }
});
