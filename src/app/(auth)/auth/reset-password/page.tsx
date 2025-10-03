import type { Metadata } from 'next';
import Link from 'next/link';

import { generateAuthFormToken } from '@/lib/auth/formTokens';
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

export default function ResetPasswordPage() {
  const formToken = generateAuthFormToken('password-reset');

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
          <input type="hidden" name="formToken" value={formToken} />
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
            />
            <p className={styles.helpText} id="auth-reset-email-help">
              We will send reset instructions to this inbox if it matches an account.
            </p>
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.primaryButton}>
              Send reset link
            </button>
            <Link className={styles.secondaryLink} href="/auth/login">
              Return to sign in
            </Link>
          </div>
          <p
            className={styles.statusRegion}
            id="auth-reset-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            We’ll send reset instructions within a minute if the email is recognised.
          </p>
        </form>
      </article>
    </section>
  );
}
