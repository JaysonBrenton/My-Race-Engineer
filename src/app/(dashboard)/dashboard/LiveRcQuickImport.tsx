'use client';

import Link from 'next/link';
import type { Route } from 'next';

import styles from './LiveRcQuickImport.module.css';

type LiveRcQuickImportProps = {
  importRoute: Route;
  marketingRoute: Route;
};

export default function LiveRcQuickImport({ importRoute, marketingRoute }: LiveRcQuickImportProps) {
  return (
    <section className={styles.quickImport} aria-labelledby="quick-import-heading">
      <header className={styles.header}>
        <h2 className={styles.title} id="quick-import-heading">
          LiveRC quick import
        </h2>
        <p className={styles.description}>
          Sync your latest LiveRC session data in a few clicks. We will pull race metadata, heats, and lap times so you can dive
          straight into analysis.
        </p>
      </header>

      <div className={styles.content}>
        <ul className={styles.bullets} role="list">
          <li>Authenticate with LiveRC once — we securely store your API token.</li>
          <li>Choose the event you want to import or paste a broadcast link.</li>
          <li>Review lap data before sharing insights with your team.</li>
        </ul>

        <div className={styles.actions}>
          <Link href={importRoute} className={styles.primaryLink} prefetch>
            Start LiveRC import
          </Link>
          <Link href={marketingRoute} className={styles.secondaryLink} prefetch>
            Explore product updates
          </Link>
        </div>
      </div>
    </section>
  );
}
