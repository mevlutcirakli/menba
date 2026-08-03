/**
 * Kaynak isleme hattini telefona gerek kalmadan yerelde test eder.
 *
 * Kullanim:
 *   node scripts/test-ingest.mjs <metin-dosyasi> [secenekler]
 *
 * Secenekler:
 *   --mode   hybrid | questions-only | topics-only   (varsayilan: questions-only)
 *   --strategy single | chunked | both              (varsayilan: both)
 *
 * "both" ile eski davranis (tek cagri) ile yeni davranis (parcalama) ayni
 * metin uzerinde olculur; parcalamanin gercekten daha fazla soru getirip
 * getirmedigi boylece sayiyla gorulur.
 *
 * Uygulamanin kendi Edge Function'larini cagirir, yani gercek hatti olcer.
 * Buradaki sabitler ve dedupe mantigi src/hooks/useSources.ts ile birebir
 * ayni tutulmalidir; ayrisirsa olcum yaniltici olur.
 */
import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const EDGE_CONTENT_LIMIT = 28000; // extract-questions/index.ts icindeki MAX_CONTENT_LENGTH

// --- useSources.ts ile ayni sabitler ---
const CONTENT_CHUNK_SIZE = 10000;
const CONTENT_CHUNK_OVERLAP = 800;
const MAX_CONTENT_CHUNKS = 8;
const MAX_AUTO_EXTRACT_QUESTIONS_TOTAL = 80;
const MAX_AUTO_EXTRACT_QUESTIONS_PER_TOPIC = 30;
const MIN_AUTO_EXTRACT_QUESTIONS_PER_TOPIC = 3;
const MAX_AUTO_EXTRACT_TOPICS = 16;
const TOPIC_SAMPLE_BUDGET = 24000;
const TOPIC_SAMPLE_WINDOW_COUNT = 8;
const MAX_EMPTY_CHUNK_ATTEMPTS = 3;
const GROUNDING_NGRAM_SIZE = 5;
const DEFAULT_QUESTIONS_ONLY_TOPIC_NAME = 'Genel Soru Bankasi';
const FUZZY_DUPLICATE_SIMILARITY_THRESHOLD = 0.82;

function loadEnv() {
    for (const file of ['.env.local', '.env']) {
        try {
            const raw = readFileSync(file, 'utf8');
            for (const line of raw.split('\n')) {
                const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
                if (m && !process.env[m[1]]) {
                    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
                }
            }
        } catch {
            // dosya yoksa sonrakine gec
        }
    }
}

// --- useSources.ts kopyalari (davranis ayni kalmali) ---
function splitContentIntoChunks(text) {
    if (text.length <= CONTENT_CHUNK_SIZE) {
        return [text];
    }

    const chunks = [];
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

function buildTopicSamplingExcerpt(text) {
    if (text.length <= TOPIC_SAMPLE_BUDGET) return text;
    const windowSize = Math.floor(TOPIC_SAMPLE_BUDGET / TOPIC_SAMPLE_WINDOW_COUNT);
    const stride = Math.floor(text.length / TOPIC_SAMPLE_WINDOW_COUNT);
    const windows = [];
    for (let i = 0; i < TOPIC_SAMPLE_WINDOW_COUNT; i += 1) {
        windows.push(text.slice(i * stride, i * stride + windowSize));
    }
    return windows.join('\n\n[...]\n\n');
}

function estimateQuestionLikeCount(text) {
    const numberedStemCount = text.match(/(?:^|\n)\s*\d{1,3}[.)-]\s+.+/g)?.length ?? 0;
    const optionStemCount = text.match(/(?:^|\n)\s*[A-Ea-e][.)]\s+.+/g)?.length ?? 0;

    return Math.max(numberedStemCount, Math.floor(optionStemCount / 4));
}

