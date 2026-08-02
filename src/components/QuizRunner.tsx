import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, Clock, Sparkles, ArrowRight, RotateCcw, Award, Check, X, BookOpen, AlertCircle, Loader2 } from 'lucide-react';
import { Question, QuizAttempt, QuizSessionResult } from '../types';
import { storageService } from '../services/storageService';
import { explainWrongAnswer } from '../services/geminiService';

interface QuizRunnerProps {
  sourceTitle: string;
  sourceId: string;
  questions: Question[];
  onFinishQuiz: () => void;
  onExit: () => void;
}

export const QuizRunner: React.FC<QuizRunnerProps> = ({
  sourceTitle,
  sourceId,
  questions,
  onFinishQuiz,
  onExit,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [secondsSpent, setSecondsSpent] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  // AI Explanation state
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [isLoadingAiExp, setIsLoadingAiExp] = useState(false);

  const currentQuestion = questions[currentIndex];

  // Stopwatch timer
  useEffect(() => {
    if (isFinished) return;
    const timer = setInterval(() => {
      setSecondsSpent((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isFinished]);

  const handleSelectOption = (index: number) => {
    if (isAnswerSubmitted) return;
    setSelectedOption(index);
    setIsAnswerSubmitted(true);

    const isCorrect = index === currentQuestion.correct_option_index;
    const newAttempt: QuizAttempt = {
      question: currentQuestion,
      selected_option_index: index,
      is_correct: isCorrect,
      time_spent_seconds: 10,
    };

    setAttempts((prev) => [...prev, newAttempt]);
  };

  const handleFetchAiExplanation = async () => {
    if (selectedOption === null || !currentQuestion) return;
    setIsLoadingAiExp(true);
    try {
      const exp = await explainWrongAnswer(
        currentQuestion.question_text,
        currentQuestion.options[selectedOption],
        currentQuestion.options[currentQuestion.correct_option_index]
      );
      setAiExplanation(exp);
    } catch {
      setAiExplanation('Açıklama yüklenirken hata oluştu.');
    } finally {
      setIsLoadingAiExp(false);
    }
  };

  const handleNextQuestion = () => {
    setAiExplanation(null);
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsAnswerSubmitted(false);
    } else {
      // Quiz completed!
      setIsFinished(true);
      const correctCount = attempts.filter((a) => a.is_correct).length + (
        selectedOption === currentQuestion.correct_option_index ? 1 : 0
      );
      const totalCount = questions.length;
      const scorePct = Math.round((correctCount / totalCount) * 100);

      const result: QuizSessionResult = {
        source_id: sourceId,
        source_title: sourceTitle,
        total_questions: totalCount,
        correct_answers: correctCount,
        score_percentage: scorePct,
        time_taken_seconds: secondsSpent,
        attempts: [...attempts],
        date: new Date().toISOString(),
      };

      storageService.saveQuizSession(result);
    }
  };

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (isFinished) {
    const correctCount = attempts.filter((a) => a.is_correct).length;
    const scorePct = Math.round((correctCount / questions.length) * 100);

    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in py-6">
        <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-200 text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-inner">
            <Award className="w-10 h-10" />
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Test Tamamlandı</span>
            <h2 className="text-3xl font-extrabold text-slate-900 mt-1">{sourceTitle}</h2>
          </div>

          {/* Score Badge */}
          <div className="inline-flex flex-col items-center p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 text-white shadow-lg border border-indigo-800">
            <span className="text-4xl font-extrabold text-indigo-400">%{scorePct}</span>
            <span className="text-xs font-semibold text-slate-300 mt-1">Başarı Oranı</span>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="text-xl font-extrabold text-slate-900">{questions.length}</div>
              <div className="text-[11px] text-slate-500 font-medium">Toplam Soru</div>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
              <div className="text-xl font-extrabold text-emerald-700">{correctCount}</div>
              <div className="text-[11px] text-emerald-600 font-medium">Doğru Cevap</div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="text-xl font-extrabold text-slate-900">{formatTime(secondsSpent)}</div>
              <div className="text-[11px] text-slate-500 font-medium">Süre</div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => {
                setCurrentIndex(0);
                setSelectedOption(null);
                setIsAnswerSubmitted(false);
                setAttempts([]);
                setSecondsSpent(0);
                setIsFinished(false);
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 flex items-center justify-center space-x-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Yeniden Çöz</span>
            </button>
            <button
              onClick={onFinishQuiz}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/30 transition-all"
            >
              Analiz Paneline Git
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in pb-12">
      {/* Quiz Top Header */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Soru {currentIndex + 1} / {questions.length}
          </span>
          <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{sourceTitle}</h3>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
            <Clock className="w-3.5 h-3.5 text-indigo-600" />
            <span>{formatTime(secondsSpent)}</span>
          </div>

          <button
            onClick={onExit}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            title="Testten Çık"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-600 rounded-full transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Main Question Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="bg-white rounded-3xl p-6 sm:p-8 shadow-md border border-slate-200/90 space-y-6"
        >
          {/* Topic Badge */}
          {currentQuestion.topic_name && (
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100">
              {currentQuestion.topic_name}
            </span>
          )}

          {/* Question Text */}
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-snug">
            {currentQuestion.question_text}
          </h2>

          {/* Options */}
          <div className="space-y-3 pt-2">
            {currentQuestion.options.map((optionText, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrectOption = idx === currentQuestion.correct_option_index;

              let style = 'bg-slate-50 border-slate-200 hover:border-indigo-300 hover:bg-slate-100 text-slate-800';

              if (isAnswerSubmitted) {
                if (isCorrectOption) {
                  style = 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold shadow-sm';
                } else if (isSelected && !isCorrectOption) {
                  style = 'bg-rose-50 border-rose-400 text-rose-950 font-bold';
                } else {
                  style = 'bg-slate-50/50 border-slate-200 text-slate-400 opacity-60';
                }
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleSelectOption(idx)}
                  disabled={isAnswerSubmitted}
                  className={`w-full p-4 rounded-2xl border text-left text-sm font-semibold transition-all duration-200 flex items-center justify-between cursor-pointer ${style}`}
                >
                  <div className="flex items-center space-x-3">
                    <span className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200 flex items-center justify-center text-xs font-bold shrink-0">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="leading-relaxed">{optionText}</span>
                  </div>

                  {isAnswerSubmitted && isCorrectOption && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 ml-2" />
                  )}
                  {isAnswerSubmitted && isSelected && !isCorrectOption && (
                    <XCircle className="w-5 h-5 text-rose-600 shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Answer Breakdown & Explanation Panel */}
          {isAnswerSubmitted && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-5 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-950 flex items-center space-x-1.5">
                  <BookOpen className="w-4 h-4 text-indigo-600" />
                  <span>Çözüm & Açıklama</span>
                </span>

                <button
                  onClick={handleFetchAiExplanation}
                  disabled={isLoadingAiExp}
                  className="text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-white hover:bg-indigo-100 px-3 py-1 rounded-lg border border-indigo-200 shadow-sm flex items-center space-x-1 transition-all"
                >
                  {isLoadingAiExp ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                  <span>AI Derin Analiz İstedi</span>
                </button>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed">
                {currentQuestion.explanation || 'Doğru seçenek metindeki temel kavrama dayanmaktadır.'}
              </p>

              {aiExplanation && (
                <div className="p-3 rounded-xl bg-white border border-indigo-200 text-xs text-slate-800 leading-relaxed shadow-sm">
                  <span className="font-bold text-indigo-600 block mb-1">Gemini AI Koç Tespiti:</span>
                  {aiExplanation}
                </div>
              )}
            </motion.div>
          )}

          {/* Bottom Next Button */}
          {isAnswerSubmitted && (
            <div className="pt-2 flex justify-end">
              <button
                onClick={handleNextQuestion}
                className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 flex items-center space-x-2 transition-all cursor-pointer"
              >
                <span>{currentIndex + 1 === questions.length ? 'Sonuçları Gör' : 'Sonraki Soru'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
