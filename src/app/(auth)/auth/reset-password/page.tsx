import type { Metadata } from 'next';
import type { AppPageProps, ResolvedSearchParams } from '@/types/app-page-props';
import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { MissingAuthFormTokenSecretError, generateAuthFormToken } from '@/lib/auth/formTokens';
import { canonicalFor } from '@/lib/seo';

import { requestPasswordResetAction } from './actions';

import styles from '../auth.module.css';

type PageProps = AppPageProps;

const EMPTY_SEARCH_PARAMS: ResolvedSearchParams<PageProps> = {};

const PAGE_TITLE = 'Reset your My Race Engineer password';
const PAGE_DESCRIPTION =
  'Request a secure password reset link and get back to analysing race telemetry.';

export function generateMetadata(): Metadata {
  const canonical = canonicalFor('/auth/reset-password');

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

type ResetStatusTone = 'info' | 'error' | 'success';

type ResetStatusMessage = {
  tone: ResetStatusTone;
  message: string;
};

const getParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value ?? undefined;
};

const buildStatusMessage = (
  statusCode: string | undefined,
  errorCode: string | undefined,
): ResetStatusMessage => {
  if (statusCode === 'sent') {
    return {
      tone: 'success' as const,
      message: 'If that email matches an account, a reset link is on its way.',
    };
  }

  switch (errorCode) {
    case 'invalid-origin':
      return {
        tone: 'error' as const,
        message:
          'Password reset requests from this origin are blocked. Update the ALLOWED_ORIGINS environment variable and try again.',
      };
    case 'invalid-token':
      return {
        tone: 'error' as const,
        message: 'Your session expired. Refresh the page and submit the form again.',
      };
    case 'validation':
      return {
        tone: 'error' as const,
        message: 'Enter a valid email address before requesting a reset link.',
      };
    case 'rate-limited':
      return {
        tone: 'error' as const,
        message: 'Too many reset attempts. Wait a few minutes before trying again.',
      };
    case 'server-error':
      return {
        tone: 'error' as const,
        message: 'We were unable to start the reset flow. Please try again shortly.',
      };
    default:
      return {
        tone: 'info' as const,
        message: 'We’ll send reset instructions within a minute if the email is recognised.',
      };
  }
};

const buildConfigurationStatus = (): ResetStatusMessage => ({
  tone: 'error',
  message:
    'Password reset requests are temporarily unavailable due to a server configuration issue. Please contact your administrator.',
});

const getStatusClassName = (tone: ResetStatusTone) => {
  switch (tone) {
    case 'error':
      return `${styles.statusRegion} ${styles.statusError}`;
    case 'success':
      return `${styles.statusRegion} ${styles.statusSuccess}`;
    default:
      return `${styles.statusRegion} ${styles.statusInfo}`;
  }
};

export default async function Page({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? EMPTY_SEARCH_PARAMS;
  noStore();
  let formToken: string | null = null;
  let configurationStatus: ResetStatusMessage | null = null;

  try {
    formToken = generateAuthFormToken('password-reset');
  } catch (error) {
    if (error instanceof MissingAuthFormTokenSecretError) {
      configurationStatus = buildConfigurationStatus();
    } else {
      throw error;
    }
  }

  const statusCode = getParam(sp.status);
  const errorCode = getParam(sp.error);
  const status = configurationStatus ?? buildStatusMessage(statusCode, errorCode);
  const emailPrefill = getParam(sp.email) ?? '';
  const statusClassName = getStatusClassName(status.tone);
  const isFormDisabled = !formToken;

  return (
    <section className={styles.wrapper} aria-labelledby="auth-reset-heading">
      <article className={styles.card}>
        <header className={styles.cardHeader}>
          <h1 className={styles.title} id="auth-reset-heading">
            Reset your password
          </h1>
          <p className={styles.description}>
            Request a secure password reset link and get back to analysing race telemetry.
          </p>
        </header>
        <form
          className={styles.form}
          method="post"
          action={requestPasswordResetAction}
          aria-describedby="auth-reset-status"
        >
          {formToken ? <input type="hidden" name="formToken" value={formToken} /> : null}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="auth-reset-email">
              Email address
            </label>
            <input
              id="auth-reset-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              aria-required="true"
              className={styles.input}
              aria-describedby="auth-reset-email-help auth-reset-status"
              defaultValue={emailPrefill}
              disabled={isFormDisabled}
            />
            <p className={styles.helpText} id="auth-reset-email-help">
              We will send reset instructions to this inbox if it matches an account.
            </p>
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.primaryButton} disabled={isFormDisabled}>
              Send reset link
            </button>
            <Link className={styles.secondaryLink} href="/auth/login">
              Return to sign in
            </Link>
          </div>
          <p
            className={statusClassName}
            id="auth-reset-status"
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
