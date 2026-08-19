import { serve } from 'https://deno.land/std/http/server.ts';
import { handlePreflight, jsonHeaders } from '../_shared/cors.ts';

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

/**
 * Yarim kalmis JSON'dan tam olan soru nesnelerini kurtarir.
 *
 * Olculdu: uzun sikkli bolumlerde (orn. diyalog tamamlama) model cikti sinirina
 * takilip JSON'u ortasinda kesiyor. Once tek bir JSON.parse deneniyordu ve
 * basarisiz olunca parcanin TAMAMI kayboluyordu; 80 soruluk bir YDS
 * kitapciginda bu, bir bolumun tamamen dusmesi demekti.
 */
function salvageQuestionObjects(payloadText: string): unknown[] {
    const salvaged: unknown[] = [];
    const openIndexes: number[] = [];
    let inString = false;
    let escaped = false;

    for (let index = 0; index < payloadText.length; index += 1) {
        const char = payloadText[index];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            openIndexes.push(index);
        } else if (char === '}') {
            const start = openIndexes.pop();
            if (start === undefined) {
                continue;
            }

            const candidateText = payloadText.slice(start, index + 1);
            if (!candidateText.includes('"questionText"')) {
                continue;
            }

            try {
                salvaged.push(JSON.parse(candidateText));
            } catch {
                // Bu nesne de bozuksa atla; digerleri kurtarilabilir.
            }
        }
    }

    return salvaged;
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
        return salvageQuestionObjects(payloadText);
    }

    return salvageQuestionObjects(payloadText);
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

interface RejectionCounts {
    notObject: number;
    topicNotAllowed: number;
    missingQuestionText: number;
    tooFewOptions: number;
    unresolvedAnswer: number;
    duplicate: number;
}

