import type { Metadata } from 'next';
import Link from 'next/link';

import { MissingAuthFormTokenSecretError, generateAuthFormToken } from '@/lib/auth/formTokens';
import { canonicalFor } from '@/lib/seo';

import styles from '../auth.module.css';

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

type ResetStatusTone = 'info' | 'error';

type ResetStatusMessage = {
  tone: ResetStatusTone;
  message: string;
};

const buildConfigurationStatus = (): ResetStatusMessage => ({
  tone: 'error',
  message:
    'Password reset requests are temporarily unavailable due to a server configuration issue. Please contact your administrator.',
});

const getStatusClassName = (tone: ResetStatusTone) =>
  tone === 'error' ? `${styles.statusRegion} ${styles.statusError}` : styles.statusRegion;

export default function ResetPasswordPage() {
  let formToken: string | null = null;
  const defaultStatus: ResetStatusMessage = {
    tone: 'info',
    message: 'We’ll send reset instructions within a minute if the email is recognised.',
  };
  let status: ResetStatusMessage = defaultStatus;

  try {
    formToken = generateAuthFormToken('password-reset');
  } catch (error) {
    if (error instanceof MissingAuthFormTokenSecretError) {
      status = buildConfigurationStatus();
    } else {
      throw error;
    }
  }

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
          action="/auth/reset-password"
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
