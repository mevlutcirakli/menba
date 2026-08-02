import React from 'react';
import { BookOpen, PlusCircle, CheckSquare, BarChart3, Sparkles, Key, User, LogOut, LogIn } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';

interface NavbarProps {
  activeTab: 'ingest' | 'sources' | 'quiz' | 'dashboard';
  setActiveTab: (tab: 'ingest' | 'sources' | 'quiz' | 'dashboard') => void;
  onOpenSettings: () => void;
  onOpenAuth: () => void;
  hasApiKey: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenSettings,
  onOpenAuth,
  hasApiKey,
}) => {
  const { user, signOut } = useAuthContext();

  const tabs = [
    { id: 'ingest', label: 'Ekle / Analiz', icon: PlusCircle },
    { id: 'sources', label: 'Kaynaklar', icon: BookOpen },
    { id: 'quiz', label: 'Test Çöz', icon: CheckSquare },
    { id: 'dashboard', label: 'Analiz Paneli', icon: BarChart3 },
  ] as const;

  return (
    <>
      {/* Top Desktop/Mobile Header */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand Logo */}
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('ingest')}>
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-indigo-200">
                    MENBA
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    AI v2.5
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">Akıllı Kaynak & Soru Bankası Platformu</p>
              </div>
            </div>

            {/* Desktop Navigation Tabs */}
            <nav className="hidden md:flex items-center space-x-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Actions: Settings & User Profile / Sign Out */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              <button
                onClick={onOpenSettings}
                className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                  hasApiKey
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                }`}
                title="Gemini AI Ayarları"
              >
                <Key className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">
                  {hasApiKey ? 'Gemini AI' : 'API Ekle'}
                </span>
              </button>

              {/* User / Auth State & Sign Out */}
              {user && !user.isGuest ? (
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={onOpenAuth}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-200 text-xs font-semibold transition-all"
                  >
                    <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">
                      {user.name ? user.name[0].toUpperCase() : 'U'}
                    </div>
                    <span className="hidden sm:inline line-clamp-1 max-w-[100px]">
                      {user.name}
                    </span>
                  </button>

                  <button
                    onClick={() => signOut()}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center space-x-1 transition-all"
                    title="Çıkış Yap"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Çıkış</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={onOpenAuth}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Giriş Yap</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile App Style Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800/80 px-2 py-2 shadow-2xl flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
                isActive
                  ? 'text-indigo-400 font-extrabold bg-indigo-500/10'
                  : 'text-slate-400 font-medium hover:text-slate-200'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-indigo-400 scale-110' : 'text-slate-400'}`} />
              <span className="text-[10px] tracking-tight">{tab.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>
    </>
  );
};
