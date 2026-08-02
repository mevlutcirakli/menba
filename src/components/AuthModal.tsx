import React, { useState } from 'react';
import { X, LogIn, UserPlus, LogOut, User, ShieldCheck, Mail, Lock, Loader2, Sparkles } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { user, signInWithEmail, signUpWithEmail, signOut, signInAsGuest } = useAuthContext();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Lütfen e-posta ve şifrenizi girin.');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'login') {
        const res = await signInWithEmail(email, password);
        if (!res.success) {
          setErrorMessage(res.error || 'Giriş yapılamadı. Şifrenizi kontrol edin.');
        } else {
          setSuccessMessage('Başarıyla giriş yapıldı!');
          setTimeout(() => {
            onClose();
          }, 800);
        }
      } else {
        const res = await signUpWithEmail(email, password);
        if (!res.success) {
          setErrorMessage(res.error || 'Kayıt yapılamadı.');
        } else {
          setSuccessMessage('Hesabınız oluşturuldu ve giriş yapıldı!');
          setTimeout(() => {
            onClose();
          }, 800);
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    await signOut();
    setIsLoading(false);
    setSuccessMessage('Başarıyla çıkış yapıldı.');
    setTimeout(() => {
      setSuccessMessage(null);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* If user is already signed in (non-guest), show Profile & Sign Out info */}
        {user && !user.isGuest ? (
          <div className="space-y-6 text-center">
            <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto font-extrabold text-2xl border border-indigo-100">
              {user.name ? user.name[0].toUpperCase() : 'U'}
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Aktif Oturum Açık
              </span>
              <h3 className="text-xl font-extrabold text-slate-900 mt-2">{user.name}</h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{user.email}</p>
            </div>

            {successMessage && (
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold">
                {successMessage}
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 flex flex-col space-y-3">
              <button
                onClick={handleSignOut}
                disabled={isLoading}
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md shadow-rose-600/20 flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <LogOut className="w-4 h-4" />
                    <span>Çıkış Yap</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Sign In / Sign Up Form */
          <div className="space-y-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">
                  {mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Menba AI platformuna erişim sağlayın
                </p>
              </div>
            </div>

            {/* Mode Selector */}
            <div className="flex p-1 rounded-xl bg-slate-100 border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  mode === 'login' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Giriş Yap
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMessage(null);
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  mode === 'register' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Yeni Hesap Oluştur
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                {errorMessage}
              </div>
            )}

            {successMessage && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                {successMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  E-Posta Adresi
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ornek@domain.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Parola
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>{mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}</span>
                  </>
                )}
              </button>
            </form>

            <div className="pt-3 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={() => {
                  signInAsGuest();
                  onClose();
                }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
              >
                Misafir Öğrenci Olarak Devam Et →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
