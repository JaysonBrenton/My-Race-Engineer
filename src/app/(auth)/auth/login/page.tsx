import type { Metadata } from 'next';
import Link from 'next/link';

import { generateAuthFormToken } from '@/lib/auth/formTokens';
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

export default function LoginPage() {
  const formToken = generateAuthFormToken('login');

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
          action="/auth/login"
          aria-describedby="auth-login-status"
        >
          <input type="hidden" name="formToken" value={formToken} />
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
            />
            <label htmlFor="auth-login-remember">Remember me on this device</label>
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.primaryButton}>
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
            className={styles.statusRegion}
            id="auth-login-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            Status updates will appear here during sign in.
          </p>
        </form>
      </article>
    </section>
  );
}
