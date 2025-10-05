import type { Metadata } from 'next';
import Link from 'next/link';

import { MissingAuthFormTokenSecretError, generateAuthFormToken } from '@/lib/auth/formTokens';
import { canonicalFor } from '@/lib/seo';

import styles from '../auth.module.css';

const PAGE_TITLE = 'Sign in to My Race Engineer';
const PAGE_DESCRIPTION =
  'Access telemetry dashboards and racing insights with your team credentials.';

export function generateMetadata(): Metadata {
  const canonical = canonicalFor('/auth/login');

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

type LoginPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

type StatusTone = 'info' | 'success' | 'error';

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

const buildStatusMessage = (
  statusCode: string | undefined,
  errorCode: string | undefined,
): StatusMessage => {
  if (statusCode === 'account-created') {
    return {
      tone: 'success' as const,
      message: 'Account created successfully. You can now sign in with your credentials.',
    };
  }

  switch (errorCode) {
    case 'invalid-token':
      return {
        tone: 'error' as const,
        message: 'Your session expired. Refresh and submit the form again.',
      };
    case 'validation':
      return {
        tone: 'error' as const,
        message: 'Double-check your details and try signing in again.',
      };
    case 'invalid-credentials':
      return {
        tone: 'error' as const,
        message: 'Incorrect email or password. Try again or reset your password.',
      };
    case 'email-not-verified':
      return {
        tone: 'error' as const,
        message:
          'Verify your email address before signing in. Check your inbox for the verification link.',
      };
    case 'server-error':
      return {
        tone: 'error' as const,
        message: 'We were unable to sign you in. Please try again in a moment.',
      };
    default:
      return {
        tone: 'info' as const,
        message: 'Status updates will appear here during sign in.',
      };
  }
};

const getStatusClassName = (tone: StatusTone) => {
  switch (tone) {
    case 'error':
      return `${styles.statusRegion} ${styles.statusError}`;
    case 'success':
      return `${styles.statusRegion} ${styles.statusSuccess}`;
    default:
      return `${styles.statusRegion} ${styles.statusInfo}`;
  }
};

const buildConfigurationStatusMessage = (): StatusMessage => ({
  tone: 'error',
  message:
    'Sign in is temporarily unavailable due to a server configuration issue. Please contact your administrator.',
});

export default function LoginPage({ searchParams }: LoginPageProps) {
  let formToken: string | null = null;
  let configurationStatus: StatusMessage | null = null;

  try {
    formToken = generateAuthFormToken('login');
  } catch (error) {
    if (error instanceof MissingAuthFormTokenSecretError) {
      configurationStatus = buildConfigurationStatusMessage();
    } else {
      throw error;
    }
  }
  const statusCode = getParam(searchParams?.status);
  const errorCode = getParam(searchParams?.error);
  const status = configurationStatus ?? buildStatusMessage(statusCode, errorCode);
  const emailPrefill = getParam(searchParams?.email) ?? '';
  const statusClassName = getStatusClassName(status.tone);
  const isFormDisabled = !formToken;

  return (
    <section className={styles.wrapper} aria-labelledby="auth-login-heading">
      <article className={styles.card}>
        <header className={styles.cardHeader}>
          <h1 className={styles.title} id="auth-login-heading">
            Sign in
          </h1>
          <p className={styles.description}>
            Access telemetry dashboards and racing insights with your team credentials.
          </p>
        </header>
        <form
          className={styles.form}
          method="post"
          action="/auth/login/submit"
          aria-describedby="auth-login-status"
        >
          {formToken ? <input type="hidden" name="formToken" value={formToken} /> : null}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="auth-login-email">
              Email address
            </label>
            <input
              id="auth-login-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              aria-required="true"
              className={styles.input}
              aria-describedby="auth-login-email-help auth-login-status"
              defaultValue={emailPrefill}
              disabled={isFormDisabled}
            />
            <p className={styles.helpText} id="auth-login-email-help">
              Use the email associated with your paddock or club account.
            </p>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="auth-login-password">
              Password
            </label>
            <input
              id="auth-login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-required="true"
              className={styles.input}
              aria-describedby="auth-login-password-help auth-login-status"
              disabled={isFormDisabled}
            />
            <p className={styles.helpText} id="auth-login-password-help">
              Passwords are case sensitive and must meet the team security policy.
            </p>
          </div>
          <div className={styles.checkboxField}>
            <input
              className={styles.checkbox}
              id="auth-login-remember"
              name="remember"
              type="checkbox"
              value="true"
              disabled={isFormDisabled}
            />
            <label htmlFor="auth-login-remember">Remember me on this device</label>
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.primaryButton} disabled={isFormDisabled}>
              Sign in
            </button>
            <div className={styles.linkRow}>
              <Link className={styles.secondaryLink} href="/auth/register">
                Create an account
              </Link>
              <Link className={styles.secondaryLink} href="/auth/reset-password">
                Forgot password?
              </Link>
            </div>
          </div>
          <p
            className={statusClassName}
            id="auth-login-status"
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
