import React, { useState } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  Monitor,
  Smartphone,
  LogIn,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { ApiError, login, type Session } from '../../api/client';

interface LoginPageProps {
  onLogin: (session: Session) => void | Promise<void>;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  // Phones open in Mobile Browser mode by default; desktops in Web Portal mode.
  const [loginSurface, setLoginSurface] = useState<'web' | 'mobile'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
      ? 'mobile'
      : 'web'
  );
  // Dev builds (with SEED_DEMO on the server) pre-fill the demo admin. Production never pre-fills credentials.
  const devPrefill = import.meta.env.DEV;
  const [username, setUsername] = useState(devPrefill ? 'abdul.rehman' : '');
  const [password, setPassword] = useState(devPrefill ? 'Admin@2026' : '');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErrorMessage(null);
    setBusy(true);
    try {
      // The server checks the password, account status and web/mobile sign-in rules.
      const session = await login(username.trim(), password, loginSurface);
      await onLogin(session);
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center p-4 text-[#0F172A]">
      <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-xl shadow-xs overflow-hidden">
        {/* Top Brand Header */}
        <div className="bg-[#1E3A5F] px-6 py-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">AuditGrid</h1>
                <p className="text-xs text-white/80">
                  Distribution &amp; Field Stock Audit Platform
                </p>
              </div>
            </div>
            <span className="font-mono text-[11px] bg-white/15 px-2.5 py-1 rounded">
              v2.4
            </span>
          </div>
        </div>

        {/* Sign In Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Surface Selector: Web Portal vs Mobile Browser */}
          <div>
            <label className="block text-xs font-bold text-[#475569] uppercase tracking-wider mb-2">
              Select Sign-In Mode
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#F1F5F9] rounded-lg border border-[#CBD5E1]">
              <button
                type="button"
                onClick={() => {
                  setLoginSurface('web');
                  setErrorMessage(null);
                }}
                className={`min-h-[44px] py-2 px-3 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  loginSurface === 'web'
                    ? 'bg-[#1E3A5F] text-white shadow-2xs'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                <Monitor className="w-4 h-4" />
                <span>Web Portal</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginSurface('mobile');
                  setErrorMessage(null);
                }}
                className={`min-h-[44px] py-2 px-3 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  loginSurface === 'mobile'
                    ? 'bg-[#1E3A5F] text-white shadow-2xs'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>Mobile Browser</span>
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-[#FEE2E2] border border-[#DC2626] text-xs text-[#991B1B] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Username Input */}
          <div>
            <label
              htmlFor="login-username"
              className="block text-xs font-bold text-[#0F172A] mb-1.5"
            >
              Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-username"
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full min-h-[44px] pl-9 pr-3 py-2.5 text-base sm:text-sm font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus-ring"
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-bold text-[#0F172A] mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full min-h-[44px] pl-9 pr-10 py-2.5 text-base sm:text-sm font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus-ring"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-[#475569] hover:text-[#0F172A] cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-[48px] disabled:opacity-60 py-2.5 px-4 bg-[#1E3A5F] hover:bg-[#1E3A5F]/90 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>
              {busy ? 'Signing in…' : `Sign In to ${loginSurface === 'web' ? 'Web Portal' : 'Mobile View'}`}
            </span>
          </button>
        </form>

      </div>
    </div>
  );
}