// --- Kaynak-dogrulama (useSources.ts ile ayni) ---
function normalizeForGrounding(value) {
    return value
        .toLocaleLowerCase('tr-TR')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function toNgramList(value) {
    const words = normalizeForGrounding(value).split(' ').filter(Boolean);
    if (words.length < GROUNDING_NGRAM_SIZE) return [];

    const ngrams = [];
    for (let i = 0; i + GROUNDING_NGRAM_SIZE <= words.length; i += 1) {
        ngrams.push(words.slice(i, i + GROUNDING_NGRAM_SIZE).join(' '));
    }
    return ngrams;
}

function buildSourceNgramIndex(sourceText) {
    return new Set(toNgramList(sourceText));
}

function isQuestionGroundedInSource(questionText, sourceIndex) {
    if (sourceIndex.size === 0) return true;
    const ngrams = toNgramList(questionText);
    if (ngrams.length === 0) return true;
    return ngrams.some((n) => sourceIndex.has(n));
}

function normalizeQuestionText(value) {
    return value
        .toLocaleLowerCase('tr-TR')
        .replace(/\s+/g, ' ')
        .replace(/[?!.,;:]+$/g, '')
        .trim();
}

function tokenizeQuestion(value) {
    const cleaned = value
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) {
        return new Set();
    }

    return new Set(
        cleaned
            .split(' ')
            .map((token) => token.trim())
            .filter((token) => token.length > 2)
    );
}

function calculateJaccardSimilarity(a, b) {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;

    let intersectionCount = 0;
    for (const token of a) {
        if (b.has(token)) intersectionCount += 1;
    }

    const unionCount = a.size + b.size - intersectionCount;
    return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

/**
 * useSources.ts'in veritabanina yazmadan once uyguladigi fuzzy elemeyi taklit
 * eder. Ham donen soru sayisi ile gercekten kaydedilecek soru sayisi arasinda
 * ciddi fark olabiliyor; olcumun bunu gostermesi gerekiyor.
 */
function applyFuzzyDedupe(questions) {
    const acceptedByTopic = new Map();
    const accepted = [];
    let skippedSimilar = 0;

    for (const item of questions) {
        const normalized = normalizeQuestionText(item.questionText);
        if (!normalized) continue;

        const existing = acceptedByTopic.get(item.topicName) ?? [];
        const tokens = tokenizeQuestion(normalized);
        const isSimilar = existing.some(
            (other) => calculateJaccardSimilarity(tokens, other) >= FUZZY_DUPLICATE_SIMILARITY_THRESHOLD
        );

        if (isSimilar) {
            skippedSimilar += 1;
            continue;
        }

        existing.push(tokens);
        acceptedByTopic.set(item.topicName, existing);
        accepted.push(item);
    }

    return { accepted, skippedSimilar };
}

async function callEdge(name, body) {
    const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/${name}`;
    const started = Date.now();

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const text = await res.text();

    let json;
    try {
        json = JSON.parse(text);
    } catch {
        json = { error: text.slice(0, 300) };
    }

    return { status: res.status, elapsed, json };
}

function reportDistribution(questions) {
    const byTopic = new Map();
    for (const item of questions) {
        byTopic.set(item.topicName, (byTopic.get(item.topicName) ?? 0) + 1);
    }

    for (const [name, count] of [...byTopic.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${count.toString().padStart(3)}  ${name}`);
    }
}

/** Tek cagri: parcalama oncesindeki davranis. */
async function runSingle(contentText, topicNames, perTopic) {
    const q = await callEdge('extract-questions', {
        contentText,
        topicNames,
        maxQuestionsPerTopic: perTopic,
    });

    console.log('HTTP', q.status, `(${q.elapsed}s)`);
    if (q.json.error) {
        console.log('HATA:', q.json.error);
        return [];
    }

    return q.json.questions ?? [];
}

