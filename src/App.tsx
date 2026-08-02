import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { IngestTab } from './components/IngestTab';
import { SourcesTab } from './components/SourcesTab';
import { QuizTab } from './components/QuizTab';
import { DashboardTab } from './components/DashboardTab';
import { ApiKeyModal } from './components/ApiKeyModal';
import { AuthModal } from './components/AuthModal';

function MainAppContent() {
  const [activeTab, setActiveTab] = useState<'ingest' | 'sources' | 'quiz' | 'dashboard'>('ingest');
  const [targetSourceIdForQuiz, setTargetSourceIdForQuiz] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('menba_gemini_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
  });

  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('menba_gemini_key', key);
  };

  const handleNavigateToQuizWithSource = (sourceId: string) => {
    setTargetSourceIdForQuiz(sourceId);
    setActiveTab('quiz');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col pb-16 md:pb-0">
      {/* Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAuth={() => setIsAuthOpen(true)}
        hasApiKey={Boolean(apiKey)}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'ingest' && (
          <IngestTab
            onSourceCreated={(id) => setTargetSourceIdForQuiz(id)}
            onNavigateToQuiz={() => setActiveTab('quiz')}
          />
        )}

        {activeTab === 'sources' && (
          <SourcesTab
            onSelectSourceForQuiz={(id) => handleNavigateToQuizWithSource(id)}
          />
        )}

        {activeTab === 'quiz' && (
          <QuizTab
            initialSourceId={targetSourceIdForQuiz}
            onFinishQuizToDashboard={() => setActiveTab('dashboard')}
          />
        )}

        {activeTab === 'dashboard' && (
          <DashboardTab
            onSelectTopicForQuiz={(sourceId) => handleNavigateToQuizWithSource(sourceId)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-6 text-center text-xs border-t border-slate-800">
        <p>MENBA AI v2.5 — Akıllı Kaynak İşleme ve Adaptif Soru Bankası Platformu</p>
      </footer>

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={apiKey}
        onSaveApiKey={handleSaveApiKey}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}

export default App;
