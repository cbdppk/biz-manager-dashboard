'use client';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const confirmBackground = tone === 'danger' ? '#ef4444' : 'var(--accent)';

  return (
    <>
      <div
        onClick={busy ? undefined : onCancel}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 180 }}
      />

      <div
        style={{
          position: 'fixed',
          insetInline: 0,
          bottom: 0,
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border)',
          borderRadius: '18px 18px 0 0',
          padding: '22px 18px calc(28px + env(safe-area-inset-bottom))',
          zIndex: 181,
        }}
      >
        <div style={{ width: 42, height: 4, borderRadius: 999, background: 'var(--border)', margin: '0 auto 18px' }} />
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>{title}</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 18 }}>{message}</p>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy} style={{ flex: 1 }}>
            {cancelLabel}
          </button>

          <button
            className="btn"
            onClick={onConfirm}
            disabled={busy}
            style={{
              flex: 1,
              background: confirmBackground,
              color: '#fff',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
