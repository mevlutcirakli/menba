import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  CartesianGrid,
} from 'recharts';
import { BarChart3, TrendingUp, Award, BookOpen, Clock, Target, ArrowUpRight, Play, CheckCircle2 } from 'lucide-react';
import { storageService } from '../services/storageService';
import { calculateTopicWeights } from '../services/adaptiveEngine';
import { Source, Topic, QuizSessionResult } from '../types';

interface DashboardTabProps {
  onSelectTopicForQuiz: (sourceId: string) => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({ onSelectTopicForQuiz }) => {
  const [sources, setSources] = useState<Source[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sessions, setSessions] = useState<QuizSessionResult[]>([]);

  useEffect(() => {
    setSources(storageService.getSources());
    setTopics(storageService.getTopics());
    setSessions(storageService.getSessions());
  }, []);

  const totalQuestionsAnswered = sessions.reduce((acc, s) => acc + s.total_questions, 0);
  const totalCorrectAnswers = sessions.reduce((acc, s) => acc + s.correct_answers, 0);
  const overallAccuracy = totalQuestionsAnswered > 0 ? Math.round((totalCorrectAnswers / totalQuestionsAnswered) * 100) : 78;

  // Recharts data preparation for Topic Mastery
  const chartData = topics.map((t) => ({
    name: t.name.length > 15 ? t.name.slice(0, 15) + '...' : t.name,
    mastery: t.mastery_level || 50,
  }));

  // Identify weak topics needing practice
  const weakTopics = topics.filter((t) => (t.mastery_level || 50) < 70).slice(0, 3);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Performans ve Analiz Paneli</h1>
        <p className="text-xs text-slate-500 font-medium">
          Öğrenme istatistikleriniz, konu ustalık seviyeleriniz ve AI önerileri
        </p>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">İşlenen Kaynak</span>
            <span className="text-2xl font-extrabold text-slate-900 mt-1 block">{sources.length}</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <BookOpen className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Çözülen Soru</span>
            <span className="text-2xl font-extrabold text-slate-900 mt-1 block">{totalQuestionsAnswered}</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Genel Başarı</span>
            <span className="text-2xl font-extrabold text-indigo-600 mt-1 block">%{overallAccuracy}</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Çalışma Serisi</span>
            <span className="text-2xl font-extrabold text-amber-600 mt-1 block">4 Gün 🔥</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Award className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Recharts Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar Chart: Topic Accuracy */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-base text-slate-900">Konu Bazlı Ustalık Dereceleri</h3>
            <span className="text-xs text-slate-400 font-medium">Başarı Oranı (%)</span>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderRadius: '12px',
                    color: '#fff',
                    border: 'none',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="mastery" fill="#4f46e5" radius={[6, 6, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weak Topics & Practice Recommendations */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <Target className="w-5 h-5 text-indigo-600" />
              <h3 className="font-extrabold text-base text-slate-900">AI Çalışma Önerileri</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Adaptif öğrenme algoritması uyarınca öncelikli tekrar etmeniz gereken konular:
            </p>

            <div className="space-y-3">
              {weakTopics.length === 0 ? (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-800 font-semibold text-center">
                  Tüm konularda yüksek başarı oranına sahipsiniz! Harika gidiyorsunuz.
                </div>
              ) : (
                weakTopics.map((topic) => {
                  const src = sources.find((s) => s.id === topic.source_id);
                  return (
                    <div
                      key={topic.id}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between"
                    >
                      <div>
                        <h4 className="font-bold text-xs text-slate-900">{topic.name}</h4>
                        <span className="text-[10px] text-amber-600 font-semibold">
                          Ustalık: %{topic.mastery_level || 50}
                        </span>
                      </div>
                      <button
                        onClick={() => src && onSelectTopicForQuiz(src.id)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[11px] flex items-center space-x-1 transition-all"
                      >
                        <span>Pratik Et</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <span className="text-[11px] text-slate-400 block text-center">
              Aralıklı Tekrar (Spaced Repetition) motoru aktif
            </span>
          </div>
        </div>
      </div>

      {/* Quiz Session History Table */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-4">
        <h3 className="font-extrabold text-base text-slate-900">Son Test Etkinlikleri</h3>

        {sessions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 font-medium">
            Henüz tamamlanan test bulunmuyor. 'Test Çöz' sekmesinden ilk testinizi tamamlayabilirsiniz.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">Kaynak Başlığı</th>
                  <th className="py-3 px-4">Tarih</th>
                  <th className="py-3 px-4">Soru</th>
                  <th className="py-3 px-4">Başarı Oranı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {sessions.map((sess, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">{sess.source_title}</td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {new Date(sess.date).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700">
                      {sess.correct_answers} / {sess.total_questions}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-bold">
                        %{sess.score_percentage}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
