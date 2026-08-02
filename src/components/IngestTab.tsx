import React, { useState } from 'react';
import { Sparkles, FileText, Upload, CheckCircle2, Loader2, ArrowRight, BookOpen, Layers, HelpCircle, GitBranch, ListFilter } from 'lucide-react';
import { extractTopicsFromSource, extractQuestionsFromSource } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { Source, Topic, Question, IngestMode } from '../types';

interface IngestTabProps {
  onSourceCreated: (sourceId: string) => void;
  onNavigateToQuiz: () => void;
}

const INGEST_MODE_OPTIONS: Array<{ mode: IngestMode; label: string; description: string; icon: any }> = [
  {
    mode: 'hybrid',
    label: 'Hibrit (Topic + Soru)',
    description: 'PDF/metinden konu ve soru bankası birlikte otomatik üretilir.',
    icon: Sparkles,
  },
  {
    mode: 'questions-only',
    label: 'Sadece Soru Bankası',
    description: 'İçerikten doğrudan soru çıkarılıp test bankasına eklenir.',
    icon: HelpCircle,
  },
  {
    mode: 'topics-only',
    label: 'Sadece Topic',
    description: 'Soru çıkarmadan yalnızca ana konu (topic) hiyerarşisi oluşturulur.',
    icon: ListFilter,
  },
];