/** Parcali cagri: useSources.ts'teki mevcut davranis. */
async function runChunked(contentText, topicNames) {
    const chunks = splitContentIntoChunks(contentText);
    console.log('parca sayisi   :', chunks.length);

    const collected = [];
    const seen = new Set();
    let failures = 0;
    let empties = 0;

    // Butun parcalar okunuyor; erken cikis yok.
    for (const [index, chunk] of chunks.entries()) {
        // Butce parca basina.
        const perTopic = Math.min(
            MAX_AUTO_EXTRACT_QUESTIONS_PER_TOPIC,
            Math.max(MIN_AUTO_EXTRACT_QUESTIONS_PER_TOPIC, estimateQuestionLikeCount(chunk))
        );

        let items = [];
        let failed = false;
        let attemptsUsed = 0;

        for (let attempt = 1; attempt <= MAX_EMPTY_CHUNK_ATTEMPTS; attempt += 1) {
            attemptsUsed = attempt;
            const q = await callEdge('extract-questions', {
                contentText: chunk,
                topicNames,
                maxQuestionsPerTopic: perTopic,
            });

            if (q.json.error) {
                failed = true;
                continue;
            }

            failed = false;
            items = q.json.questions ?? [];
            if (items.length > 0) break;
        }

        if (failed) {
            failures += 1;
            console.log(`  parca ${index + 1}: HATA (${attemptsUsed} deneme)`);
            continue;
        }

        if (items.length === 0) {
            empties += 1;
            console.log(`  parca ${index + 1}: ${attemptsUsed} denemede de BOS dondu`);
            continue;
        }

        let fresh = 0;
        for (const item of items) {
            const key = normalizeQuestionText(item.questionText);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            collected.push(item);
            fresh += 1;
        }

        console.log(
            `  parca ${index + 1}: ${chunk.length.toLocaleString('tr-TR')} krk, ` +
                `tavan ${perTopic} -> ${items.length} soru, ${fresh} yeni (${attemptsUsed} deneme)`
        );
    }

    if (failures + empties > 0) {
        console.log(`  UYARI: ${failures + empties}/${chunks.length} parcadan soru alinamadi`);
    }

    return collected;
}

