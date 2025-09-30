import { lapSummaryService } from '@/dependencies/server';
import { LapSummaryCard } from './components/LapSummaryCard';

async function loadLapSummary() {
  return lapSummaryService.getSummaryForDriver('Baseline Driver');
}

export default async function Home() {
  const summary = await loadLapSummary();

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '2rem', alignItems: 'center' }}>
      <header style={{ textAlign: 'center', maxWidth: '40rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>The Pace Tracer</h1>
        <p style={{ margin: 0, color: 'var(--color-fg-muted)' }}>
          A clean foundation for telemetry insights, built with Next.js, Prisma, and a layered architecture.
        </p>
      </header>
      <LapSummaryCard summary={summary} />
    </section>
  );
}
