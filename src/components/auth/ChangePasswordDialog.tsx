import React, { useState } from 'react';
import { X } from 'lucide-react';
import { api, ApiError } from '../../api/client';

/** Self-service password change. Other devices are signed out by the server when it succeeds. */
export function ChangePasswordDialog({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError('The new passwords do not match.');
    setBusy(true);
    try {
      await api('/api/auth/change-password', { method: 'POST', json: { currentPassword: current, newPassword: next } });
      onDone('Password changed. Other devices were signed out.');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full min-h-[44px] px-3 text-base sm:text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#1E3A5F]';
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Change password">
      <form onSubmit={submit} className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-xl p-5 space-y-3 text-[#0F172A]">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Change password</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        {error && <div role="alert" className="p-2.5 rounded-lg bg-[#FEE2E2] border border-[#DC2626] text-xs text-[#991B1B]">{error}</div>}
        <label className="block text-xs font-bold">Current password
          <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={`${field} mt-1`} />
        </label>
        <label className="block text-xs font-bold">New password
          <input type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className={`${field} mt-1`} />
        </label>
        <p className="text-[11px] text-[#475569]">At least 8 characters with an uppercase letter, a lowercase letter and a number.</p>
        <label className="block text-xs font-bold">Repeat new password
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${field} mt-1`} />
        </label>
        <button type="submit" disabled={busy} className="w-full min-h-[48px] rounded-lg bg-[#1E3A5F] text-white text-sm font-bold disabled:opacity-60 cursor-pointer">{busy ? 'Saving…' : 'Change password'}</button>
      </form>
    </div>
  );
}