function normalizeQuestions(
    rawQuestions: unknown,
    allowedTopicNames: string[],
    rejections: RejectionCounts
): ExtractedQuestion[] {
    const questionCandidates = Array.isArray(rawQuestions) ? rawQuestions : [];

    const allowedMap = new Map(
        allowedTopicNames.map((topicName) => [normalizeTopicName(topicName), topicName])
    );

    const dedupe = new Set<string>();
    const normalized: ExtractedQuestion[] = [];

    for (const item of questionCandidates) {
        if (!item || typeof item !== 'object') {
            rejections.notObject += 1;
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
        if (!matchedTopicName) {
            rejections.topicNotAllowed += 1;
            continue;
        }
        if (typeof maybe.questionText !== 'string') {
            rejections.missingQuestionText += 1;
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
            rejections.tooFewOptions += 1;
            continue;
        }

        const correctAnswer = resolveCorrectChoice(maybe.correctAnswer, mergedOptions);
        if (!correctAnswer) {
            rejections.unresolvedAnswer += 1;
            continue;
        }

        const normalizedTopicKey = normalizeTopicName(matchedTopicName);

        const normalizedQuestionText = inlineExtract.stem || maybe.questionText.trim();

        const dedupeKey = `${normalizedTopicKey}|${normalizedQuestionText.toLocaleLowerCase('tr-TR')}`;
        if (dedupe.has(dedupeKey)) {
            rejections.duplicate += 1;
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
    const preflight = handlePreflight(req);
    if (preflight) {
        return preflight;
    }

    try {
        const { contentText, topicNames, maxQuestionsPerTopic = 3 } = await req.json();

        if (!contentText || typeof contentText !== 'string') {
            return new Response(JSON.stringify({ error: 'contentText zorunludur.' }), {
                status: 400,
                headers: jsonHeaders,
            });
        }

        if (!Array.isArray(topicNames) || topicNames.length === 0) {
            return new Response(JSON.stringify({ questions: [] }), {
                headers: jsonHeaders,
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
                headers: jsonHeaders,
            });
        }

        const safeQuestionCount = Math.min(30, Math.max(1, Number(maxQuestionsPerTopic) || 3));
        const clippedContent = contentText.slice(0, MAX_CONTENT_LENGTH);

        // ONEMLI: Sayi HEDEF degil TAVAN. Olculdu: "hedef soru sayisi" ifadesiyle
        // model kotayi doldurmak icin metinde olmayan sorular uyduruyordu
        // (gercek bir YDS PDF'inin ilk parcasindan donen 79 sorunun 39'u
        // kaynakta yoktu). Metinde ne kadar soru varsa o kadar donmeli.
        const prompt =
            'Asagidaki metinde GERCEKTEN VAR OLAN coktan secmeli sorulari oldugu gibi cikar. ' +
            'ASLA yeni soru uretme, tamamlama yapma, ornek soru yazma. ' +
            'Her sorunun kokunu ve sikklarini metinde yazdigi haliyle kopyala. ' +
            'Metinde kac soru varsa o kadar dondur; verilen sayi bir UST SINIRDIR, ulasilmasi gereken bir hedef degildir. ' +
            'Metinde hic soru yoksa bos liste dondur. ' +
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
                                `Konu basina EN FAZLA soru sayisi (ust sinir): ${safeQuestionCount}\n\n` +
                                `Metin:\n${clippedContent}`,
                        },
                    ],
                },
            ],
            // JSON modu ciktinin ayristirilabilir olmasini garantiler; yuksek
            // token siniri da uzun sikkli bolumlerde kesilmeyi azaltir.
            generationConfig: {
                responseMimeType: 'application/json',
                maxOutputTokens: 32768,
                temperature: 0.2,
            },
        });

        if ('error' in geminiResult) {
            return new Response(JSON.stringify({ error: geminiResult.error }), {
                status: 503,
                headers: jsonHeaders,
            });
        }

        const result = await geminiResult.response.json();
        const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        // Gemini bazen HTTP 200 donup hic metin vermiyor (RECITATION, SAFETY,
        // MAX_TOKENS...). Eskiden bu sessizce `questions: []` olarak donuyordu,
        // yani cagiran taraf "bu parcada soru yokmus" saniyordu. Sebebi artik
        // yanitla birlikte geliyor ki tekrar denenebilsin ve loglanabilsin.
        if (!rawText || typeof rawText !== 'string') {
            const finishReason = result?.candidates?.[0]?.finishReason ?? null;
            const blockReason = result?.promptFeedback?.blockReason ?? null;

            console.error('extract-questions: model metin dondurmedi', {
                finishReason,
                blockReason,
                contentLength: clippedContent.length,
                topicCount: cleanedTopicNames.length,
            });

            return new Response(
                JSON.stringify({
                    questions: [],
                    diagnostic: {
                        reason: 'empty-model-response',
                        finishReason,
                        blockReason,
                    },
                }),
                { headers: jsonHeaders }
            );
        }

        const questionCandidates = parseQuestionCandidates(rawText);
        const rejections: RejectionCounts = {
            notObject: 0,
            topicNotAllowed: 0,
            missingQuestionText: 0,
            tooFewOptions: 0,
            unresolvedAnswer: 0,
            duplicate: 0,
        };
        const parsedQuestions = normalizeQuestions(questionCandidates, cleanedTopicNames, rejections);

        // Model soru dondurdugu halde hepsi elendiyse sebebi gorunur olmali;
        // "bu parcada soru yokmus" ile "hepsini biz attik" ayni sey degil.
        if (parsedQuestions.length === 0) {
            console.error('extract-questions: hicbir soru gecerli sayilmadi', {
                rawTextLength: rawText.length,
                candidateCount: questionCandidates.length,
                rejections,
                allowedTopics: cleanedTopicNames,
            });

            return new Response(
                JSON.stringify({
                    questions: [],
                    diagnostic: {
                        reason:
                            questionCandidates.length === 0
                                ? 'model-output-not-parseable'
                                : 'all-candidates-rejected',
                        rawTextLength: rawText.length,
                        candidateCount: questionCandidates.length,
                        rejections,
                    },
                }),
                { headers: jsonHeaders }
            );
        }

        return new Response(JSON.stringify({ questions: parsedQuestions }), {
            headers: jsonHeaders,
        });
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Bilinmeyen hata' }),
            {
                status: 500,
                headers: jsonHeaders,
            }
        );
    }
});
