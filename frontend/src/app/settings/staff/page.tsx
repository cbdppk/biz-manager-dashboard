'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useToast } from '@/hooks/useToast';

interface StaffMember {
  id: string;
  email: string;
  role: 'owner' | 'manager' | 'cashier';
  is_active: boolean;
}

const AVATAR_COLORS = ['#064e3b', '#1e3a5f', '#4c1d95', '#7c2d12', '#134e4a', '#1e1b4b'];

function avatarColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash += str.charCodeAt(i);
  return AVATAR_COLORS[hash % 6];
}

function initials(email: string): string {
  const local = email.split('@')[0];
  const parts = local.split(/[._-]+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  owner:   { bg: 'rgba(124,58,237,0.15)',  color: '#a78bfa' },
  manager: { bg: 'rgba(59,130,246,0.15)',  color: '#60a5fa' },
  cashier: { bg: 'rgba(16,185,129,0.15)', color: '#34d399' },
};

function RolePill({ role }: { role: string }) {
  const c = ROLE_COLORS[role] ?? { bg: 'rgba(100,116,139,0.2)', color: '#94a3b8' };
  return (
    <span style={{
      fontSize: 12, fontWeight: 700,
      background: c.bg,
      color: c.color,
      borderRadius: 999,
      padding: '3px 10px',
      textTransform: 'capitalize',
    }}>
      {role}
    </span>
  );
}

/* ── Bottom sheet wrapper ─────────────────────────────────── */
function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  /* Lock body scroll when open */
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.65)',
          zIndex: 400,
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          animation: 'fadeIn 200ms ease',
        }}
      />
      {/* Sheet */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderBottom: 'none',
          borderRadius: '24px 24px 0 0',
          zIndex: 401,
          padding: '0 0 calc(32px + env(safe-area-inset-bottom))',
          animation: 'slideUp 300ms cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '85dvh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Handle */}
        <div style={{
          width: 44, height: 4, background: 'var(--border-strong)',
          borderRadius: 2, margin: '14px auto 0',
        }} />
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 0',
        }}>
          <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</p>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-elevated)', border: 'none',
              width: 32, height: 32, borderRadius: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-secondary)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {/* Content */}
        <div style={{ padding: '20px 20px 0' }}>
          {children}
        </div>
      </div>
    </>
  );
}

