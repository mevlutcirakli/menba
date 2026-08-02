import { serve } from 'https://deno.land/std/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash';
const GEMINI_FALLBACK_MODEL = Deno.env.get('GEMINI_FALLBACK_MODEL') ?? 'gemini-3.5-flash-lite';
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES_PER_MODEL = 3;

if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY bulunamadi. Supabase secret olarak tanimlanmali.');
}

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

serve(async (req) => {
    try {
        const { sourceContent, topicName, difficulty = 3 } = await req.json();

        const prompt = `Asagidaki kaynaktan "${topicName}" konusuyla ilgili,\n` +
            `zorluk seviyesi ${difficulty}/5 olan bir coktan secmeli soru uret.\n` +
            'Sadece su JSON formatinda yanit ver, baska hicbir metin ekleme:\n' +
            '{"soru": "...", "secenekler": ["A) ...", "B) ...", "C) ...", "D) ..."], "dogruCevap": "A", "aciklama": "..."}\n\n' +
            `Kaynak metin:\n${sourceContent}`;

        const geminiResult = await callGeminiWithRetry({
            contents: [{ parts: [{ text: prompt }] }],
        });

        if ('error' in geminiResult) {
            return new Response(JSON.stringify({ error: geminiResult.error }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const result = await geminiResult.response.json();
        const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawText) {
            return new Response(
                JSON.stringify({ error: 'Gemini yaniti bos veya beklenen formatta degil.' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const cleanJson = rawText.replace(/```json|```/g, '').trim();

        return new Response(cleanJson, {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Bilinmeyen hata' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
});
