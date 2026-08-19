import { serve } from 'https://deno.land/std/http/server.ts';
import { handlePreflight, jsonHeaders } from '../_shared/cors.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL =
    Deno.env.get('GEMINI_TOPIC_MODEL') ?? Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash';
const GEMINI_FALLBACK_MODEL =
    Deno.env.get('GEMINI_TOPIC_FALLBACK_MODEL') ??
    Deno.env.get('GEMINI_FALLBACK_MODEL') ??
    'gemini-3.5-flash-lite';

if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY bulunamadi. Supabase secret olarak tanimlanmali.');
}

const MAX_CONTENT_LENGTH = 28000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES_PER_MODEL = 3;

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

function normalizeTopics(rawTopics: unknown, maxTopics: number): string[] {
    if (!Array.isArray(rawTopics)) {
        return [];
    }

    const map = new Map<string, string>();

    for (const item of rawTopics) {
        if (typeof item !== 'string') {
            continue;
        }

        const cleaned = item.replace(/\s+/g, ' ').trim();
        if (cleaned.length < 3 || cleaned.length > 70) {
            continue;
        }

        const key = cleaned.toLocaleLowerCase('tr-TR');
        if (!map.has(key)) {
            map.set(key, cleaned);
        }

        if (map.size >= maxTopics) {
            break;
        }
    }

    return Array.from(map.values());
}

serve(async (req) => {
    const preflight = handlePreflight(req);
    if (preflight) {
        return preflight;
    }

    try {
        const { contentText, maxTopics = 8 } = await req.json();

        if (!contentText || typeof contentText !== 'string') {
            return new Response(JSON.stringify({ error: 'contentText zorunludur.' }), {
                status: 400,
                headers: jsonHeaders,
            });
        }

        // Tavan 12'ydi. Bir YDS kitapciginda 15 ayri soru bolumu var; tavan
        // dusuk kalinca bolumlerin bir kismi konu alamiyor ve o bolumlerin
        // sorulari extract-questions tarafindan eslesmedigi icin dusuyordu.
        const safeMaxTopics = Math.min(20, Math.max(3, Number(maxTopics) || 8));
        const clippedContent = contentText.slice(0, MAX_CONTENT_LENGTH);

        const prompt =
            'Asagidaki metinden quiz icin uygun konu basliklari cikar. ' +
            `Yalnizca JSON dondur ve bu formati kullan: {"topics": ["Konu 1", "Konu 2"]}. ` +
            `Tam olarak ${safeMaxTopics} veya daha az madde olsun. ` +
            'Kisa, tekrar etmeyen, ogretim odakli basliklar sec.';

        const geminiResult = await callGeminiWithRetry({
            contents: [
                {
                    parts: [
                        {
                            text: `${prompt}\n\nMetin:\n${clippedContent}`,
                        },
                    ],
                },
            ],
        });

        if ('error' in geminiResult) {
            return new Response(JSON.stringify({ error: geminiResult.error }), {
                status: 503,
                headers: jsonHeaders,
            });
        }

        const result = await geminiResult.response.json();
        const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawText || typeof rawText !== 'string') {
            return new Response(JSON.stringify({ topics: [] }), {
                headers: jsonHeaders,
            });
        }

        const cleanText = rawText.replace(/```json|```/g, '').trim();

        let parsedTopics: string[] = [];
        try {
            const parsed = JSON.parse(cleanText) as { topics?: unknown };
            parsedTopics = normalizeTopics(parsed.topics, safeMaxTopics);
        } catch {
            const fallbackTopics = cleanText
                .split('\n')
                .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
                .filter(Boolean);
            parsedTopics = normalizeTopics(fallbackTopics, safeMaxTopics);
        }

        return new Response(JSON.stringify({ topics: parsedTopics }), {
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
