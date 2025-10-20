/**
 * Author: Jayson Brenton + The Brainy One
 * Date: 2025-10-20
 * Purpose: Keep dashboard call-to-actions aligned with typed navigation routes.
 * License: MIT
 */

import Link from 'next/link';
import type { Metadata } from 'next';
import type { Route } from 'next';

import { requireAuthenticatedUser } from '@/lib/auth/serverSession';
import { ROUTE_HOME } from '@/app/routes';

import styles from './page.module.css';

const PAGE_TITLE = 'Telemetry dashboard';
const PAGE_DESCRIPTION =
  'Review your latest race imports, jump into lap analysis, or kick off a new telemetry import.';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
};

export default async function DashboardPage() {
  const { user } = await requireAuthenticatedUser();
  const importRoute: Route = ('/import') as Route; // safe: import wizard root

  return (
    <section className={styles.container} aria-labelledby="dashboard-heading">
      <header className={styles.header}>
        <h1 className={styles.title} id="dashboard-heading">
          Welcome back to your telemetry hub {user.driverName}
        </h1>
        <p className={styles.description}>{PAGE_DESCRIPTION}</p>
        <div className={styles.actions}>
          <Link className={styles.primaryLink} href={importRoute}>
            Start a new import
          </Link>
          <Link className={styles.secondaryLink} href={ROUTE_HOME}>
            View marketing site
          </Link>
        </div>
      </header>
      <div className={styles.sectionGrid}>
        <article className={styles.card}>
          <h2 className={styles.cardTitle}>Recent activity</h2>
          <p className={styles.cardDescription}>
            We will surface your latest imports, lap comparisons, and verification tasks here as the
            telemetry pipeline comes online.
          </p>
        </article>
        <article className={styles.card}>
          <h2 className={styles.cardTitle}>Next steps</h2>
          <p className={styles.cardDescription}>
            Kick off a LiveRC import to populate the dashboard or explore the importer wizard to
            validate session data before sharing it with your team.
          </p>
        </article>
      </div>
    </section>
  );
}
