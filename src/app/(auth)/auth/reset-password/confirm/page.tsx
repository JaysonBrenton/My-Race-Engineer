import type { Metadata } from 'next';
import type { AppPageProps, ResolvedSearchParams } from '@/types/app-page-props';
import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { MissingAuthFormTokenSecretError, generateAuthFormToken } from '@/lib/auth/formTokens';
import { canonicalFor } from '@/lib/seo';

import { confirmPasswordResetAction } from './actions';

import styles from '../../auth.module.css';

type PageProps = AppPageProps;

const EMPTY_SEARCH_PARAMS: ResolvedSearchParams<PageProps> = {};

const PAGE_TITLE = 'Choose a new password';
const PAGE_DESCRIPTION =
  'Set a new password to regain access to telemetry dashboards and race insights.';

export function generateMetadata(): Metadata {
  const canonical = canonicalFor('/auth/reset-password/confirm');

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
      card: 'summary',
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
    },
  };
}

type StatusTone = 'info' | 'error';

type StatusMessage = {
  tone: StatusTone;
  message: string;
};

const getParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value ?? undefined;
};

const buildStatusMessage = (errorCode: string | undefined, hasToken: boolean): StatusMessage => {
  if (!hasToken) {
    return {
      tone: 'error',
      message:
        'This password reset link is invalid or has expired. Request a new email to continue.',
    };
  }

  switch (errorCode) {
    case 'invalid-origin':
      return {
        tone: 'error',
        message:
          'Password reset submissions from this origin are blocked. Update ALLOWED_ORIGINS and try again.',
      };
    case 'invalid-token':
      return {
        tone: 'error',
        message: 'Your session expired. Refresh the page and submit the form again.',
      };
    case 'validation':
      return {
        tone: 'error',
        message: 'Check the highlighted fields and try again.',
      };
    case 'weak-password':
      return {
        tone: 'error',
        message:
          'Choose a stronger password that includes at least 12 characters, numbers, symbols, and mixed case letters.',
      };
    case 'rate-limited':
      return {
        tone: 'error',
        message: 'Too many reset attempts. Wait a few minutes before trying again.',
      };
    case 'server-error':
      return {
        tone: 'error',
        message: 'We were unable to confirm the reset. Please try again shortly.',
      };
    default:
      return {
        tone: 'info',
        message: 'Enter a new password to finish resetting your account.',
      };
  }
};

const getStatusClassName = (tone: StatusTone) =>
  tone === 'error'
    ? `${styles.statusRegion} ${styles.statusError}`
    : `${styles.statusRegion} ${styles.statusInfo}`;

const buildConfigurationStatus = (): StatusMessage => ({
  tone: 'error',
  message:
    'Password reset confirmations are temporarily unavailable due to a server configuration issue. Please contact your administrator.',
});

export default async function Page({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? EMPTY_SEARCH_PARAMS;
  noStore();
  const resetToken = getParam(sp.token);
  const errorCode = getParam(sp.error);
  let formToken: string | null = null;
  let configurationStatus: StatusMessage | null = null;

  try {
    formToken = generateAuthFormToken('password-reset-confirm');
  } catch (error) {
    if (error instanceof MissingAuthFormTokenSecretError) {
      configurationStatus = buildConfigurationStatus();
    } else {
      throw error;
    }
  }

  const status = configurationStatus ?? buildStatusMessage(errorCode, Boolean(resetToken));
  const statusClassName = getStatusClassName(status.tone);
  const isFormDisabled = !formToken || !resetToken;

  return (
    <section className={styles.wrapper} aria-labelledby="auth-reset-confirm-heading">
      <article className={styles.card}>
        <header className={styles.cardHeader}>
          <h1 className={styles.title} id="auth-reset-confirm-heading">
            Choose a new password
          </h1>
          <p className={styles.description}>
            Set a new password to regain access to telemetry dashboards and race insights.
          </p>
        </header>
        <form
          className={styles.form}
          method="post"
          action={confirmPasswordResetAction}
          aria-describedby="auth-reset-confirm-status"
        >
          {formToken ? <input type="hidden" name="formToken" value={formToken} /> : null}
          {resetToken ? <input type="hidden" name="token" value={resetToken} /> : null}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="auth-reset-confirm-password">
              New password
            </label>
            <input
              id="auth-reset-confirm-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              aria-required="true"
              className={styles.input}
              aria-describedby="auth-reset-confirm-password-help auth-reset-confirm-status"
              disabled={isFormDisabled}
            />
            <p className={styles.helpText} id="auth-reset-confirm-password-help">
              {`Use at least 12 characters with numbers, symbols, and both uppercase and lowercase letters.`}
            </p>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="auth-reset-confirm-password-repeat">
              Confirm new password
            </label>
            <input
              id="auth-reset-confirm-password-repeat"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              aria-required="true"
              className={styles.input}
              aria-describedby="auth-reset-confirm-password-repeat-help auth-reset-confirm-status"
              disabled={isFormDisabled}
            />
            <p className={styles.helpText} id="auth-reset-confirm-password-repeat-help">
              Re-enter the password so we can verify it matches.
            </p>
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.primaryButton} disabled={isFormDisabled}>
              Update password
            </button>
            <Link className={styles.secondaryLink} href="/auth/reset-password">
              Request a new link
            </Link>
          </div>
          <p
            className={statusClassName}
            id="auth-reset-confirm-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {status.message}
          </p>
        </form>
      </article>
    </section>
  );
}
