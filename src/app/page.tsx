import type { Metadata } from 'next';
import Script from 'next/script';

import { lapSummaryService } from '@/dependencies/server';
import {
  absUrl,
  buildOrganizationJsonLd,
  buildSiteNavigationJsonLd,
  buildWebsiteJsonLd,
  canonicalFor,
} from '@/lib/seo';

import { LapSummaryCard } from './components/LapSummaryCard';
import styles from './page.module.css';

const PAGE_TITLE = 'Pace Tracer telemetry insights';
const PAGE_DESCRIPTION =
  'Baseline lap telemetry dashboards for racing teams, powered by a clean architecture Next.js foundation.';

async function loadLapSummary() {
  return lapSummaryService.getSummaryForDriver('Baseline Driver');
}

export function generateMetadata(): Metadata {
  const canonical = canonicalFor('/');
  const ogImageUrl = absUrl('/opengraph-image');

  return {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    alternates: {
      canonical,
    },
    openGraph: {
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      url: canonical,
      type: 'website',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: 'Telemetry interface preview for The Pace Tracer.',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      images: [ogImageUrl],
    },
  };
}

export default async function Home() {
  const summary = await loadLapSummary();
  const canonical = canonicalFor('/');

  const structuredData = [
    buildOrganizationJsonLd({
      name: 'The Pace Tracer',
      url: canonical,
    }),
    buildWebsiteJsonLd({
      name: 'The Pace Tracer',
      url: canonical,
    }),
    ...buildSiteNavigationJsonLd([
      {
        name: 'Home',
        path: '/',
      },
    ]),
  ];

  return (
    <section className={styles.hero}>
      <Script
        id="pace-tracer-structured-data"
        strategy="beforeInteractive"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <header className={styles.heroHeader}>
        <h1 className={styles.heroTitle}>The Pace Tracer</h1>
        <p className={styles.heroDescription}>{PAGE_DESCRIPTION}</p>
      </header>
      <div className={styles.cards}>
        <LapSummaryCard summary={summary} />
      </div>
    </section>
  );
}
