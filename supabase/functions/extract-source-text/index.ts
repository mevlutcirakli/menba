import { serve } from 'https://deno.land/std/http/server.ts';
import { handlePreflight, jsonHeaders } from '../_shared/cors.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL =
    Deno.env.get('GEMINI_DOC_MODEL') ?? Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash';
const GEMINI_FALLBACK_MODEL =
    Deno.env.get('GEMINI_DOC_FALLBACK_MODEL') ??
    Deno.env.get('GEMINI_FALLBACK_MODEL') ??
    'gemini-3.5-flash-lite';

if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY bulunamadi. Supabase secret olarak tanimlanmali.');
}

const MAX_BASE64_LENGTH = 14 * 1024 * 1024;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES_PER_MODEL = 3;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiWithRetry(payload: unknown): Promise<{ response: Response; model: string } | { error: string }> {
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
                return { response, model };
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

serve(async (req) => {
    const preflight = handlePreflight(req);
    if (preflight) {
        return preflight;
    }

    try {
        const { base64Data, mimeType, fileName } = await req.json();

        if (!base64Data || typeof base64Data !== 'string') {
            return new Response(JSON.stringify({ error: 'base64Data zorunludur.' }), {
                status: 400,
                headers: jsonHeaders,
            });
        }

        if (!mimeType || typeof mimeType !== 'string') {
            return new Response(JSON.stringify({ error: 'mimeType zorunludur.' }), {
                status: 400,
                headers: jsonHeaders,
            });
        }

        if (base64Data.length > MAX_BASE64_LENGTH) {
            return new Response(
                JSON.stringify({ error: 'Dosya cok buyuk. Daha kucuk bir dosya deneyin.' }),
                {
                    status: 413,
                    headers: jsonHeaders,
                }
            );
        }

        const prompt =
            'Bu dosyadaki metni oldugu gibi cikart. ' +
            'Yalnizca duz metin dondur, markdown veya kod blogu kullanma. ' +
            'Bos satirlari makul sekilde koru.';

        const geminiResult = await callGeminiWithRetry({
            contents: [
                {
                    parts: [
                        { text: `${prompt}\n\nDosya: ${fileName ?? 'unknown'}` },
                        {
                            inlineData: {
                                mimeType,
                                data: base64Data,
                            },
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
        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!text) {
            // Olculdu: ayni PDF ilk denemede bos donup 422 aliyor, ikinci
            // denemede 63.000 karakter cikariyor. Sebebi gorebilmek icin
            // finishReason yanitla birlikte donuyor.
            const finishReason = result?.candidates?.[0]?.finishReason ?? null;
            const blockReason = result?.promptFeedback?.blockReason ?? null;

            console.error('extract-source-text: model metin dondurmedi', {
                finishReason,
                blockReason,
                model: geminiResult.model,
                fileName: fileName ?? 'unknown',
            });

            return new Response(
                JSON.stringify({
                    error: 'Dosyadan metin cikarilamadi. Lutfen tekrar deneyin.',
                    diagnostic: { reason: 'empty-model-response', finishReason, blockReason },
                }),
                {
                    status: 422,
                    headers: jsonHeaders,
                }
            );
        }

        return new Response(JSON.stringify({ text }), {
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
