import React, { useState, useEffect } from 'react';
import { Search, BookOpen, Layers, HelpCircle, Trash2, Plus, FileText, ChevronRight, X, Sparkles, Loader2, Play } from 'lucide-react';
import { storageService } from '../services/storageService';
import { extractQuestionsFromSource } from '../services/geminiService';
import { Source, Topic, Question } from '../types';

interface SourcesTabProps {
  onSelectSourceForQuiz: (sourceId: string) => void;
}

export const SourcesTab: React.FC<SourcesTabProps> = ({ onSelectSourceForQuiz }) => {
  const [sources, setSources] = useState<Source[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [sourceTopics, setSourceTopics] = useState<Topic[]>([]);
  const [sourceQuestions, setSourceQuestions] = useState<Question[]>([]);
  const [activeDetailTab, setActiveDetailTab] = useState<'topics' | 'questions' | 'content'>('topics');
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);

  const loadData = () => {
    setSources(storageService.getSources());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenSourceDetail = (source: Source) => {
    setSelectedSource(source);
    const allTopics = storageService.getTopics();
    const allQuestions = storageService.getQuestions();

    setSourceTopics(allTopics.filter((t) => t.source_id === source.id));
    setSourceQuestions(allQuestions.filter((q) => q.source_id === source.id));
    setActiveDetailTab('topics');
  };

  const handleDeleteSource = (sourceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Bu kaynağı ve bağlı tüm konuları/soruları silmek istediğinize emin misiniz?')) {
      storageService.deleteSource(sourceId);
      if (selectedSource?.id === sourceId) {
        setSelectedSource(null);
      }
      loadData();
    }
  };

  const handleGenerateMoreQuestions = async (topicName?: string) => {
    if (!selectedSource) return;

    setIsGeneratingMore(true);
    try {
      const topicList = topicName ? [topicName] : sourceTopics.map((t) => t.name);
      const newRawQuestions = await extractQuestionsFromSource({
        contentText: selectedSource.content,
        topicNames: topicList.length > 0 ? topicList : ['Genel'],
        maxQuestionsPerTopic: 2,
      });

      const newEntities: Question[] = newRawQuestions.map((q, idx) => {
        const matchingTopic = sourceTopics.find(
          (t) => t.name.toLowerCase() === q.topicName.toLowerCase()
        );
        return {
          id: `q-extra-${Date.now()}-${idx}`,
          source_id: selectedSource.id,
          topic_id: matchingTopic?.id,
          topic_name: q.topicName,
          question_text: q.questionText,
          options: q.options,
          correct_option_index: q.options.findIndex(
            (o) => o.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim()
          ),
          explanation: q.explanation,
          difficulty: q.difficulty === 1 ? 'easy' : q.difficulty === 3 ? 'hard' : 'medium',
        };
      });

      storageService.addQuestions(newEntities);
      setSourceQuestions((prev) => [...newEntities, ...prev]);

      // update source count
      const updatedSources = sources.map((s) => {
        if (s.id === selectedSource.id) {
          return { ...s, questions_count: (s.questions_count || 0) + newEntities.length };
        }
        return s;
      });
      setSources(updatedSources);
      storageService.saveSources(updatedSources);
    } catch (err) {
      console.error('Error generating extra questions:', err);
      alert('Soru üretilirken bir hata oluştu.');
    } finally {
      setIsGeneratingMore(false);
    }
  };

  const filteredSources = sources.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Kaynak Kütüphanesi</h1>
          <p className="text-xs text-slate-500 font-medium">
            İşlenmiş içerikleriniz, konu dağılımları ve üretilen soru bankaları
          </p>
        </div>

        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Kaynaklarda ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium bg-white"
          />
        </div>
      </div>

      {/* Source Cards Grid */}
      {filteredSources.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
          <p className="text-base font-bold text-slate-700">Henüz kaynak bulunmuyor</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            'Ekle / Analiz' sekmesine giderek ilk ders notunuzu veya PDF belgenizi yükleyebilirsiniz.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredSources.map((source) => (
            <div
              key={source.id}
              onClick={() => handleOpenSourceDetail(source)}
              className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {source.file_type?.toUpperCase() || 'METİN'}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1 mt-0.5">
                        {source.title}
                      </h3>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDeleteSource(source.id, e)}
                    className="text-slate-300 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100"
                    title="Kaynağı Sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-slate-600 line-clamp-2 mb-4 leading-relaxed">
                  {source.description || source.content.slice(0, 120) + '...'}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center space-x-4 text-xs font-semibold text-slate-500">
                  <span className="flex items-center space-x-1">
                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{source.topics_count || 0} Konu</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <HelpCircle className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{source.questions_count || 0} Soru</span>
                  </span>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSourceForQuiz(source.id);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-semibold text-xs flex items-center space-x-1 transition-all"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Test Çöz</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected Source Modal Detail */}
      {selectedSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-4xl w-full h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold line-clamp-1">{selectedSource.title}</h2>
                  <p className="text-xs text-slate-400">
                    {sourceTopics.length} Konu • {sourceQuestions.length} Soru Bankası
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    const id = selectedSource.id;
                    setSelectedSource(null);
                    onSelectSourceForQuiz(id);
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/30"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Test Başlat</span>
                </button>
                <button
                  onClick={() => setSelectedSource(null)}
                  className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-6">
              <button
                onClick={() => setActiveDetailTab('topics')}
                className={`px-4 py-3 font-semibold text-xs border-b-2 transition-colors flex items-center space-x-2 ${
                  activeDetailTab === 'topics'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Konular ({sourceTopics.length})</span>
              </button>
              <button
                onClick={() => setActiveDetailTab('questions')}
                className={`px-4 py-3 font-semibold text-xs border-b-2 transition-colors flex items-center space-x-2 ${
                  activeDetailTab === 'questions'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <HelpCircle className="w-4 h-4" />
                <span>Soru Bankası ({sourceQuestions.length})</span>
              </button>
              <button
                onClick={() => setActiveDetailTab('content')}
                className={`px-4 py-3 font-semibold text-xs border-b-2 transition-colors flex items-center space-x-2 ${
                  activeDetailTab === 'content'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Kaynak Metni</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
              {activeDetailTab === 'topics' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {sourceTopics.map((topic) => (
                      <div
                        key={topic.id}
                        className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm text-slate-900">{topic.name}</h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                            Önem: {topic.importance || 3}/5
                          </span>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
                            <span>Ustalık Seviyesi</span>
                            <span className="font-bold text-indigo-600">{topic.mastery_level || 50}%</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                              style={{ width: `${topic.mastery_level || 50}%` }}
                            />
                          </div>
                        </div>

                        <button
                          onClick={() => handleGenerateMoreQuestions(topic.name)}
                          disabled={isGeneratingMore}
                          className="w-full py-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors flex items-center justify-center space-x-1"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Bu Konudan Ek Soru Üret</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeDetailTab === 'questions' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Üretilmiş Çoktan Seçmeli Sorular
                    </p>
                    <button
                      onClick={() => handleGenerateMoreQuestions()}
                      disabled={isGeneratingMore}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-sm"
                    >
                      {isGeneratingMore ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Üretiliyor...</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>AI ile Ek Sorular Üret</span>
                        </>
                      )}
                    </button>
                  </div>

                  {sourceQuestions.map((q, idx) => (
                    <div
                      key={q.id}
                      className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                          Soru #{idx + 1} • {q.topic_name || 'Genel'}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          Zorluk: {q.difficulty === 'easy' ? 'Kolay' : q.difficulty === 'hard' ? 'Zor' : 'Orta'}
                        </span>
                      </div>

                      <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                        {q.question_text}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {q.options.map((opt, oIdx) => {
                          const isCorrect = oIdx === q.correct_option_index;
                          return (
                            <div
                              key={oIdx}
                              className={`p-2.5 rounded-xl text-xs font-medium border ${
                                isCorrect
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                                  : 'bg-slate-50 border-slate-200 text-slate-700'
                              }`}
                            >
                              <span className="font-bold mr-2">{String.fromCharCode(65 + oIdx)})</span>
                              {opt}
                            </div>
                          );
                        })}
                      </div>

                      {q.explanation && (
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 text-xs text-slate-600 leading-relaxed mt-2">
                          <span className="font-bold text-slate-800">Açıklama: </span>
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeDetailTab === 'content' && (
                <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm font-sans text-sm text-slate-800 leading-relaxed whitespace-pre-wrap select-text">
                  {selectedSource.content}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