export const IngestTab: React.FC<IngestTabProps> = ({ onSourceCreated, onNavigateToQuiz }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [fileType, setFileType] = useState<'text' | 'pdf' | 'doc'>('text');
  const [ingestMode, setIngestMode] = useState<IngestMode>('hybrid');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep] = useState<string>('');
  const [extractedTopics, setExtractedTopics] = useState<string[]>([]);
  const [generatedQuestionsCount, setGeneratedQuestionsCount] = useState<number>(0);
  const [completedSource, setCompletedSource] = useState<Source | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTitle(file.name.replace(/\.[^/.]+$/, ''));
    if (file.name.endsWith('.pdf')) setFileType('pdf');
    else if (file.name.endsWith('.doc') || file.name.endsWith('.docx')) setFileType('doc');
    else setFileType('text');

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setContent(text);
      }
    };
    reader.readAsText(file);
  };

  const handleStartAnalysis = async () => {
    if (!title.trim() || !content.trim()) return;

    setIsProcessing(true);
    setProcessStep('1/3 - Kaynak metni analiz ediliyor...');

    try {
      const sourceId = 'src-' + Date.now();
      let topics: string[] = [];
      let rawQuestions: any[] = [];

      // Step 1: Handle Mode Specific Topic Extraction
      if (ingestMode === 'hybrid' || ingestMode === 'topics-only') {
        setProcessStep('2/3 - Yapay Zeka ile ana konular (Topic) tespit ediliyor...');
        topics = await extractTopicsFromSource({
          contentText: content,
          maxTopics: 6,
        });
      } else {
        // questions-only mode uses a single general topic container
        topics = ['Genel Soru Bankası'];
      }
      setExtractedTopics(topics);

      // Step 2: Handle Mode Specific Question Generation
      if (ingestMode === 'hybrid' || ingestMode === 'questions-only') {
        setProcessStep('3/3 - Soru bankası ve detaylı Türkçe çözümler hazırlanıyor...');
        rawQuestions = await extractQuestionsFromSource({
          contentText: content,
          topicNames: topics,
          maxQuestionsPerTopic: ingestMode === 'questions-only' ? 6 : 3,
        });
      }

      // Create Topic Entities
      const topicEntities: Topic[] = topics.map((tName, idx) => ({
        id: `top-${Date.now()}-${idx}`,
        source_id: sourceId,
        name: tName,
        importance: Math.min(5, 3 + (idx % 3)),
        mastery_level: 50,
      }));

      // Create Question Entities
      const questionEntities: Question[] = rawQuestions.map((q, idx) => {
        const matchingTopic = topicEntities.find(
          (t) => t.name.toLowerCase() === q.topicName.toLowerCase()
        );
        const correctIndex = q.options.findIndex(
          (opt: string) => opt.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim()
        );

        return {
          id: `q-${Date.now()}-${idx}`,
          source_id: sourceId,
          topic_id: matchingTopic ? matchingTopic.id : topicEntities[0]?.id,
          topic_name: q.topicName || topics[0],
          question_text: q.questionText,
          options: q.options,
          correct_option_index: correctIndex !== -1 ? correctIndex : 0,
          explanation: q.explanation,
          difficulty: q.difficulty === 1 ? 'easy' : q.difficulty === 3 ? 'hard' : 'medium',
        };
      });

      // Save Source
      const newSource: Source = {
        id: sourceId,
        title: title.trim(),
        description: `${ingestMode === 'topics-only' ? 'Sadece Topic' : ingestMode === 'questions-only' ? 'Sadece Soru' : 'Hibrit'} - ${topicEntities.length} Konu, ${questionEntities.length} Soru`,
        content: content.trim(),
        file_type: fileType,
        created_at: new Date().toISOString(),
        topics_count: topicEntities.length,
        questions_count: questionEntities.length,
      };

      storageService.addSource(newSource);
      storageService.addTopics(topicEntities);
      if (questionEntities.length > 0) {
        storageService.addQuestions(questionEntities);
      }

      setGeneratedQuestionsCount(questionEntities.length);
      setCompletedSource(newSource);
      onSourceCreated(sourceId);
    } catch (error) {
      console.error('Ingest error:', error);
      alert('İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setCompletedSource(null);
    setExtractedTopics([]);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden border border-indigo-900/50">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold mb-4 border border-indigo-500/30">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>AI Destekli Kaynak İşleme Engine</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
            Yeni Kaynak Ekle ve Anında Soru Bankasına Dönüştür
          </h1>
          <p className="text-slate-300 text-sm leading-relaxed">
            Ders notlarını, PDF veya makale metinlerini buraya ekleyin. Yapay zeka içeriği otomatik analiz eder, kilit konuları çıkarır ve akıllı test soruları üretir.
          </p>
        </div>
      </div>

      {!completedSource ? (
        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200/80 space-y-6">
          {/* File Upload Zone */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              1. Belge Yükle veya Metin Yapıştır
            </label>
            <div className="border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50/50 hover:bg-indigo-50/30 transition-all rounded-2xl p-6 text-center cursor-pointer relative group">
              <input
                type="file"
                accept=".txt,.pdf,.doc,.docx"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  Dosya Seçin veya Sürükleyip Bırakın
                </p>
                <p className="text-xs text-slate-500">
                  Desteklenen formatlar: TXT, PDF, Word Dokümanları
                </p>
              </div>
            </div>
          </div>

          {/* Form Inputs */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Kaynak Başlığı
              </label>
              <input
                type="text"
                placeholder="Örn: Osmanlı Tarihi 1. Dönem Ders Notları"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Kaynak İçeriği
                </label>
                <span className="text-xs font-medium text-slate-500">
                  {content.length} Karakter (~{Math.round(content.split(/\s+/).filter(Boolean).length)} Kelime)
                </span>
              </div>
              <textarea
                rows={8}
                placeholder="Öğrenmek ve soru bankasına dönüştürmek istediğiniz ders notlarını veya içerik metnini buraya yapıştırın..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm leading-relaxed font-sans"
              />
            </div>

            {/* Ingest Mode Selector */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                2. AI İşleme Modu Seçimi
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {INGEST_MODE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = ingestMode === opt.mode;
                  return (
                    <button
                      key={opt.mode}
                      type="button"
                      onClick={() => setIngestMode(opt.mode)}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-indigo-50/80 border-indigo-500 text-indigo-950 ring-2 ring-indigo-500/20 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                            isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 mb-1">{opt.label}</h4>
                        <p className="text-[11px] text-slate-500 leading-snug">{opt.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setTitle('Siber Güvenlik ve Ağ Temelleri');
                setContent(`Siber Güvenlik ve Ağ Güvenliği Temelleri

1. Ağ Katmanları ve Protokol Güvenliği
Ağ iletişiminde OSI modeli 7 katmandan oluşur. Fiziksel katmandan uygulama katmanına kadar her aşamada farklı güvenlik tehditleri mevcuttur. HTTPS, SSL/TLS şifreleme protokolü ile uygulama katmanında veri gizliliğini sağlar.

2. Kriptografi ve Anahtar Yönetimi
Kriptografi, verilerin yetkisiz kişilerin eline geçmesini önlemek için şifrelenmesidir. Simetrik şifrelemede (AES) tek anahtar kullanılırken, Asimetrik şifrelemede (RSA) kamuya açık (public) ve gizli (private) olmak üzere iki ayrı anahtar çifti kullanılır.

3. Sızma Testi ve Güvenlik Duvarları (Firewall)
Firewall, gelen ve giden ağ trafiğini tanımlanmış güvenlik kurallarına göre denetleyen bir sistemdir. Paket filtreleme, durum bilgisi denetimi (stateful inspection) ve uygulama katmanı firewall türleri yaygın olarak tercih edilir.`);
              }}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              + Örnek İçerik Doldur
            </button>

            <button
              onClick={handleStartAnalysis}
              disabled={isProcessing || !title.trim() || content.trim().length < 15}
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 flex items-center space-x-2 transition-all cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>İşleniyor...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>AI ile Analiz Et ve Üret</span>
                </>
              )}
            </button>
          </div>

          {/* Processing Indicator */}
          {isProcessing && (
            <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center space-x-3 text-indigo-900 animate-pulse">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600 shrink-0" />
              <div className="text-xs font-medium">{processStep}</div>
            </div>
          )}
        </div>
      ) : (
        /* Completed State Card */
        <div className="bg-white rounded-2xl p-8 shadow-md border border-slate-200 space-y-6 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900">{completedSource.title}</h2>
            <p className="text-sm text-slate-600">
              Kaynak başarıyla işlendi, konular ayrıştırıldı ve soru bankası oluşturuldu.
            </p>
          </div>

          {/* Stats pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-lg mx-auto pt-2">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <Layers className="w-5 h-5 text-indigo-600 mx-auto mb-1" />
              <div className="text-xl font-bold text-slate-900">{extractedTopics.length}</div>
              <div className="text-xs text-slate-500 font-medium">Tespit Edilen Konu</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <BookOpen className="w-5 h-5 text-indigo-600 mx-auto mb-1" />
              <div className="text-xl font-bold text-slate-900">{generatedQuestionsCount}</div>
              <div className="text-xs text-slate-500 font-medium">Üretilen Test Sorusu</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 col-span-2 sm:col-span-1">
              <Sparkles className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
              <div className="text-xl font-bold text-emerald-600">%100</div>
              <div className="text-xs text-slate-500 font-medium">Hazır Durumda</div>
            </div>
          </div>

          {/* Extracted Topics Pills */}
          <div className="pt-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Çıkarılan Ana Konular
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {extractedTopics.map((t, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60 text-xs font-medium"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={resetForm}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
            >
              Başka Kaynak Ekle
            </button>
            <button
              onClick={onNavigateToQuiz}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/30 flex items-center justify-center space-x-2 transition-all"
            >
              <span>Hemen Teste Başla</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
