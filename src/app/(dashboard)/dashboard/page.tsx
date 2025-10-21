/**
 * Author: Jayson Brenton + The Brainy One
 * Date: 2025-10-20
 * Purpose: Keep dashboard call-to-actions aligned with typed navigation routes.
 * License: MIT
 */

import type { Metadata } from 'next';

import { requireAuthenticatedUser } from '@/lib/auth/serverSession';

import styles from './page.module.css';
import LiveRcQuickImport from './LiveRcQuickImport';

const PAGE_TITLE = 'Telemetry dashboard';
const PAGE_DESCRIPTION =
  'Review your latest race imports, jump into lap analysis, or kick off a new telemetry import.';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
};

export default async function DashboardPage() {
  const { user } = await requireAuthenticatedUser();

  return (
    <section className={styles.container} aria-labelledby="dashboard-heading">
      <header className={styles.header}>
        <h1 className={styles.title} id="dashboard-heading">
          Welcome back to your telemetry hub {user.driverName}
        </h1>
        <LiveRcQuickImport />
      </header>
    </section>
  );
}
