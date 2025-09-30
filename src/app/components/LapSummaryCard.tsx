import type { LapSummary } from '@core/domain';

export function LapSummaryCard({ summary }: { summary: LapSummary }) {
  return (
    <article
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: '1.5rem',
        padding: '1.5rem',
        background: 'rgba(255,255,255,0.02)',
        backdropFilter: 'blur(8px)',
        width: 'min(100%, 28rem)',
      }}
    >
      <header style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>{summary.driverName}</h2>
        <p style={{ margin: 0, color: 'var(--color-fg-muted)' }}>Lap overview</p>
      </header>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
        <div>
          <dt style={{ fontSize: '0.875rem', color: 'var(--color-fg-muted)' }}>Laps completed</dt>
          <dd style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>{summary.lapsCompleted}</dd>
        </div>
        <div>
          <dt style={{ fontSize: '0.875rem', color: 'var(--color-fg-muted)' }}>Best lap</dt>
          <dd style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>{summary.bestLapMs} ms</dd>
        </div>
        <div>
          <dt style={{ fontSize: '0.875rem', color: 'var(--color-fg-muted)' }}>Average lap</dt>
          <dd style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>{summary.averageLapMs} ms</dd>
        </div>
      </dl>
    </article>
  );
}
