'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { clearAuthToken } from '@/lib/auth';
import { useTheme } from '@/components/providers/ThemeProvider';
import { useToast } from '@/hooks/useToast';
import { resetOnboardingDismissal } from '@/lib/onboarding';

interface BusinessSettings {
  low_stock_alerts: boolean;
  daily_summary_sms: boolean;
  whatsapp_enabled: boolean;
}

interface PasswordForm {
  current: string;
  next: string;
  confirm: string;
}

/* ── Toggle switch ─────────────────────────────────────────── */
function Toggle({ checked, onChange, id }: { checked: boolean; onChange: () => void; id: string }) {
  return (
    <label htmlFor={id} style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0, cursor: 'pointer' }}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
      />
      <span style={{
        position: 'absolute', inset: 0, borderRadius: 999,
        background: checked ? 'var(--accent)' : 'var(--bg-elevated)',
        border: `1px solid ${checked ? 'transparent' : 'var(--border-strong)'}`,
        transition: 'background 200ms, border-color 200ms',
      }}>
        <span style={{
          position: 'absolute',
          top: 3, left: checked ? 22 : 3,
          width: 16, height: 16,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          transition: 'left 200ms var(--ease-spring)',
        }} />
      </span>
    </label>
  );
}

/* ── Setting row ─────────────────────────────────────────── */
function SettingRow({
  icon, label, subtitle, right, onClick, danger,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={onClick ? 'row-card row-card--flush' : ''}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px',
        background: 'var(--bg-card)',
        cursor: onClick ? 'pointer' : 'default',
        minHeight: subtitle ? 68 : 56,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: danger ? 'var(--danger-dim)' : 'var(--bg-elevated)',
        border: `1px solid ${danger ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: danger ? 'var(--danger)' : 'var(--text-secondary)',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: danger ? 'var(--danger)' : 'var(--text-primary)', margin: 0 }}>
          {label}
        </p>
        {subtitle && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, marginTop: 2 }}>{subtitle}</p>
        )}
      </div>
      {right ?? (
        onClick ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--border-strong)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        ) : null
      )}
    </div>
  );
}

/* ── Section ─────────────────────────────────────────────── */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '20px 2px 8px' }}>
        {label}
      </p>
      <div style={{ borderRadius: 'var(--card-radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        {children}
      </div>
    </div>
  );
}

function SectionDivider() {
  return <div style={{ height: 1, background: 'var(--border)', marginLeft: 64 }} />;
}

function SkeletonRow({ withSubtitle = true }: { withSubtitle?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 16px',
      background: 'var(--bg-card)',
      minHeight: withSubtitle ? 68 : 56,
    }}>
      <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="skeleton" style={{ height: 12, borderRadius: 4, width: '45%' }} />
        {withSubtitle && <div className="skeleton" style={{ height: 10, borderRadius: 4, width: '70%' }} />}
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <>
      <Section label="Business">
        <SkeletonRow />
        <SectionDivider />
        <SkeletonRow />
        <SectionDivider />
        <SkeletonRow />
      </Section>
      <Section label="Team">
        <SkeletonRow />
      </Section>
      <Section label="Preferences">
        <SkeletonRow />
        <SectionDivider />
        <SkeletonRow />
        <SectionDivider />
        <SkeletonRow />
      </Section>
      <Section label="Account">
        <SkeletonRow />
        <SectionDivider />
        <SkeletonRow withSubtitle={false} />
      </Section>
    </>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();

  const [settings, setSettings] = useState<BusinessSettings>({
    low_stock_alerts: true,
    daily_summary_sms: false,
    whatsapp_enabled: false,
  });
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [role, setRole] = useState<string>('');

  const [pwForm, setPwForm]     = useState<PasswordForm>({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError]   = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [showPwForm, setShowPwForm] = useState(false);
  const [pwFieldErrors, setPwFieldErrors] = useState<Partial<PasswordForm>>({});

  useEffect(() => {
    Promise.all([
      api.get('/auth/me').catch(() => null),
      api.get('/settings').catch(() => null),
    ]).then(([meRes, settingsRes]) => {
      const nextRole = meRes?.data?.user?.role ?? meRes?.data?.role ?? '';
      if (nextRole === 'cashier') {
        setRole(nextRole);
        router.replace('/settings/account');
        return;
      }

      if (settingsRes?.data) setSettings((p) => ({ ...p, ...settingsRes.data }));
      else if (meRes?.data?.settings) setSettings((p) => ({ ...p, ...meRes.data.settings }));
      const sc = meRes?.data?.staff_count ?? meRes?.data?.business?.staff_count ?? null;
      setStaffCount(sc);
      setRole(nextRole);
      if (!meRes && !settingsRes) {
        showToast('Failed to load settings.', 'error');
      }
    }).finally(() => setLoadingSettings(false));
  }, [router, showToast]);

  const isOwner = role === 'owner' || role === 'manager';

  async function toggleSetting(key: keyof BusinessSettings) {
    const prev = settings;
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    try {
      await api.patch('/settings', { [key]: updated[key] });
      showToast(updated[key] ? 'Setting enabled.' : 'Setting disabled.', 'success');
    } catch {
      setSettings(prev);
      showToast('Could not save that setting.', 'error');
    }
  }

  function updatePasswordField(key: keyof PasswordForm, value: string) {
    setPwForm((current) => ({ ...current, [key]: value }));
    setPwFieldErrors((current) => ({ ...current, [key]: undefined }));
    if (pwError) setPwError('');
  }

  function validatePasswordForm() {
    const nextErrors: Partial<PasswordForm> = {};
    if (!pwForm.current.trim()) nextErrors.current = 'Enter your current password.';
    if (!pwForm.next.trim()) nextErrors.next = 'Enter a new password.';
    else if (pwForm.next.length < 8) nextErrors.next = 'New password must be at least 8 characters.';
    if (!pwForm.confirm.trim()) nextErrors.confirm = 'Confirm your new password.';
    else if (pwForm.next !== pwForm.confirm) nextErrors.confirm = 'New passwords do not match.';
    return nextErrors;
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(''); setPwSuccess('');
    const nextErrors = validatePasswordForm();
    if (Object.keys(nextErrors).length > 0) {
      setPwFieldErrors(nextErrors);
      return;
    }

    setPwFieldErrors({});
    setPwLoading(true);
    try {
      const res = await api.post('/auth/change-password', { current_password: pwForm.current, new_password: pwForm.next });
      if (res.data?.token) {
        localStorage.setItem('bm_token', res.data.token);
      }
      setPwSuccess('Password updated successfully.');
      setPwForm({ current: '', next: '', confirm: '' });
      showToast('Password updated successfully.', 'success');
      setTimeout(() => setShowPwForm(false), 1500);
    } catch (err: any) {
      setPwError(err?.response?.data?.error || 'Failed to change password.');
      showToast(err?.response?.data?.error || 'Failed to change password.', 'error');
    } finally {
      setPwLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // still clear local session if network fails
    }
    clearAuthToken();
    router.push('/login');
  }

  function handleShowSetupChecklist() {
    resetOnboardingDismissal();
    showToast('Setup checklist is visible again.', 'success');
    router.push('/onboarding');
  }

  return (
    <main className="page page-content">
      {/* ── Header ────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px' }}>Settings</h1>
      </div>

      {loadingSettings ? <SettingsSkeleton /> : (
      <>
      {/* ── Business ──────────────────────────────────── */}
      <Section label="Business">
        <Link href="/settings/profile" style={{ textDecoration: 'none' }}>
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
            label="Business Profile"
            subtitle="Name, address, and branding"
            onClick={() => {}}
          />
        </Link>
        {isOwner && <SectionDivider />}
        {isOwner && (
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>}
            label="Setup Checklist"
            subtitle="Review or restart your setup guide"
            onClick={handleShowSetupChecklist}
          />
        )}
        {isOwner && <SectionDivider />}
        {isOwner && (
          <Link href="/expenses" style={{ textDecoration: 'none' }}>
            <SettingRow
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
              label="Expenses"
              subtitle="Track business costs and net profit"
              onClick={() => {}}
            />
          </Link>
        )}
        {isOwner && <SectionDivider />}
        {isOwner && (
          <Link href="/reports" style={{ textDecoration: 'none' }}>
            <SettingRow
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
              label="Business Reports"
              subtitle="Profit, expenses, and loan readiness"
              onClick={() => {}}
            />
          </Link>
        )}
        {isOwner && <SectionDivider />}
        {isOwner && (
          <Link href="/settings/subscription" style={{ textDecoration: 'none' }}>
            <SettingRow
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>}
              label="Subscription"
              subtitle="Manage your plan and billing"
              onClick={() => {}}
            />
          </Link>
        )}
        {isOwner && <SectionDivider />}
        {isOwner && (
          <Link href="/settings/whatsapp" style={{ textDecoration: 'none' }}>
            <SettingRow
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" /></svg>}
              label="WhatsApp Bot"
              subtitle={loadingSettings ? '…' : settings.whatsapp_enabled ? 'Active — staff commands enabled' : 'Inactive — tap to configure'}
              onClick={() => {}}
            />
          </Link>
        )}
      </Section>

      {/* ── Team (owner/manager only) ──────────────────── */}
      {isOwner && (
        <Section label="Team">
          <Link href="/settings/staff" style={{ textDecoration: 'none' }}>
            <SettingRow
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
              label="Staff Accounts"
              subtitle={staffCount != null ? `${staffCount} active member${staffCount !== 1 ? 's' : ''}` : '…'}
              onClick={() => {}}
            />
          </Link>
        </Section>
      )}

      {/* -- Help & Operations ------------------------------------- */}
      <Section label="Help & Operations">
        <Link href="/settings/support" style={{ textDecoration: 'none' }}>
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 2-3 4"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
            label="Support Center"
            subtitle="Billing, setup, bug, and records help"
            onClick={() => {}}
          />
        </Link>
        <SectionDivider />
        <Link href="/settings/feedback" style={{ textDecoration: 'none' }}>
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>}
            label="Send Feedback"
            subtitle="Report bugs or request beta improvements"
            onClick={() => {}}
          />
        </Link>
        {isOwner && (
          <>
            <SectionDivider />
            <Link href="/settings/audit" style={{ textDecoration: 'none' }}>
              <SettingRow
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>}
                label="Audit Logs"
                subtitle="Review important business changes"
                onClick={() => {}}
              />
            </Link>
          </>
        )}
      </Section>

      {/* ── Preferences ───────────────────────────────── */}
      <Section label="Preferences">
        <SettingRow
          icon={theme === 'dark'
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          }
          label="Appearance"
          subtitle={theme === 'dark' ? 'Dark mode' : 'Light mode'}
          right={<Toggle checked={theme === 'light'} onChange={toggleTheme} id="theme-toggle" />}
        />
        <SectionDivider />
        {isOwner && (
          <>
            <SettingRow
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
              label="Low Stock Alerts"
              subtitle="Get notified when products run low"
              right={<Toggle checked={settings.low_stock_alerts} onChange={() => toggleSetting('low_stock_alerts')} id="toggle-low-stock" />}
            />
            <SectionDivider />
            <SettingRow
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.43 2 2 0 0 1 3.6 1.25h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l1.02-.97a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16z"/></svg>}
              label="Daily Summary SMS"
              subtitle="Receive end-of-day sales report"
              right={<Toggle checked={settings.daily_summary_sms} onChange={() => toggleSetting('daily_summary_sms')} id="toggle-daily-sms" />}
            />
            <SectionDivider />
          </>
        )}
        <Link href="/notifications" style={{ textDecoration: 'none' }}>
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
            label="Notifications"
            subtitle="View all alerts and updates"
            onClick={() => {}}
          />
        </Link>
      </Section>

      {/* ── Account ───────────────────────────────────── */}
      <Section label="Account">
        <SettingRow
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
          label="Change Password"
          subtitle={showPwForm ? 'Fill in the form below' : 'Update your login password'}
          onClick={() => setShowPwForm(!showPwForm)}
          right={
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="var(--border-strong)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: showPwForm ? 'rotate(90deg)' : 'none', transition: 'transform 200ms' }}
            >
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          }
        />

        {showPwForm && (
          <div style={{ background: 'var(--bg-card)', padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
            {pwError && (
              <div style={{ background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 12px', margin: '12px 0', color: 'var(--danger)', fontSize: 13 }}>
                {pwError}
              </div>
            )}
            {pwSuccess && (
              <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)', borderRadius: 10, padding: '10px 12px', margin: '12px 0', color: 'var(--accent)', fontSize: 13 }}>
                {pwSuccess}
              </div>
            )}
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {[
                { key: 'current', placeholder: 'Current password' },
                { key: 'next',    placeholder: 'New password' },
                { key: 'confirm', placeholder: 'Confirm new password' },
              ].map(({ key, placeholder }) => (
                <div key={key}>
                  <input
                    type="password"
                    placeholder={placeholder}
                    value={pwForm[key as keyof PasswordForm]}
                    onChange={(e) => updatePasswordField(key as keyof PasswordForm, e.target.value)}
                    required
                    className="input"
                    style={{
                      fontSize: 14,
                      padding: '11px 14px',
                      borderColor: pwFieldErrors[key as keyof PasswordForm] ? 'var(--danger)' : undefined,
                    }}
                  />
                  {pwFieldErrors[key as keyof PasswordForm] && (
                    <p style={{ fontSize: 12, color: 'var(--danger)', margin: '6px 4px 0' }}>
                      {pwFieldErrors[key as keyof PasswordForm]}
                    </p>
                  )}
                </div>
              ))}
              <button
                type="submit"
                disabled={pwLoading}
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 4 }}
              >
                {pwLoading ? 'Saving…' : 'Update Password'}
              </button>
            </form>
          </div>
        )}

        <SectionDivider />

        <div
          onClick={handleLogout}
          className="row-card row-card--flush"
          style={{ padding: '14px 16px', minHeight: 56, gap: 12 }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--danger-dim)',
            border: '1px solid rgba(239,68,68,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--danger)', flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger)', flex: 1 }}>Log Out</span>
        </div>
      </Section>
      </>
      )}

      {/* ── Version ───────────────────────────────────── */}
      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 24, paddingBottom: 8 }}>
        BizManager v1.0 · Built for Ghanaian businesses
      </p>
    </main>
  );
}