/* ── Field wrapper ─────────────────────────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700,
        color: 'var(--text-muted)', marginBottom: 7,
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCss: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1.5px solid var(--border-strong)',
  borderRadius: 12,
  padding: '13px 16px',
  color: 'var(--text-primary)',
  fontSize: 15,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  WebkitAppearance: 'none',
  appearance: 'none',
};

export default function StaffPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* Edit sheet */
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null);
  const [editRole, setEditRole] = useState<'manager' | 'cashier'>('cashier');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  /* Invite sheet */
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'manager' | 'cashier'>('cashier');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteFieldError, setInviteFieldError] = useState('');

  useEffect(() => {
    api.get('/settings/staff')
      .then(r => setStaff(Array.isArray(r.data) ? r.data : r.data?.staff ?? []))
      .catch(() => {
        setError('Failed to load staff.');
        showToast('Failed to load staff.', 'error');
      })
      .finally(() => setLoading(false));
  }, [showToast]);

  function openEdit(member: StaffMember) {
    if (member.role === 'owner') return;
    setEditTarget(member);
    setEditRole(member.role as 'manager' | 'cashier');
    setEditError('');
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    setEditLoading(true);
    setEditError('');
    try {
      const { data } = await api.patch(`/settings/staff/${editTarget.id}`, { role: editRole });
      setStaff(prev => prev.map(s => s.id === data.id ? { ...s, role: data.role } : s));
      setEditTarget(null);
      showToast('Staff role updated.', 'success');
    } catch (err: any) {
      const message = err?.response?.data?.error || 'Failed to update role.';
      setEditError(message);
      showToast(message, 'error');
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeactivate() {
    if (!editTarget) return;
    setEditLoading(true);
    setEditError('');
    try {
      const { data } = await api.patch(`/settings/staff/${editTarget.id}`, { is_active: false });
      setStaff(prev => prev.map(s => s.id === data.id ? { ...s, is_active: false } : s));
      setEditTarget(null);
      showToast('Staff account deactivated.', 'success');
    } catch (err: any) {
      const message = err?.response?.data?.error || 'Failed to deactivate.';
      setEditError(message);
      showToast(message, 'error');
    } finally {
      setEditLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    if (!normalizedEmail) {
      setInviteFieldError('Email is required.');
      return;
    }
    if (!emailIsValid) {
      setInviteFieldError('Enter a valid email address.');
      return;
    }

    setInviteLoading(true);
    setInviteError('');
    setInviteFieldError('');
    setInviteMsg('');
    try {
      const inviteRes = await api.post('/auth/invite', { email: normalizedEmail, role: inviteRole });
      setInviteMsg(inviteRes.data?.message || `Invite sent to ${normalizedEmail}`);
      setInviteEmail('');
      const { data } = await api.get('/settings/staff');
      setStaff(Array.isArray(data) ? data : data?.staff ?? []);
      showToast('Invite email sent.', 'success');
    } catch (err: any) {
      const message = err?.response?.data?.error || 'Failed to send invite.';
      setInviteError(message);
      showToast(message, 'error');
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <>
    <main className="page page-content">
        <div className="page-toolbar" style={{ justifyContent: 'space-between', marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => router.back()}
              style={{ background: 'var(--bg-elevated)', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', borderRadius: 10, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Staff</h1>
          </div>
          <button
            onClick={() => { setShowInvite(true); setInviteMsg(''); setInviteError(''); setInviteFieldError(''); setInviteEmail(''); }}
            className="btn btn-primary btn-nowrap"
            style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Invite
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="skeleton" style={{ height: 72, borderRadius: 16 }} />
              ))}
            </div>
          ) : error ? (
            <div style={{
              background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 14, padding: '16px 18px', color: 'var(--danger-text)',
              fontSize: 14, textAlign: 'center',
            }}>
              {error}
            </div>
          ) : staff.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)', fontSize: 15 }}>
              No staff yet. Invite someone to get started.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {staff.map((member) => (
                <div
                  key={member.id}
                  className="row-card"
                  onClick={() => openEdit(member)}
                  style={{ cursor: member.role === 'owner' ? 'default' : 'pointer' }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: avatarColor(member.email),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0,
                  }}>
                    {initials(member.email)}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      marginBottom: 5,
                    }}>
                      {member.email}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <RolePill role={member.role} />
                      <span style={{
                        fontSize: 12, fontWeight: 600,
                        color: member.is_active ? 'var(--accent)' : 'var(--danger)',
                      }}>
                        {member.is_active ? '● Active' : '● Inactive'}
                      </span>
                    </div>
                  </div>

                  {/* Chevron */}
                  {member.role !== 'owner' && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
    </main>

      {/* ── Edit Sheet ── */}
      <Sheet
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Staff Member"
      >
        {editTarget && (
          <>
            {/* Staff info */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px',
              background: 'var(--bg-elevated)',
              borderRadius: 12, marginBottom: 20,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: avatarColor(editTarget.email),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0,
              }}>
                {initials(editTarget.email)}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {editTarget.email}
                </p>
                <RolePill role={editTarget.role} />
              </div>
            </div>

            {editError && (
              <div style={{
                background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 10, padding: '11px 14px', color: 'var(--danger-text)',
                fontSize: 13, marginBottom: 14,
              }}>
                {editError}
              </div>
            )}

            <Field label="Change Role">
              <select
                value={editRole}
                onChange={e => setEditRole(e.target.value as 'manager' | 'cashier')}
                style={inputCss}
              >
                <option value="manager">Manager — full access except billing</option>
                <option value="cashier">Cashier — POS + products only</option>
              </select>
            </Field>

            <button
              onClick={handleSaveEdit}
              disabled={editLoading}
              className="btn btn-primary btn-block"
              style={{ marginBottom: 10 }}
            >
              {editLoading ? 'Saving…' : 'Save Role'}
            </button>

            {editTarget.is_active && (
              <button
                onClick={handleDeactivate}
                disabled={editLoading}
                className="btn btn-danger btn-block"
              >
                Deactivate Account
              </button>
            )}
          </>
        )}
      </Sheet>

      {/* ── Invite Sheet ── */}
      <Sheet
        open={showInvite}
        onClose={() => setShowInvite(false)}
        title="Invite Staff Member"
      >
        {inviteMsg ? (
          <div style={{
            background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)',
            borderRadius: 14, padding: '20px', color: 'var(--accent)',
            fontSize: 15, fontWeight: 600, textAlign: 'center', lineHeight: 1.6,
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
            {inviteMsg}
            <p style={{ margin: '12px 0 0', color: 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>
              The temporary password was emailed via Resend. They must change it after first sign-in.
            </p>
            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => { setInviteMsg(''); setShowInvite(false); }}
                style={{
                  background: 'var(--grad-accent)', color: '#fff', border: 'none',
                  borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column' }}>
            {inviteError && (
              <div style={{
                background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 10, padding: '11px 14px', color: 'var(--danger-text)',
                fontSize: 13, marginBottom: 14,
              }}>
                {inviteError}
              </div>
            )}

            <Field label="Email Address">
              <input
                type="email"
                required
                placeholder="staff@example.com"
                value={inviteEmail}
                onChange={e => {
                  setInviteEmail(e.target.value);
                  if (inviteFieldError) setInviteFieldError('');
                }}
                style={inputCss}
                autoFocus
              />
              {inviteFieldError && (
                <p style={{ fontSize: 12, color: 'var(--danger)', margin: '6px 2px 0' }}>
                  {inviteFieldError}
                </p>
              )}
            </Field>

            <Field label="Role">
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as 'manager' | 'cashier')}
                style={inputCss}
              >
                <option value="manager">Manager — reports, invoices, and settings access</option>
                <option value="cashier">Cashier — POS + products only</option>
              </select>
            </Field>

            {/* Role info */}
            <div style={{
              background: 'var(--bg-elevated)', borderRadius: 12,
              padding: '12px 14px', marginBottom: 18, fontSize: 13,
              color: 'var(--text-secondary)', lineHeight: 1.6,
            }}>
              {inviteRole === 'manager'
                ? 'Managers can access reports, invoices, products, customers, and settings tools for day-to-day operations.'
                : 'Cashiers can use the POS, view products, and update stock only.'}
              <p style={{ margin: '10px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
                Invites require Resend email (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`). The temporary password is emailed only — never shown in the app.
              </p>
            </div>

            <button
              type="submit"
              disabled={inviteLoading}
              className="btn btn-primary btn-block"
            >
              {inviteLoading ? 'Sending…' : 'Send Invite'}
            </button>
          </form>
        )}
      </Sheet>
    </>
  );
}
