import type { Metadata } from 'next';
import Link from 'next/link';

import { generateAuthFormToken } from '@/lib/auth/formTokens';
import { canonicalFor } from '@/lib/seo';

import styles from '../auth.module.css';

const PAGE_TITLE = 'Create your My Race Engineer account';
const PAGE_DESCRIPTION =
  'Bring your team onboard with secure access to telemetry dashboards and collaboration tools.';

export function generateMetadata(): Metadata {
  const canonical = canonicalFor('/auth/register');

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

type RegisterPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

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

const buildStatusMessage = (errorCode: string | undefined): StatusMessage => {
  switch (errorCode) {
    case 'invalid-token':
      return {
        tone: 'error' as const,
        message: 'Your session expired. Refresh the page and try again.',
      };
    case 'validation':
      return {
        tone: 'error' as const,
        message: 'Check the highlighted fields and try submitting again.',
      };
    case 'email-taken':
      return {
        tone: 'error' as const,
        message: 'An account already exists for that email address. Try signing in instead.',
      };
    case 'server-error':
      return {
        tone: 'error' as const,
        message:
          'We hit an unexpected error while creating your account. Please try again shortly.',
      };
    default:
      return {
        tone: 'info' as const,
        message: 'We will send you a verification email after submission.',
      };
  }
};

const getStatusClassName = (tone: StatusTone) => {
  switch (tone) {
    case 'error':
      return `${styles.statusRegion} ${styles.statusError}`;
    default:
      return `${styles.statusRegion} ${styles.statusInfo}`;
  }
};

export default function RegisterPage({ searchParams }: RegisterPageProps) {
  const formToken = generateAuthFormToken('registration');
  const errorCode = getParam(searchParams?.error);
  const status = buildStatusMessage(errorCode);
  const namePrefill = getParam(searchParams?.name) ?? '';
  const emailPrefill = getParam(searchParams?.email) ?? '';
  const statusClassName = getStatusClassName(status.tone);

  return (
    <section className={styles.wrapper} aria-labelledby="auth-register-heading">
      <article className={styles.card}>
        <header className={styles.cardHeader}>
          <h1 className={styles.title} id="auth-register-heading">
            Create your account
          </h1>
          <p className={styles.description}>
            Bring your team onboard with secure access to telemetry dashboards and collaboration
            tools.
          </p>
        </header>
        <form
          className={styles.form}
          method="post"
          action="/auth/register/submit"
          aria-describedby="auth-register-status"
        >
          <input type="hidden" name="formToken" value={formToken} />
          <div className={styles.field}>
            <label className={styles.label} htmlFor="auth-register-name">
              Full name
            </label>
            <input
              id="auth-register-name"
              name="name"
              type="text"
              autoComplete="name"
              required
              aria-required="true"
              className={styles.input}
              aria-describedby="auth-register-name-help auth-register-status"
              defaultValue={namePrefill}
            />
            <p className={styles.helpText} id="auth-register-name-help">
              This name is displayed in dashboards and team rosters.
            </p>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="auth-register-email">
              Work email
            </label>
            <input
              id="auth-register-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              aria-required="true"
              className={styles.input}
              aria-describedby="auth-register-email-help auth-register-status"
              defaultValue={emailPrefill}
            />
            <p className={styles.helpText} id="auth-register-email-help">
              We use this email to verify your identity and send race updates.
            </p>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="auth-register-password">
              Password
            </label>
            <input
              id="auth-register-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              aria-required="true"
              className={styles.input}
              aria-describedby="auth-register-password-rules auth-register-status"
            />
            <ul className={styles.requirements} id="auth-register-password-rules">
              <li>At least 12 characters</li>
              <li>Contains one number and one symbol</li>
              <li>Includes upper and lower case letters</li>
            </ul>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="auth-register-confirm-password">
              Confirm password
            </label>
            <input
              id="auth-register-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              aria-required="true"
              className={styles.input}
              aria-describedby="auth-register-status"
            />
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.primaryButton}>
              Create account
            </button>
            <Link className={styles.secondaryLink} href="/auth/login">
              Already have an account? Sign in
            </Link>
          </div>
          <p
            className={statusClassName}
            id="auth-register-status"
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
