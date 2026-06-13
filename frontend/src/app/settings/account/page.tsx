'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { clearAuthToken } from '@/lib/auth';
import { useToast } from '@/hooks/useToast';

interface PasswordForm {
  current: string;
  next: string;
  confirm: string;
}

export default function AccountSettingsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [role, setRole] = useState('');
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [pwForm, setPwForm] = useState<PasswordForm>({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  useEffect(() => {
    api.get('/auth/me')
      .then((res) => {
        const nextRole = res.data?.user?.role ?? '';
        setRole(nextRole);
        setMustChangePassword(Boolean(res.data?.user?.must_change_password));
        if (nextRole !== 'cashier' && nextRole !== 'manager' && nextRole !== 'owner') {
          router.replace('/login');
        }
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (!pwForm.current || !pwForm.next || pwForm.next.length < 8) {
      setPwError('Enter your current password and a new password (8+ characters).');
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwError('New passwords do not match.');
      return;
    }

    setPwLoading(true);
    try {
      const res = await api.post('/auth/change-password', {
        current_password: pwForm.current,
        new_password: pwForm.next,
      });
      if (res.data?.token) {
        localStorage.setItem('bm_token', res.data.token);
      }
      setPwSuccess('Password updated.');
      setMustChangePassword(false);
      setPwForm({ current: '', next: '', confirm: '' });
      showToast('Password updated.', 'success');
    } catch (err: any) {
      setPwError(err?.response?.data?.error || 'Failed to change password.');
    } finally {
      setPwLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // still clear local session
    }
    clearAuthToken();
    router.push('/login');
  }

  return (
    <main className="page page-narrow">
      <div className="page-toolbar">
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex', color: 'var(--text-primary)' }}
          aria-label="Go back"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Account</h1>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
        {mustChangePassword
          ? 'You must set a new password before using the rest of the app.'
          : 'Update your password or sign out.'}
      </p>

      {mustChangePassword && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--warning)' }}>
          <p style={{ margin: 0, fontSize: 13 }}>Your account uses a temporary password. Choose a private password only you know.</p>
        </div>
      )}

      <form onSubmit={handleChangePassword} className="card form-stack" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Change password</h2>
        {pwError && <p className="field-error">{pwError}</p>}
        {pwSuccess && <p style={{ color: 'var(--accent)', fontSize: 13, margin: 0 }}>{pwSuccess}</p>}
        <div>
          <label className="input-label">Current password</label>
          <input
            type="password"
            className="input"
            value={pwForm.current}
            onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))}
            autoComplete="current-password"
          />
        </div>
        <div>
          <label className="input-label">New password</label>
          <input
            type="password"
            className="input"
            value={pwForm.next}
            onChange={(e) => setPwForm((p) => ({ ...p, next: e.target.value }))}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="input-label">Confirm new password</label>
          <input
            type="password"
            className="input"
            value={pwForm.confirm}
            onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
            autoComplete="new-password"
          />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={pwLoading}>
          {pwLoading ? 'Saving…' : 'Save password'}
        </button>
      </form>

      <div className="card" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link href="/settings/support" style={{ fontSize: 14, fontWeight: 600 }}>Help &amp; support</Link>
        <Link href="/settings/feedback" style={{ fontSize: 14, fontWeight: 600 }}>Send feedback</Link>
        {role === 'owner' || role === 'manager' ? (
          <Link href="/settings" style={{ fontSize: 14, fontWeight: 600 }}>Business settings</Link>
        ) : null}
      </div>

      <button type="button" className="btn btn-secondary btn-block" onClick={handleLogout}>
        Sign out
      </button>
    </main>
  );
}