async function main() {
    loadEnv();

    const filePath = argv[2];
    if (!filePath) {
        console.error('Kullanim: node scripts/test-ingest.mjs <metin-dosyasi> [--mode questions-only] [--strategy both]');
        exit(1);
    }

    if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
        console.error('EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY bulunamadi (.env.local).');
        exit(1);
    }

    const modeIndex = argv.indexOf('--mode');
    const mode = modeIndex > -1 ? argv[modeIndex + 1] : 'questions-only';
    const strategyIndex = argv.indexOf('--strategy');
    const strategy = strategyIndex > -1 ? argv[strategyIndex + 1] : 'both';

    const contentText = readFileSync(filePath, 'utf8');

    console.log('=== KAYNAK ===');
    console.log('dosya           :', filePath);
    console.log('mod             :', mode);
    console.log('strateji        :', strategy);
    console.log('karakter        :', contentText.length.toLocaleString('tr-TR'));
    if (contentText.length > EDGE_CONTENT_LIMIT) {
        const lostPct = (100 * (1 - EDGE_CONTENT_LIMIT / contentText.length)).toFixed(1);
        console.log(
            `KIRPILMA (tek cagri): ilk ${EDGE_CONTENT_LIMIT.toLocaleString('tr-TR')} karakter` +
                ` -> icerigin %${lostPct}'i hic gorulmuyor`
        );
    } else {
        console.log('KIRPILMA (tek cagri): yok');
    }
    console.log();

    // useSources.ts artik her modda konu cikarimi deniyor.
    let topics = [];
    console.log('=== extract-topics ===');
    const r = await callEdge('extract-topics', {
        contentText: buildTopicSamplingExcerpt(contentText),
        maxTopics: MAX_AUTO_EXTRACT_TOPICS,
    });
    console.log('HTTP', r.status, `(${r.elapsed}s)`);
    if (r.json.error) {
        console.log('HATA:', r.json.error);
    } else {
        topics = r.json.topics ?? [];
        console.log('donen konu sayisi:', topics.length);
        topics.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
    }
    console.log();

    const topicNames = topics.length > 0 ? topics : [DEFAULT_QUESTIONS_ONLY_TOPIC_NAME];

    const estimated = estimateQuestionLikeCount(contentText);
    const target = Math.min(
        MAX_AUTO_EXTRACT_QUESTIONS_TOTAL,
        Math.max(topicNames.length * 6, estimated)
    );
    const perTopic = Math.min(
        MAX_AUTO_EXTRACT_QUESTIONS_PER_TOPIC,
        Math.max(3, Math.ceil(target / topicNames.length))
    );

    console.log('=== UYGULAMANIN HESABI (useSources.ts) ===');
    console.log('metinde tahmini soru      :', estimated);
    console.log('hedef toplam soru         :', target);
    console.log('konu basina istenen       :', perTopic, `(tavan ${MAX_AUTO_EXTRACT_QUESTIONS_PER_TOPIC})`);
    console.log('teorik ust sinir          :', perTopic * topicNames.length);
    console.log();

    const results = {};

    if (strategy === 'single' || strategy === 'both') {
        console.log('=== A) TEK CAGRI (parcalama yok) ===');
        const raw = await runSingle(contentText, topicNames, perTopic);
        const unique = [];
        const seen = new Set();
        for (const item of raw) {
            const key = normalizeQuestionText(item.questionText);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            unique.push(item);
        }
        const { accepted, skippedSimilar } = applyFuzzyDedupe(unique);
        results.single = { raw: raw.length, unique: unique.length, accepted: accepted.length, skippedSimilar };
        console.log('ham donen soru      :', raw.length);
        console.log('tekil (birebir)     :', unique.length);
        console.log('fuzzy eleme sonrasi :', accepted.length, `(${skippedSimilar} benzer elendi)`);
        console.log('konu bazinda dagilim:');
        reportDistribution(accepted);
        console.log();
    }

    if (strategy === 'chunked' || strategy === 'both') {
        console.log('=== B) PARCALI CAGRI (mevcut useSources davranisi) ===');
        const collected = await runChunked(contentText, topicNames);

        // Kaynak-dogrulama: metinde karsiligi olmayan sorular elenir.
        const sourceIndex = buildSourceNgramIndex(contentText);
        const grounded = collected.filter((item) =>
            isQuestionGroundedInSource(item.questionText, sourceIndex)
        );
        const ungroundedCount = collected.length - grounded.length;

        const { accepted, skippedSimilar } = applyFuzzyDedupe(grounded);
        results.chunked = { raw: collected.length, accepted: accepted.length, skippedSimilar };
        console.log('tekil (birebir)          :', collected.length);
        console.log('kaynakta bulunamadi      :', ungroundedCount, '<- uydurma, elendi');
        console.log('fuzzy eleme sonrasi      :', accepted.length, `(${skippedSimilar} benzer elendi)`);
        console.log('konu bazinda dagilim:');
        reportDistribution(accepted);
        console.log();

        if (collected.length > 0) {
            const s = collected[0];
            console.log('=== ORNEK SORU ===');
            console.log('konu   :', s.topicName);
            console.log('soru   :', String(s.questionText).slice(0, 160));
            console.log('sikklar:', JSON.stringify(s.options)?.slice(0, 200));
            console.log('dogru  :', s.correctAnswer);
            console.log('zorluk :', s.difficulty);
            console.log();
        }
    }

    if (results.single && results.chunked) {
        console.log('=== SONUC: PARCALAMANIN ETKISI ===');
        console.log('tek cagri  -> kaydedilecek soru:', results.single.accepted);
        console.log('parcali    -> kaydedilecek soru:', results.chunked.accepted);
        const delta = results.chunked.accepted - results.single.accepted;
        const pct =
            results.single.accepted > 0
                ? ` (%${((100 * delta) / results.single.accepted).toFixed(0)})`
                : '';
        console.log('fark                          :', (delta >= 0 ? '+' : '') + delta + pct);
    }
}

main().catch((err) => {
    console.error('Beklenmeyen hata:', err);
    exit(1);
});
