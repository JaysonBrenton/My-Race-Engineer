/**
 * Filename: src/app/(auth)/auth/login/page.tsx
 * Purpose: Render the login experience with cache-busting guarantees and error-prefilled forms.
 * Author: Jayson Brenton
 * Date: 2025-10-11
 * License: MIT License
 */

import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { MissingAuthFormTokenSecretError, generateAuthFormToken } from '@/lib/auth/formTokens';
import { canonicalFor } from '@/lib/seo';

// The login page is a server component that renders the sign-in form and reacts
// to status codes passed through query parameters.  Pairing it with the server
// action keeps sensitive logic off the client while still enabling a fully
// accessible UI.

import styles from '../auth.module.css';
import { loginAction } from './actions';
import { resendVerificationEmailAction } from './resend-verification/actions';
import { VerificationStatusPanel } from './verification-status-panel';
import {
  asOptionalTrimmedString,
  firstParamValue,
  safeParseJsonRecord,
  type SearchParams,
} from '../shared/search-params';

const PAGE_TITLE = 'Sign in to My Race Engineer';
const PAGE_DESCRIPTION =
  'Access telemetry dashboards and racing insights with your team credentials.';

// Providing metadata keeps the login route discoverable and ensures social
// shares render a helpful preview when a team member invites someone to the
// platform.
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
  searchParams?: SearchParams;
};

type StatusTone = 'info' | 'success' | 'error';

type StatusMessage = {
  tone: StatusTone;
  message: string;
};

const buildPrefill = (raw: string | undefined) => {
  const parsed = safeParseJsonRecord(raw);

  if (!parsed) {
    return {};
  }

  const identifier =
    asOptionalTrimmedString(parsed.identifier) ?? asOptionalTrimmedString(parsed.email);

  return {
    identifier,
  };
};

