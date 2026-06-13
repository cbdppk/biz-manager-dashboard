'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { aiAPI } from '@/lib/api';
import {
  type AiToolCall,
  describeToolCall,
  extractApiError,
  formatToolSuccess,
  getPendingToolCalls,
  mapApiToolCalls,
  notifyDataChanged,
  toolBusyLabel,
} from '@/lib/aiAdvisor';
import { stripMarkdown } from '@/lib/formatAiText';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: AiToolCall[];
  ts?: number;
}

/* ── Icons ───────────────────────────────────────────────────── */
function SparkleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M9.5 2.5L11 10l7.5 1.5L11 13l-1.5 7.5L8 13 .5 11.5 8 10z M18 1l.75 3.25L22 5l-3.25.75L18 9l-.75-3.25L14 5l3.25-.75z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '12px 16px' }}>
      {[0, 160, 320].map((d) => (
        <span
          key={d}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--text-muted)',
            display: 'block',
            animation: 'pulse-dot 1.2s ease-in-out infinite',
            animationDelay: `${d}ms`,
          }}
        />
      ))}
    </div>
  );
}

function ToolCallCard({
  toolCall,
  onApprove,
  onDismiss,
  busy = false,
  busyLabel = 'Working…',
}: {
  toolCall: AiToolCall;
  onApprove: (tc: AiToolCall) => void;
  onDismiss: (id: string) => void;
  busy?: boolean;
  busyLabel?: string;
}) {
  if (toolCall.dismissed || toolCall.approved) return null;

  return (
    <div style={{
      background: 'var(--warn-dim)',
      border: '1px solid rgba(245,158,11,0.25)',
      borderRadius: 12,
      padding: '12px 14px',
      marginTop: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: 'rgba(245,158,11,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--warn)',
        }}>
          <BoltIcon />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warn)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {toolCall.tool_name.replace(/_/g, ' ')}
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
        {describeToolCall(toolCall)}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => onApprove(toolCall)}
          disabled={busy}
          style={{
            background: 'var(--accent-dim)',
            color: 'var(--accent)',
            border: '1px solid var(--accent-glow)',
            borderRadius: 8,
            padding: '7px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? busyLabel : 'Allow'}
        </button>
        <button
          type="button"
          onClick={() => onDismiss(toolCall.id)}
          disabled={busy}
          style={{
            background: 'transparent',
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '7px 14px',
            fontSize: 13,
            fontWeight: 500,
            cursor: busy ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            opacity: busy ? 0.6 : 1,
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  onApprove,
  onDismiss,
  executingToolId,
}: {
  msg: Message;
  onApprove: (tc: AiToolCall) => void;
  onDismiss: (id: string) => void;
  executingToolId: string | null;
}) {
  const isUser = msg.role === 'user';
  const pendingTools = msg.tool_calls?.filter((tc) => !tc.approved && !tc.dismissed) || [];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      gap: 4,
    }}>
      {msg.content ? (
        <div
          className={isUser ? 'ai-msg-user' : 'ai-msg-assistant'}
          style={{
            maxWidth: '82%',
            padding: '11px 15px',
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {isUser ? msg.content : stripMarkdown(msg.content)}
        </div>
      ) : null}
      {pendingTools.map((tc) => (
        <div key={tc.id} style={{ maxWidth: '90%', width: '90%' }}>
          <ToolCallCard
            toolCall={tc}
            onApprove={onApprove}
            onDismiss={onDismiss}
            busy={executingToolId === tc.id}
            busyLabel={toolBusyLabel(tc.tool_name)}
          />
        </div>
      ))}
    </div>
  );
}

const SUGGESTIONS = [
  'How is my business doing today?',
  'What products should I restock?',
  'Which customers owe me credit?',
  'Create a customer for Demo Customer with phone 0000000000',
  'Restock Blue Band by 12 tubs',
  'Record a cash sale for 2 Blue Band at GHS 18 each',
  'Record GHS 50 credit payment from Sample Client',
];

const GREETING_CACHE_KEY = 'bm_ai_greeting';
const GREETING_TTL_MS = 30 * 60 * 1000;
const MAX_HISTORY = 8;

export default function AIAdvisor() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [input, setInput] = useState('');
  const [initDone, setInitDone] = useState(false);
  const [executingToolId, setExecutingToolId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const pendingActions = getPendingToolCalls(messages);

  useEffect(() => {
    async function init() {
      try {
        const raw = sessionStorage.getItem(GREETING_CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as { ts: number; content: string };
          if (Date.now() - cached.ts < GREETING_TTL_MS) {
            setMessages([{ role: 'assistant', content: cached.content, ts: cached.ts }]);
            setInitDone(true);
            return;
          }
        }
      } catch { /* ignore */ }

      try {
        const res = await aiAPI.insights();
        const content = res.data?.message || res.data?.insight || 'Hello! I\'m your AI advisor. Ask me anything about your business.';
        sessionStorage.setItem(GREETING_CACHE_KEY, JSON.stringify({ ts: Date.now(), content }));
        setMessages([{ role: 'assistant', content, ts: Date.now() }]);
        setHasNew(true);
      } catch {
        setMessages([{
          role: 'assistant',
          content: 'Hello! I\'m your AI business advisor. Ask me about sales, inventory, customers, invoices, and payments.',
          ts: Date.now(),
        }]);
      }
      setInitDone(true);
    }
    init();
  }, []);

  useEffect(() => {
    if (open) {
      setHasNew(false);
      setTimeout(() => inputRef.current?.focus(), 350);
    }
  }, [open]);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-ai-advisor', handler);
    return () => window.removeEventListener('open-ai-advisor', handler);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, executingToolId]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const markToolApproved = useCallback((toolId: string) => {
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        tool_calls: m.tool_calls?.map((tc) =>
          (tc.id === toolId ? { ...tc, approved: true } : tc)
        ),
      }))
    );
  }, []);

  const executeTool = useCallback(async (toolCall: AiToolCall) => {
    const { data } = await aiAPI.executeTool(toolCall.tool_name, toolCall.tool_input);
    if (data?.success === false) {
      throw new Error(data.error || 'Action failed.');
    }
    return data;
  }, []);

  const handleApprove = useCallback(async (toolCall: AiToolCall) => {
    if (executingToolId) return;
    setExecutingToolId(toolCall.id);
    try {
      const data = await executeTool(toolCall);
      markToolApproved(toolCall.id);
      notifyDataChanged();
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: formatToolSuccess(toolCall.tool_name, data?.result),
          ts: Date.now(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: extractApiError(err),
          ts: Date.now(),
        },
      ]);
    } finally {
      setExecutingToolId(null);
    }
  }, [executingToolId, executeTool, markToolApproved]);

  const handleApproveAll = useCallback(async () => {
    if (executingToolId || pendingActions.length === 0) return;
    const queue = [...pendingActions];
    const results: string[] = [];

    for (const toolCall of queue) {
      setExecutingToolId(toolCall.id);
      try {
        const data = await executeTool(toolCall);
        markToolApproved(toolCall.id);
        results.push(formatToolSuccess(toolCall.tool_name, data?.result));
      } catch (err) {
        results.push(extractApiError(err));
        break;
      }
    }

    if (results.some((r) => r.includes('recorded') || r.includes('created') || r.includes('updated') || r.includes('sent'))) {
      notifyDataChanged();
    }

    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: results.join('\n'), ts: Date.now() },
    ]);
    setExecutingToolId(null);
  }, [executingToolId, pendingActions, executeTool, markToolApproved]);

  const handleDismiss = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        tool_calls: m.tool_calls?.map((tc) =>
          (tc.id === id ? { ...tc, dismissed: true } : tc)
        ),
      }))
    );
  }, []);

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading || executingToolId) return;

    const userMsg: Message = { role: 'user', content: msg, ts: Date.now() };
    const history = messages
      .filter((m) => m.content)
      .slice(-MAX_HISTORY)
      .map(({ role, content }) => ({ role, content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await aiAPI.ask(msg, history);
      const data = res.data;
      const toolCalls = mapApiToolCalls(data.tool_calls);
      const assistantMsg: Message = {
        role: 'assistant',
        content:
          data.response
          || data.message
          || (toolCalls.length
            ? 'I prepared the action(s) below. Review each one and tap Allow to confirm.'
            : ''),
        ts: Date.now(),
        tool_calls: toolCalls.length ? toolCalls : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: extractApiError(err) || 'Sorry, I couldn\'t connect. Please try again.',
          ts: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, executingToolId]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const showSuggestions = messages.length <= 1 && !loading && initDone && !executingToolId;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI Advisor"
          style={{
            position: 'fixed',
            bottom: 'calc(var(--nav-height, 68px) + 14px + env(safe-area-inset-bottom))',
            right: 16,
            width: 54,
            height: 54,
            borderRadius: '50%',
            background: 'var(--grad-accent)',
            border: 'none',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-accent), var(--shadow-md)',
            zIndex: 50,
            transition: 'transform 150ms var(--ease-spring)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {hasNew && (
            <span style={{
              position: 'absolute',
              inset: -2,
              borderRadius: '50%',
              border: '2px solid var(--accent)',
              opacity: 0.4,
              animation: 'breathe 2s ease-in-out infinite',
            }} />
          )}
          <SparkleIcon size={22} />
        </button>
      )}

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 198,
            backdropFilter: 'blur(2px)',
            animation: 'fadeIn 200ms ease',
          }}
        />
      )}

      <div
        ref={panelRef}
        className="ai-panel"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 199,
          borderRadius: '22px 22px 0 0',
          height: '75dvh',
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateY(0)' : 'translateY(105%)',
          transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
          overflow: 'hidden',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div style={{ width: 40, height: 4, background: 'var(--border-strong)', borderRadius: 2, margin: '12px auto 0', flexShrink: 0 }} />

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'var(--accent-dim)',
              border: '1px solid var(--accent-glow)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--accent)',
            }}>
              <SparkleIcon size={16} />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>AI Advisor</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sales · stock · customers · invoices</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-secondary)',
            }}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {pendingActions.length > 1 && (
          <div style={{
            padding: '8px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            flexShrink: 0,
          }}>
            <button
              type="button"
              onClick={handleApproveAll}
              disabled={!!executingToolId}
              className="btn btn-primary"
              style={{ fontSize: 13, padding: '8px 14px' }}
            >
              {executingToolId ? 'Running actions…' : `Allow all (${pendingActions.length})`}
            </button>
          </div>
        )}

        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          {messages.map((msg, i) => (
            <MessageBubble
              key={`${msg.ts || i}-${i}`}
              msg={msg}
              onApprove={handleApprove}
              onDismiss={handleDismiss}
              executingToolId={executingToolId}
            />
          ))}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div className="ai-msg-assistant" style={{ padding: 0 }}>
                <TypingIndicator />
              </div>
            </div>
          )}

          {showSuggestions && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Try asking
              </p>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSend(s)}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div style={{
          flexShrink: 0,
          padding: '10px 12px 12px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
        }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask or command: record sale, restock, invoice…"
            disabled={!!executingToolId}
            style={{
              flex: 1,
              background: 'var(--bg-input)',
              border: '1.5px solid var(--border-strong)',
              borderRadius: 12,
              padding: '11px 14px',
              fontSize: 14,
              color: 'var(--text-primary)',
              outline: 'none',
              fontFamily: 'inherit',
              opacity: executingToolId ? 0.7 : 1,
            }}
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!input.trim() || loading || !!executingToolId}
            aria-label="Send"
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: input.trim() && !loading && !executingToolId ? 'var(--grad-accent)' : 'var(--bg-elevated)',
              border: 'none',
              color: input.trim() && !loading && !executingToolId ? '#fff' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: input.trim() && !loading && !executingToolId ? 'pointer' : 'not-allowed',
              flexShrink: 0,
            }}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </>
  );
}
