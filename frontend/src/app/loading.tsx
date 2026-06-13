export default function Loading() {
  return (
    <main className="page page-content">
      <div className="page-header">
        <div style={{ height: 24, width: 140, borderRadius: 8, background: 'var(--bg-elevated)' }} />
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="card" style={{ height: 118, opacity: 0.72 }} />
        <div className="row-card" style={{ opacity: 0.48 }} />
        <div className="row-card" style={{ opacity: 0.38 }} />
        <div className="row-card" style={{ opacity: 0.28 }} />
      </div>
    </main>
  );
}
