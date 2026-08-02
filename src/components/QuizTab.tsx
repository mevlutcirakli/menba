import React, { useState, useEffect } from 'react';
import { Play, BookOpen, Layers, Zap, Sliders, AlertCircle, CheckCircle } from 'lucide-react';
import { storageService } from '../services/storageService';
import { Source, Topic, Question } from '../types';
import { QuizRunner } from './QuizRunner';

interface QuizTabProps {
  initialSourceId?: string;
  onFinishQuizToDashboard: () => void;
}

export const QuizTab: React.FC<QuizTabProps> = ({ initialSourceId, onFinishQuizToDashboard }) => {
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>(initialSourceId || '');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('all');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'adaptive'>('adaptive');
  const [questionCount, setQuestionCount] = useState<number>(5);

  const [activeQuizQuestions, setActiveQuizQuestions] = useState<Question[] | null>(null);

  useEffect(() => {
    const allSources = storageService.getSources();
    setSources(allSources);

    if (allSources.length > 0 && !selectedSourceId) {
      setSelectedSourceId(allSources[0].id);
    }
  }, [initialSourceId]);

  useEffect(() => {
    if (!selectedSourceId) return;
    const allTopics = storageService.getTopics();
    setTopics(allTopics.filter((t) => t.source_id === selectedSourceId));
    setSelectedTopicId('all');
  }, [selectedSourceId]);

  const handleStartQuiz = () => {
    if (!selectedSourceId) return;

    let availableQuestions = storageService
      .getQuestions()
      .filter((q) => q.source_id === selectedSourceId);

    if (selectedTopicId !== 'all') {
      const topicObj = topics.find((t) => t.id === selectedTopicId);
      if (topicObj) {
        availableQuestions = availableQuestions.filter(
          (q) =>
            q.topic_id === selectedTopicId ||
            (q.topic_name && q.topic_name.toLowerCase() === topicObj.name.toLowerCase())
        );
      }
    }

    if (difficulty !== 'adaptive') {
      const filteredByDiff = availableQuestions.filter((q) => q.difficulty === difficulty);
      if (filteredByDiff.length > 0) {
        availableQuestions = filteredByDiff;
      }
    }

    // Shuffle questions
    const shuffled = [...availableQuestions].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, Math.min(questionCount, shuffled.length));

    if (chosen.length === 0) {
      alert('Bu kriterlere uygun henüz soru bulunmuyor. Lütfen başka bir konu seçin veya yeni sorular üretin.');
      return;
    }

    setActiveQuizQuestions(chosen);
  };

  const selectedSource = sources.find((s) => s.id === selectedSourceId);

  if (activeQuizQuestions && selectedSource) {
    return (
      <QuizRunner
        sourceTitle={selectedSource.title}
        sourceId={selectedSource.id}
        questions={activeQuizQuestions}
        onFinishQuiz={() => {
          setActiveQuizQuestions(null);
          onFinishQuizToDashboard();
        }}
        onExit={() => setActiveQuizQuestions(null)}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-indigo-900/50">
        <div className="max-w-2xl">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">Pratik & Sınav Simülatörü</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 mb-2">
            Özelleştirilmiş Test Başlat
          </h1>
          <p className="text-slate-300 text-sm leading-relaxed">
            İstediğiniz kaynağı ve konu başlıklarını seçin, adaptif zorluk derecesini ayarlayın ve pekiştirici pratik modunu hemen başlatın.
          </p>
        </div>
      </div>

      {sources.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
          <p className="text-base font-bold text-slate-700">Test çözülecek kaynak bulunamadı</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Test başlatabilmek için öncelikle 'Ekle / Analiz' sekmesinden bir kaynak ekleyin.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200/80 space-y-6">
          {/* 1. Select Source */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              1. Test Edilecek Kaynak
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sources.map((source) => {
                const isSelected = source.id === selectedSourceId;
                return (
                  <button
                    key={source.id}
                    onClick={() => setSelectedSourceId(source.id)}
                    className={`p-4 rounded-2xl border text-left transition-all flex items-start justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 line-clamp-1">{source.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {source.questions_count || 0} Soru Bankası • {source.topics_count || 0} Konu
                      </p>
                    </div>
                    {isSelected && <CheckCircle className="w-5 h-5 text-indigo-600 shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Select Topic */}
          {topics.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                2. Konu Filtresi
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedTopicId('all')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    selectedTopicId === 'all'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Tüm Konular ({topics.length})
                </button>
                {topics.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTopicId(t.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      selectedTopicId === t.id
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. Difficulty & Count Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Zorluk Derecesi
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'adaptive', label: '⚡ Adaptif AI' },
                  { id: 'easy', label: 'Kolay' },
                  { id: 'medium', label: 'Orta' },
                  { id: 'hard', label: 'Zor' },
                ].map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDifficulty(d.id as any)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      difficulty === d.id
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Soru Sayısı
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 15, 20].map((num) => (
                  <button
                    key={num}
                    onClick={() => setQuestionCount(num)}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      questionCount === num
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {num} Soru
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Start Action */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
            <button
              onClick={handleStartQuiz}
              disabled={!selectedSourceId}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Testi Şimdi Başlat</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
