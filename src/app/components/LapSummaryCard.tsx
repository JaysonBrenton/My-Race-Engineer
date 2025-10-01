import type { LapSummary } from '@core/domain';

import styles from './lap-summary-card.module.css';

export function LapSummaryCard({ summary }: { summary: LapSummary }) {
  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{summary.driverName}</h2>
        <p className={styles.cardSubtitle}>Lap overview</p>
      </header>
      <dl className={styles.statsGrid}>
        <div>
          <dt className={styles.statLabel}>Laps completed</dt>
          <dd className={styles.statValue}>{summary.lapsCompleted}</dd>
        </div>
        <div>
          <dt className={styles.statLabel}>Best lap</dt>
          <dd className={styles.statValue}>{summary.bestLapMs} ms</dd>
        </div>
        <div>
          <dt className={styles.statLabel}>Average lap</dt>
          <dd className={styles.statValue}>{summary.averageLapMs} ms</dd>
        </div>
      </dl>
    </article>
  );
}
