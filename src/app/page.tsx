import type { Metadata } from 'next';
import Script from 'next/script';

import { defaultEntrantContext, lapSummaryService } from '@/dependencies/server';
import {
  absUrl,
  buildOrganizationJsonLd,
  buildSiteNavigationJsonLd,
  buildWebsiteJsonLd,
  canonicalFor,
} from '@/lib/seo';

import { LapSummaryCard } from './components/LapSummaryCard';
import styles from './page.module.css';

const PAGE_TITLE = 'My Race Engineer (MRE) telemetry insights';
const PAGE_DESCRIPTION =
  'Baseline lap telemetry dashboards for racing teams, powered by a clean architecture Next.js foundation.';

async function loadLapSummary() {
  return lapSummaryService.getSummaryForEntrant(defaultEntrantContext.entrant.id);
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
          alt: 'Telemetry interface preview for My Race Engineer (MRE).',
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
      name: 'My Race Engineer (MRE)',
      url: canonical,
    }),
    buildWebsiteJsonLd({
      name: 'My Race Engineer (MRE)',
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
        <h1 className={styles.heroTitle}>My Race Engineer (MRE)</h1>
        <p className={styles.heroDescription}>{PAGE_DESCRIPTION}</p>
      </header>
      <div className={styles.cards}>
        <LapSummaryCard summary={summary} />
      </div>
    </section>
  );
}
