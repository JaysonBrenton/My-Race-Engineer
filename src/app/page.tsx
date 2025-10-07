import Link from 'next/link';
import type { Metadata } from 'next';
import Script from 'next/script';

import {
  buildOrganizationJsonLd,
  buildSiteNavigationJsonLd,
  buildWebsiteJsonLd,
  canonicalFor,
} from '@/lib/seo';
import styles from './page.module.css';

const PAGE_TITLE = 'My Race Engineer telemetry insights';
const PAGE_DESCRIPTION =
  'Baseline lap telemetry dashboards for racing teams.';

export function generateMetadata(): Metadata {
  const canonical = canonicalFor('/');

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
    },
    twitter: {
      card: 'summary_large_image',
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
    },
  };
}

export default function Home() {
  const canonical = canonicalFor('/');

  const structuredData = [
    buildOrganizationJsonLd({
      name: 'My Race Engineer',
      url: canonical,
    }),
    buildWebsiteJsonLd({
      name: 'My Race Engineer',
      url: canonical,
    }),
    ...buildSiteNavigationJsonLd([
      {
        name: 'Home',
        path: '/',
      },
      {
        name: 'Sign in',
        path: '/auth/login',
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
        <h1 className={styles.heroTitle}>My Race Engineer</h1>
        <p className={styles.heroDescription}>{PAGE_DESCRIPTION}</p>
        <div className={styles.heroActions}>
          <Link className={styles.heroCta} href="/auth/login">
            Sign in to your telemetry
          </Link>
        </div>
      </header>
    </section>
  );
}
