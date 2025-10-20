import type { Metadata } from 'next';

import type { AppPageProps, ResolvedSearchParams } from '@/types/app-page-props';
import { deleteAccount } from '@/app/actions/deleteAccount';
import { requireAuthenticatedUser } from '@/lib/auth/serverSession';

import { DeleteAccountForm } from './DeleteAccountForm';
import styles from './page.module.css';

const PAGE_TITLE = 'Account settings';
const PAGE_DESCRIPTION =
  'Review your profile details and manage access to your My Race Engineer account.';

export const metadata: Metadata = {
  title: `${PAGE_TITLE} · Settings`,
  description: PAGE_DESCRIPTION,
};

type PageProps = AppPageProps;

const EMPTY_SEARCH_PARAMS: ResolvedSearchParams<PageProps> = {};

const resolveParamValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

const buildStatusMessage = (errorCode: string | undefined): string | null => {
  if (errorCode === 'delete-failed') {
    return 'We were unable to delete your account. Please try again or contact support if the issue persists.';
  }

  return null;
};

export default async function AccountSettingsPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? EMPTY_SEARCH_PARAMS;
  const { user } = await requireAuthenticatedUser();
  const errorCode = resolveParamValue(sp.error);
  const statusMessage = buildStatusMessage(errorCode);

  return (
    <section className={styles.container} aria-labelledby="settings-account-heading">
      <header className={styles.header}>
        <p className={styles.breadcrumb}>
          Settings <span aria-hidden="true">›</span> Account
        </p>
        <h1 className={styles.title} id="settings-account-heading">
          {PAGE_TITLE}
        </h1>
        <p className={styles.description}>{PAGE_DESCRIPTION}</p>
        {statusMessage ? (
          <div className={styles.statusMessage} role="alert" aria-live="assertive">
            <p>{statusMessage}</p>
          </div>
        ) : null}
      </header>
      <div className={styles.grid}>
        <article className={styles.card} aria-labelledby="settings-account-profile">
          <h2 className={styles.cardTitle} id="settings-account-profile">
            Profile overview
          </h2>
          <dl className={styles.definitionList}>
            <div className={styles.definitionRow}>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div className={styles.definitionRow}>
              <dt>Driver name</dt>
              <dd>{user.driverName}</dd>
            </div>
            <div className={styles.definitionRow}>
              <dt>Status</dt>
              <dd className={styles.statusValue}>{user.status.replace('-', ' ')}</dd>
            </div>
          </dl>
        </article>
        <article className={styles.card} aria-labelledby="settings-account-delete">
          <h2 className={styles.cardTitle} id="settings-account-delete">
            Delete account
          </h2>
          <p className={styles.cardDescription}>
            Deleting your account immediately signs you out on every device and removes your
            telemetry history from My Race Engineer. This action cannot be undone.
          </p>
          <DeleteAccountForm deleteAccountAction={deleteAccount} />
        </article>
      </div>
    </section>
  );
}
