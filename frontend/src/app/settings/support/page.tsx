'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api, { supportAPI } from '@/lib/api';

interface SupportRequest {
  id: string;
  type: string;
  area: string;
  message: string;
  contact?: string | null;
  status: string;
  created_at: string;
}

const SUPPORT_EMAIL = 'support@example.com';

const SUPPORT_CARDS = [
  {
    title: 'Payment / Billing help',
    type: 'Payment issue',
    details: 'Include your business name, email, plan, amount paid, and Paystack reference.',
  },
  {
    title: 'Setup help',
    type: 'Confusing flow',
    details: 'Tell us your business type and the setup step where you got stuck.',
  },
  {
    title: 'Bug report',
    type: 'Bug',
    details: 'Include the page, what you clicked, what you expected, and what happened instead.',
  },
  {
    title: 'Feature request',
    type: 'Feature request',
    details: 'Describe the business problem and how you currently handle it without BizManager.',
  },
  {
    title: 'Data / records issue',
    type: 'Data issue',
    details: 'Include affected product, customer, sale, invoice, or report details. Do not share passwords.',
  },
];

function formatDateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function requestPreview(message: string) {
  if (!message) return '—';
  return message.length > 110 ? `${message.slice(0, 110)}...` : message;
}

export default function SupportPage() {
  const router = useRouter();
  const [role, setRole] = useState('');
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [copyMessage, setCopyMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const me = await api.get('/auth/me');
        const nextRole = me.data?.user?.role || '';
        if (cancelled) return;
        setRole(nextRole);

        if (nextRole === 'owner' || nextRole === 'manager') {
          const res = await supportAPI.listFeedback({ limit: 5 });
          if (!cancelled) setRequests(res.data || []);
        }
      } catch {
        if (!cancelled) setRequests([]);
      } finally {
        if (!cancelled) setLoadingRequests(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  async function copyTemplate(cardTitle?: string) {
    const template = [
      `Support type: ${cardTitle || 'Support request'}`,
      'Business name:',
      'Login email:',
      'Page/area:',
      'What happened:',
      'Reference/order/sale ID if any:',
      'Best contact:',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(template);
      setCopyMessage('Support template copied.');
    } catch {
      setCopyMessage('Copy failed. You can still email support with the details shown here.');
    }
  }

  const canViewRequests = role === 'owner' || role === 'manager';

  return (
    <main className="page page-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button type="button" onClick={() => router.back()} className="btn btn-ghost" style={{ width: 40, minHeight: 40, padding: 0 }}>
          &lt;
        </button>
        <div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Help & Operations
          </p>
          <h1 style={{ margin: 0 }}>Support Center</h1>
        </div>
      </div>

      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Need help during beta?</p>
        <p style={{ margin: '6px 0 14px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Send clear details so support can diagnose billing, setup, bugs, records, or feature requests quickly. During beta we respond via email — include your business name and login email.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="btn btn-primary" style={{ textDecoration: 'none' }}>
            Email support
          </a>
          <button type="button" className="btn btn-secondary" onClick={() => copyTemplate()}>
            Copy support template
          </button>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          WhatsApp support not configured yet.
        </p>
        {copyMessage && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>{copyMessage}</p>
        )}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {SUPPORT_CARDS.map((card) => (
          <section key={card.title} className="card" style={{ padding: 14 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{card.title}</p>
            <p style={{ margin: '6px 0 12px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              {card.details}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link href={`/settings/feedback?type=${encodeURIComponent(card.type)}`} className="btn btn-secondary" style={{ textDecoration: 'none', minHeight: 36 }}>
                Send feedback
              </Link>
              <button type="button" className="btn btn-ghost" onClick={() => copyTemplate(card.title)} style={{ minHeight: 36 }}>
                Copy template
              </button>
            </div>
          </section>
        ))}
      </div>

      {canViewRequests && (
        <>
          <p className="section-label" style={{ marginTop: 20 }}>Recent support requests</p>
          <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loadingRequests ? (
              [1, 2, 3].map((item) => (
                <div key={item} className="row-card row-card--flush" style={{ minHeight: 72 }}>
                  <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 10 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: 12, width: '50%', borderRadius: 4, marginBottom: 8 }} />
                    <div className="skeleton" style={{ height: 10, width: '75%', borderRadius: 4 }} />
                  </div>
                </div>
              ))
            ) : requests.length === 0 ? (
              <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No support requests yet.
              </div>
            ) : requests.map((request) => (
              <div key={request.id} className="row-card row-card--flush" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>{request.type}</p>
                    <span className={request.status === 'reviewed' ? 'pill pill-green' : 'pill pill-warn'}>{request.status}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {request.area} - {requestPreview(request.message)}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                    {formatDateTime(request.created_at)} {request.contact ? `- ${request.contact}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
