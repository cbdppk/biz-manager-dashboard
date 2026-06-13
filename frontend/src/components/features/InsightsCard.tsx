'use client';

import { useEffect, useState, useCallback } from 'react';
import { aiAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { parseInsightBullets } from '@/lib/formatAiText';

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9.5 2.5L11 10l7.5 1.5L11 13l-1.5 7.5L8 13 .5 11.5 8 10z M18 1l.75 3.25L22 5l-3.25.75L18 9l-.75-3.25L14 5l3.25-.75z" />
    </svg>
  );
}

// Same cache key + TTL as AIAdvisor — both read/write the same entry
// so only ONE actual API call is ever made per 30-min window, regardless
// of which component mounts first.
const GREETING_CACHE_KEY = 'bm_ai_greeting';
const GREETING_TTL_MS = 30 * 60 * 1000;

export default function InsightsCard() {
  const { showToast } = useToast();
  const [title, setTitle] = useState<string | undefined>();
  const [bullets, setBullets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      // Check cache before firing a real API call
      try {
        const raw = sessionStorage.getItem(GREETING_CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as { ts: number; content: string };
          if (Date.now() - cached.ts < GREETING_TTL_MS) {
            const parsed = parseInsightBullets(cached.content, 3);
            setTitle(parsed.title);
            setBullets(parsed.bullets);
            setLoading(false);
            return;
          }
        }
      } catch { /* ignore */ }
      setLoading(true);
    }

    try {
      const res = await aiAPI.insights();
      const content: string = res.data?.message || res.data?.insight || '';
      // Write to shared cache so AIAdvisor also benefits
      sessionStorage.setItem(GREETING_CACHE_KEY, JSON.stringify({ ts: Date.now(), content }));
      const parsed = parseInsightBullets(content, 3);
      setTitle(parsed.title);
      setBullets(parsed.bullets);
    } catch {
      if (isRefresh) showToast('Could not refresh AI insights.', 'error');
      if (!isRefresh) setBullets([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const openAdvisor = () => window.dispatchEvent(new CustomEvent('open-ai-advisor'));

  return (
    <div style={{
      background: 'var(--grad-purple)',
      border: '1px solid var(--purple-dim)',
      borderRadius: 16,
      padding: 16,
      marginTop: 8,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Glow */}
      <div style={{
        position: 'absolute', top: -40, right: -20,
        width: 140, height: 140,
        background: 'radial-gradient(circle, var(--purple-dim) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'var(--purple-dim)',
          border: '1px solid rgba(167,139,250,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--purple)', flexShrink: 0,
        }}>
          <SparkleIcon />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1, color: 'var(--text-primary)' }}>
          AI Insights
        </span>
        <button
          onClick={() => load(true)}
          disabled={loading || refreshing}
          aria-label="Refresh insights"
          style={{
            background: 'none', border: 'none', cursor: loading || refreshing ? 'default' : 'pointer',
            padding: '6px', borderRadius: 8, display: 'flex', alignItems: 'center',
            color: 'var(--text-muted)',
            opacity: loading || refreshing ? 0.5 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{
              animation: refreshing ? 'spin 0.8s linear infinite' : undefined,
            }}
          >
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[75, 100, 60].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: 11, width: `${w}%` }} />
          ))}
        </div>
      ) : bullets.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          No insights available. Tap refresh to try again.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {title ? (
            <p style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--text-primary)',
              lineHeight: 1.4,
              letterSpacing: '-0.01em',
            }}>
              {title}
            </p>
          ) : null}
          {bullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: 'var(--purple)', flexShrink: 0, marginTop: 7,
              }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                {b}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer CTA */}
      {!loading && (
        <button
          onClick={openAdvisor}
          style={{
            marginTop: 14,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--purple)',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontFamily: 'inherit',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Ask AI Advisor
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      )}
    </div>
  );
}
