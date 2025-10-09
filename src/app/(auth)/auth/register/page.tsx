/**
 * Filename: src/app/(auth)/auth/register/page.tsx
 * Purpose: Render the registration form with safe prefills, inline error states, and cache disabling.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { MissingAuthFormTokenSecretError, generateAuthFormToken } from '@/lib/auth/formTokens';
import { canonicalFor } from '@/lib/seo';

import styles from '../auth.module.css';
import {
  asOptionalTrimmedString,
  firstParamValue,
  safeParseJsonRecord,
  type SearchParams,
} from '../shared/search-params';
import { registerAction } from './actions';
import {
  INITIAL_REGISTER_STATE,
  buildStatusMessage,
  type RegisterActionState,
  type RegisterErrorCode,
  type StatusMessage,
} from './state';
import { RegisterForm } from './register-form';

const PAGE_TITLE = 'Create your My Race Engineer account';
const PAGE_DESCRIPTION =
  'Bring your team onboard with secure access to telemetry dashboards and collaboration tools.';

export function generateMetadata(): Metadata {
  // Registration is SEO-addressable because we link to it from marketing content.  We
  // compute the canonical URL once so social previews, Open Graph metadata, and search
  // engines share the same reference.
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
  searchParams?: SearchParams;
};

const buildPrefill = (raw: string | undefined) => {
  const parsed = safeParseJsonRecord(raw);

type RegisterPrefill = {
  name?: string;
  email?: string;
};

const parsePrefillParam = (raw: string | undefined): RegisterPrefill => {
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }

    const shape = parsed as Record<string, unknown>;
    const name = typeof shape.name === 'string' ? shape.name : undefined;
    const email = typeof shape.email === 'string' ? shape.email : undefined;

    return { name, email };
  } catch {
    return {};
  }
};

// Translate redirect error codes into human-friendly copy that also drives the visual
// state of the live region.  Keeping the mapping in one place makes it easy to audit
// for accessibility.
const buildStatusMessage = (errorCode: string | undefined): StatusMessage => {
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
    case 'email-taken':
      return {
        tone: 'error' as const,
        message: 'An account already exists for that email address. Try signing in instead.',
      };
    case 'weak-password':
      return {
        tone: 'error' as const,
        message: 'Choose a stronger password that meets the security policy.',
      };
    case 'rate-limited':
      return {
        tone: 'error' as const,
        message: 'Too many attempts in a short time. Wait a few minutes before trying again.',
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

  return {
    name: asOptionalTrimmedString(parsed.name),
    email: asOptionalTrimmedString(parsed.email),
  };
};

const buildConfigurationErrorStatus = (): StatusMessage => ({
  tone: 'error',
  message:
    'Account registration is temporarily unavailable due to a server configuration issue. Please contact your administrator.',
});

export default function RegisterPage({ searchParams }: RegisterPageProps) {
  noStore();
  let formToken: string | null = null;
  let configurationStatus: StatusMessage | null = null;

  try {
    // We generate a per-request token that the action checks to prevent CSRF.  If the
    // secret is missing we still render the page but communicate that registration is
    // unavailable instead of throwing an opaque error.
    formToken = generateAuthFormToken('registration');
  } catch (error) {
    if (error instanceof MissingAuthFormTokenSecretError) {
      configurationStatus = buildConfigurationErrorStatus();
    } else {
      throw error;
    }
  }
  // Merge configuration errors with any status returned from the action so the live
  // region always reflects the highest priority message for the user.
  const errorCode = getParam(searchParams?.error);
  const status = configurationStatus ?? buildStatusMessage(errorCode);
  const parsedPrefill = parsePrefillParam(getParam(searchParams?.prefill));
  const fallbackName = getParam(searchParams?.name);
  const fallbackEmail = getParam(searchParams?.email);
  const namePrefill = (parsedPrefill.name ?? fallbackName ?? '').trim();
  const emailPrefill = (parsedPrefill.email ?? fallbackEmail ?? '').trim();
  const inlineBannerCandidate = errorCode ? buildStatusMessage(errorCode) : null;
  const inlineBannerMessage =
    inlineBannerCandidate && inlineBannerCandidate.tone === 'error'
      ? inlineBannerCandidate.message
      : null;
  const statusClassName = getStatusClassName(status.tone);
  const isFormDisabled = !formToken;

  return (
    // The page uses a semantic section/article pairing so screen readers announce the
    // registration experience as a standalone card.
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
          action="/auth/register"
          aria-describedby="auth-register-status"
        >
          {formToken ? <input type="hidden" name="formToken" value={formToken} /> : null}
          {inlineBannerMessage ? (
            <div className={`${styles.inlineBanner} ${styles.inlineBannerError}`} role="alert">
              {inlineBannerMessage}
            </div>
          ) : null}
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
              disabled={isFormDisabled}
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
              disabled={isFormDisabled}
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
              disabled={isFormDisabled}
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
              disabled={isFormDisabled}
            />
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.primaryButton} disabled={isFormDisabled}>
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
