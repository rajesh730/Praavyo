'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { PasswordInput } from '@/components/ui/Input';

/** The teacher replaces the password their school gave or reset. */
export default function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const submit = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'The new passwords do not match.' });
      return;
    }
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const response = await fetch('/api/teacher/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Password could not be changed.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ type: 'success', text: 'Password changed. Use the new one next time you sign in with a password.' });
    } catch (reason) {
      setMessage({ type: 'error', text: reason.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="text-brand" aria-hidden />
        <h2 className="font-semibold text-ink">Change password</h2>
      </div>
      <p className="mt-1 text-xs text-muted">If your school reset your password, the current one is password@123.</p>

      <form onSubmit={submit} className="mt-3 space-y-3">
        <PasswordInput
          label="Current password" name="currentPassword" value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)} showPassword={show} onToggleShow={() => setShow((v) => !v)}
          required disabled={saving} autoComplete="current-password"
        />
        <PasswordInput
          label="New password" name="newPassword" value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)} showPassword={show}
          required minLength={8} disabled={saving} autoComplete="new-password"
        />
        <PasswordInput
          label="Confirm new password" name="confirmPassword" value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)} showPassword={show}
          required minLength={8} disabled={saving} autoComplete="new-password"
        />
        {message.text && (
          <p className={message.type === 'error' ? 'text-sm text-danger' : 'rounded-control bg-success-soft px-3 py-2 text-sm text-ink'}>{message.text}</p>
        )}
        <button type="submit" disabled={saving} className="btn btn-primary btn-sm w-full">
          {saving ? 'Saving...' : 'Change password'}
        </button>
      </form>
    </section>
  );
}
