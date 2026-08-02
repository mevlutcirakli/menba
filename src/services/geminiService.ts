import { GoogleGenAI } from '@google/genai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export interface ExtractedQuestionItem {
  topicName: string;
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: number; // 1: Kolay, 2: Orta, 3: Zor
}

export interface ExtractTopicsParams {
  contentText: string;
  maxTopics?: number;
}

export interface ExtractQuestionsParams {
  contentText: string;
  topicNames: string[];
  maxQuestionsPerTopic?: number;
}

export async function extractTopicsFromSource(params: ExtractTopicsParams): Promise<string[]> {
  const { contentText, maxTopics = 6 } = params;

  if (!contentText || contentText.trim().length < 10) {
    return ['Genel Bilgiler'];
  }

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Aşağıdaki eğitim/ders/metin kaynağından en önemli ${maxTopics} adet ana konuyu/alt başlığı tespit et ve YALNIZCA bir JSON string dizisi olarak döndür.
Örnek çıktı formatı: ["Konu 1", "Konu 2", "Konu 3"]

Kaynak Metin:
${contentText.slice(0, 8000)}`,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const text = response.text?.trim() || '[]';
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((t) => String(t).trim()).filter(Boolean);
      }
    } catch (err) {
      console.warn('Gemini API topic extraction fallback:', err);
    }
  }

  // Fallback heuristic extraction from paragraphs or headings
  const lines = contentText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 4 && l.length < 80);

  const candidates: string[] = [];
  for (const line of lines) {
    if (/^[0-9A-ZÇĞİÖŞÜa-zçğiöşü\s.:-]+$/.test(line) && !line.endsWith('.')) {
      candidates.push(line.replace(/^[0-9.\s-]+/, ''));
    }
    if (candidates.length >= maxTopics) break;
  }

  if (candidates.length === 0) {
    return ['Temel Kavramlar', 'Ana İlkeler', 'Uygulamalar ve Örnekler'];
  }

  return Array.from(new Set(candidates)).slice(0, maxTopics);
}

export async function extractQuestionsFromSource(
  params: ExtractQuestionsParams
): Promise<ExtractedQuestionItem[]> {
  const { contentText, topicNames, maxQuestionsPerTopic = 3 } = params;

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Aşağıdaki metin kaynağından ve belirtilen konulardan yararlanarak çoktan seçmeli kaliteli test soruları üret.
Her konu için en fazla ${maxQuestionsPerTopic} soru üret.
Yalnızca geçerli bir JSON dizisi dündür. Her eleman şu objeyi içermelidir:
{
  "topicName": "Konu Adı",
  "questionText": "Soru metni...",
  "options": ["A şıkkı", "B şıkkı", "C şıkkı", "D şıkkı"],
  "correctAnswer": "Doğru şıkkın birebir metni",
  "explanation": "Doğru cevabın detaylı Türkçe açıklaması",
  "difficulty": 1, 2 veya 3 (1: Kolay, 2: Orta, 3: Zor)
}

Hedef Konular: ${topicNames.join(', ')}

Kaynak Metin:
${contentText.slice(0, 10000)}`,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      });

      const text = response.text?.trim() || '[]';
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((q: any) => ({
          topicName: q.topicName || topicNames[0] || 'Genel',
          questionText: q.questionText || 'Soru',
          options: Array.isArray(q.options) && q.options.length === 4 ? q.options : ['Seçenek 1', 'Seçenek 2', 'Seçenek 3', 'Seçenek 4'],
          correctAnswer: q.correctAnswer || (q.options ? q.options[0] : 'Seçenek 1'),
          explanation: q.explanation || 'Doğru seçenek metinde belirtilen temel ilkeye dayanmaktadır.',
          difficulty: typeof q.difficulty === 'number' ? q.difficulty : 2,
        }));
      }
    } catch (err) {
      console.warn('Gemini question extraction fallback:', err);
    }
  }

  // Fallback auto generator when API key is not present or API call fails
  const questions: ExtractedQuestionItem[] = [];
  const topics = topicNames.length > 0 ? topicNames : ['Temel Konu'];

  topics.forEach((topic, tIdx) => {
    for (let i = 1; i <= maxQuestionsPerTopic; i++) {
      const qNum = tIdx * maxQuestionsPerTopic + i;
      questions.push({
        topicName: topic,
        questionText: `"${topic}" konusuyla ilgili olarak metinde vurgulanan temel unsur aşağıdakilerden hangisidir? (Soru #${qNum})`,
        options: [
          `${topic} kavramının teorik ve pratik esasları`,
          `Sadece ikincil nitelikteki detay ifadeler`,
          `Konuyla doğrudan ilgisi bulunmayan genel yargılar`,
          `Metinde yer almayan istisnai durumlar`,
        ],
        correctAnswer: `${topic} kavramının teorik ve pratik esasları`,
        explanation: `Metinde "${topic}" başlığı altında sistemin ana omurgasını oluşturan temel ilke ve pratik esaslar açıklanmaktadır.`,
        difficulty: (i % 3) + 1,
      });
    }
  });

  return questions;
}

export async function explainWrongAnswer(
  question: string,
  userAnswer: string,
  correctAnswer: string
): Promise<string> {
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Bir öğrenci test çözerken aşağıdaki soruda yanlış cevap verdi.
Öğrenciye nazik, teşvik edici ve öğretici bir dille doğru cevabın neden "${correctAnswer}" olduğunu ve kafa karışıklığını giderecek kilit ipucunu açıkla.

Soru: ${question}
Öğrencinin Yanıtı: ${userAnswer}
Doğru Yanıt: ${correctAnswer}`,
        config: {
          temperature: 0.4,
        },
      });

      if (response.text) {
        return response.text.trim();
      }
    } catch (err) {
      console.warn('Gemini explanation fallback:', err);
    }
  }

  return `Seçtiğin yanıt ("${userAnswer}") yanıltıcı bir seçenektir. Doğru cevap "${correctAnswer}" olmalıdır. Konu kavramını pekiştirmek için kaynak metindeki ilgili bölümü tekrar gözden geçirebilirsin.`;
}
