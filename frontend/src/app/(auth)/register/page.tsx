'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { setAuthToken } from '@/lib/auth';
import { API_BASE_URL } from '@/lib/api';
import { storeOperatingMode } from '@/lib/businessMode';

const SECTORS = [
  { value: 'retail',      label: 'Retail / Shop' },
  { value: 'pharmacy',    label: 'Pharmacy' },
  { value: 'spare_parts', label: 'Spare Parts' },
  { value: 'restaurant',  label: 'Restaurant / Food' },
  { value: 'service',     label: 'Service Business' },
  { value: 'other',       label: 'Other' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ businessName: '', ownerName: '', email: '', phone: '', password: '', sector: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const setupHint = form.sector === 'restaurant'
    ? 'Restaurant users get menu, kitchen, and Food POS setup after signup.'
    : 'Retail users get product, POS, customer, and report setup after signup.';

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      {
        setForm(prev => ({ ...prev, [field]: e.target.value }));
        setFieldErrors(prev => ({ ...prev, [field]: undefined }));
        if (error) setError('');
      };
  }

  function validateStepOne() {
    const nextErrors: Partial<Record<keyof typeof form, string>> = {};
    if (!form.businessName.trim()) nextErrors.businessName = 'Business name is required.';
    if (!form.ownerName.trim()) nextErrors.ownerName = 'Your name is required.';
    if (!form.sector) nextErrors.sector = 'Select your business type.';
    return nextErrors;
  }

  function validateStepTwo() {
    const nextErrors: Partial<Record<keyof typeof form, string>> = {};
    const normalizedEmail = form.email.trim();
    if (!normalizedEmail) nextErrors.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) nextErrors.email = 'Enter a valid email address.';
    if (!form.phone.trim()) nextErrors.phone = 'Phone number is required.';
    else if (form.phone.replace(/\D/g, '').length < 10) nextErrors.phone = 'Enter a valid phone number.';
    if (!form.password) nextErrors.password = 'Password is required.';
    else if (form.password.length < 8) nextErrors.password = 'Password must be at least 8 characters.';
    return nextErrors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step === 1) {
      const nextErrors = validateStepOne();
      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors);
        return;
      }
      setStep(2);
      return;
    }

    const nextErrors = validateStepTwo();
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setError('');
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/auth/register`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_name: form.businessName.trim(),
            owner_name: form.ownerName.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            password: form.password,
            sector: form.sector,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        const message = data.error || data.message || 'Registration failed.';
        setError(res.status === 429
          ? 'Signup is temporarily busy from this network. Please wait a few minutes and try again.'
          : message);
        return;
      }
      setAuthToken(data.token);
      if (form.businessName) localStorage.setItem('bm_biz_name', form.businessName);
      storeOperatingMode(form.sector === 'restaurant' ? 'food' : 'retail');
      router.push('/onboarding');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Back */}
        <button
          type="button"
          onClick={() => step === 2 ? setStep(1) : router.push('/')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: 'var(--text-muted)', background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 13, fontWeight: 500, marginBottom: 32,
            padding: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {step === 2 ? 'Back' : 'Home'}
        </button>

        {/* Logo + title */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg, #10b981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, boxShadow: 'var(--shadow-accent)',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 6 }}>
            {step === 1 ? 'Create your account' : 'Almost done!'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {step === 1 ? 'Set up your business in 2 quick steps.' : 'Add contact details, then we guide your first setup steps.'}
          </p>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {[1, 2].map((s) => (
            <div
              key={s}
              style={{
                height: 3, flex: 1, borderRadius: 2,
                background: s <= step ? 'var(--accent)' : 'var(--border)',
                transition: 'background 300ms ease',
              }}
            />
          ))}
        </div>

        {/* Form card */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 20, padding: '28px 24px',
          boxShadow: 'var(--shadow-md)',
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {step === 1 ? (
              <>
                {/* Business name */}
                <div>
                  <label htmlFor="businessName" className="input-label">Business Name</label>
                  <input
                    id="businessName" type="text" autoComplete="organization" required
                    value={form.businessName} onChange={set('businessName')}
                    placeholder="Accra Fresh Mart"
                    className="input"
                    style={{ borderColor: fieldErrors.businessName ? 'var(--danger)' : undefined }}
                  />
                  {fieldErrors.businessName && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{fieldErrors.businessName}</p>}
                </div>

                {/* Owner name */}
                <div>
                  <label htmlFor="ownerName" className="input-label">Your Name</label>
                  <input
                    id="ownerName" type="text" autoComplete="name" required
                    value={form.ownerName} onChange={set('ownerName')}
                    placeholder="Kwame Mensah"
                    className="input"
                    style={{ borderColor: fieldErrors.ownerName ? 'var(--danger)' : undefined }}
                  />
                  {fieldErrors.ownerName && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{fieldErrors.ownerName}</p>}
                </div>

                {/* Sector */}
                <div>
                  <label htmlFor="sector" className="input-label">Business Type</label>
                  <select
                    id="sector" required
                    value={form.sector} onChange={set('sector')}
                    className="input"
                    style={{
                      appearance: 'none',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%234a6080' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 14px center',
                      paddingRight: '2.5rem',
                      color: form.sector ? 'var(--text-primary)' : 'var(--text-muted)',
                      borderColor: fieldErrors.sector ? 'var(--danger)' : undefined,
                    }}
                  >
                    <option value="" disabled>Select type…</option>
                    {SECTORS.map((s) => (
                      <option key={s.value} value={s.value} style={{ color: '#f0f6ff', background: '#151e2d' }}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.sector && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{fieldErrors.sector}</p>}
                  <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
                    {setupHint}
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Email */}
                <div>
                  <label htmlFor="email" className="input-label">Email</label>
                  <input
                    id="email" type="email" autoComplete="email" required
                    value={form.email} onChange={set('email')}
                    placeholder="you@business.com"
                    className="input"
                    style={{ borderColor: fieldErrors.email ? 'var(--danger)' : undefined }}
                  />
                  {fieldErrors.email && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{fieldErrors.email}</p>}
                </div>

                {/* Phone */}
                <div>
                  <label htmlFor="phone" className="input-label">Phone (WhatsApp)</label>
                  <input
                    id="phone" type="tel" autoComplete="tel" required
                    value={form.phone} onChange={set('phone')}
                    placeholder="+233 20 000 0000"
                    className="input"
                    style={{ borderColor: fieldErrors.phone ? 'var(--danger)' : undefined }}
                  />
                  {fieldErrors.phone && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{fieldErrors.phone}</p>}
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Used for WhatsApp sales reports
                  </p>
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="input-label">Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password" required minLength={8}
                      value={form.password} onChange={set('password')}
                      placeholder="Min. 8 characters"
                      className="input"
                      style={{ paddingRight: 48, borderColor: fieldErrors.password ? 'var(--danger)' : undefined }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      tabIndex={-1}
                      style={{
                        position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', padding: 4, display: 'flex',
                      }}
                    >
                      {showPassword ? (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                  {fieldErrors.password && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{fieldErrors.password}</p>}
                </div>

                {/* Error */}
                {error && (
                  <div style={{
                    background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 10, padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    <span style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</span>
                  </div>
                )}
              </>
            )}

            <button
              type="submit" disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 4, fontSize: 15 }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin-slow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  Creating account…
                </>
              ) : step === 1 ? 'Continue →' : 'Create Account'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--text-secondary)' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
            Sign in
          </Link>
        </p>
      </div>
  );
}