// Converts status and error codes into human-readable strings plus a tone for
// styling.  Keeping the mapping server-side means we can refine messaging
// without shipping additional client bundles.
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

  if (statusCode === 'verify-email') {
    return {
      tone: 'info' as const,
      message:
        'Check your inbox for a verification link. Once confirmed, you can sign in immediately.',
    };
  }

  if (statusCode === 'verify-email-awaiting-approval') {
    return {
      tone: 'info' as const,
      message:
        'We received your elevated access request. Verify your email and we will alert you when an administrator approves it.',
    };
  }

  if (statusCode === 'awaiting-approval') {
    return {
      tone: 'info' as const,
      message:
        'An administrator is reviewing your elevated access request. We will notify you as soon as it is approved.',
    };
  }

  if (statusCode === 'password-reset-confirmed') {
    return {
      tone: 'success' as const,
      message: 'Password updated successfully. Sign in with your new credentials.',
    };
  }

  switch (errorCode) {
    case 'invalid-origin':
      return {
        tone: 'error' as const,
        message: 'Your request came from an unapproved origin.',
      };
    case 'invalid-token':
      return {
        tone: 'error' as const,
        message: 'Your form expired. Please try again.',
      };
    case 'validation':
      return {
        tone: 'error' as const,
        message: 'Please fix the highlighted fields.',
      };
    case 'invalid-credentials':
      return {
        tone: 'error' as const,
        message: 'Incorrect email, driver name, or password. Try again or reset your password.',
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
    case 'account-pending':
      return {
        tone: 'error' as const,
        message:
          'Your access request is pending administrator approval. We will email you once it is ready to use.',
      };
    case 'account-suspended':
      return {
        tone: 'error' as const,
        message:
          'This account has been suspended. Contact support if you believe this is an error.',
      };
    case 'session-expired':
      return {
        tone: 'error' as const,
        message: 'Your session expired. Please sign in again to continue.',
      };
    case 'session-invalid':
      return {
        tone: 'error' as const,
        message: 'Your session is no longer valid. Sign in again to resume.',
      };
    case 'rate-limited':
      return {
        tone: 'error' as const,
        message: 'Too many sign-in attempts. Wait a few minutes before trying again.',
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

const looksLikeEmail = (value: string | null | undefined): value is string =>
  typeof value === 'string' && /.+@.+/.test(value);

// Dedicated helper for configuration issues so we can surface a clearer
// message when the CSRF secret is missing.
const buildConfigurationStatusMessage = (): StatusMessage => ({
  tone: 'error',
  message:
    'Sign in is temporarily unavailable due to a server configuration issue. Please contact your administrator.',
});

export default function LoginPage({ searchParams }: LoginPageProps) {
  noStore();
  let formToken: string | null = null;
  let configurationStatus: StatusMessage | null = null;

  try {
    // Every render attempts to mint a short-lived token used as a CSRF guard for
    // the server action.  If the secret is missing we fall back to a disabled
    // form state with an explicit message.
    formToken = generateAuthFormToken('login');
  } catch (error) {
    if (error instanceof MissingAuthFormTokenSecretError) {
      configurationStatus = buildConfigurationStatusMessage();
    } else {
      throw error;
    }
  }
  const statusCode = firstParamValue(searchParams?.status);
  const errorCode = firstParamValue(searchParams?.error);
  const status = configurationStatus ?? buildStatusMessage(statusCode, errorCode);
  const parsedPrefill = buildPrefill(firstParamValue(searchParams?.prefill));
  const fallbackIdentifier = asOptionalTrimmedString(firstParamValue(searchParams?.identifier));
  const fallbackEmail = asOptionalTrimmedString(firstParamValue(searchParams?.email));
  const identifierPrefill = parsedPrefill.identifier ?? fallbackIdentifier ?? fallbackEmail ?? '';
  const candidateEmail =
    looksLikeEmail(parsedPrefill.identifier) && parsedPrefill.identifier
      ? parsedPrefill.identifier
      : looksLikeEmail(fallbackEmail)
        ? fallbackEmail
        : looksLikeEmail(fallbackIdentifier)
          ? fallbackIdentifier
          : '';

  const shouldShowVerificationPanel =
    statusCode === 'verify-email' ||
    statusCode === 'verify-email-awaiting-approval' ||
    statusCode === 'verification-resent' ||
    errorCode === 'email-not-verified' ||
    errorCode === 'verification-rate-limited' ||
    errorCode === 'verification-invalid-token' ||
    errorCode === 'verification-server-error' ||
    errorCode === 'verification-validation';

  let resendFormToken: string | null = null;

  if (shouldShowVerificationPanel) {
    try {
      resendFormToken = generateAuthFormToken('verification-resend');
    } catch (error) {
      if (!(error instanceof MissingAuthFormTokenSecretError)) {
        throw error;
      }
    }
  }

  const inlineBannerCandidate = errorCode ? buildStatusMessage(undefined, errorCode) : null;
  const inlineBannerMessage =
    inlineBannerCandidate && inlineBannerCandidate.tone === 'error'
      ? inlineBannerCandidate.message
      : null;
  const statusClassName = getStatusClassName(status.tone);
  const isFormDisabled = !formToken;

  return (
    <div className={styles.page}>
      <section className={styles.wrapper} aria-labelledby="auth-login-heading">
        <article className={styles.card}>
          <header className={styles.cardHeader}>
            {/* Clear heading hierarchy improves screen reader navigation and gives
                SEO crawlers structured context about the page purpose. */}
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
            action={loginAction}
            aria-describedby="auth-login-status"
          >
            {/* The hidden form token travels with the POST request so the server can
                confirm the submission originated from this rendered page. */}
            {formToken ? <input type="hidden" name="formToken" value={formToken} /> : null}
            {inlineBannerMessage ? (
              <div className={`${styles.inlineBanner} ${styles.inlineBannerError}`} role="alert">
                {inlineBannerMessage}
              </div>
            ) : null}
            <div className={styles.field}>
              {/* Each input gets explicit labels and helper text to meet WCAG 2.2
                  accessibility requirements. */}
              <label className={styles.label} htmlFor="auth-login-identifier">
                Email address or Driver Name
              </label>
              <input
                id="auth-login-identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                inputMode="text"
                required
                aria-required="true"
                className={styles.input}
                aria-describedby="auth-login-identifier-help auth-login-status"
                defaultValue={identifierPrefill}
                disabled={isFormDisabled}
              />
              <p className={styles.helpText} id="auth-login-identifier-help">
                Enter the email or driver name tied to your paddock or club account.
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
              {/* Status messages update politely so screen readers announce changes
                  without disrupting the user's current focus. */}
              {status.message}
            </p>
          </form>
          {shouldShowVerificationPanel ? (
            <VerificationStatusPanel
              statusCode={statusCode}
              errorCode={errorCode}
              defaultEmail={candidateEmail}
              resendFormToken={resendFormToken}
              resendAction={resendVerificationEmailAction}
            />
          ) : null}
        </article>
      </section>
    </div>
  );
}
