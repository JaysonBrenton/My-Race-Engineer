/**
 * Filename: src/app/(auth)/auth/login/page.tsx
 * Purpose: Render the login experience with cache-busting guarantees and error-prefilled forms.
 * Author: Jayson Brenton
 * Date: 2025-10-11
 * License: MIT License
 */

import type { Metadata } from 'next';
import type { AppPageProps, ResolvedSearchParams } from '@/types/app-page-props';
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { MissingAuthFormTokenSecretError, generateAuthFormToken } from '@/lib/auth/formTokens';
import { canonicalFor } from '@/lib/seo';
import { EnvironmentValidationError } from '@/server/config/environment';

// The login page is a server component that renders the sign-in form and reacts
// to status codes passed through query parameters.  Pairing it with the server
// action keeps sensitive logic off the client while still enabling a fully
// accessible UI.

import styles from '../auth.module.css';
import { LoginForm } from './login-form';
import { buildStatusMessage, type StatusMessage } from './status';
import {
  asOptionalTrimmedString,
  firstParamValue,
  safeParseJsonRecord,
} from '../shared/search-params';

type PageProps = AppPageProps;

const EMPTY_SEARCH_PARAMS: ResolvedSearchParams<PageProps> = {};

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

const looksLikeEmail = (value: string | null | undefined): value is string =>
  typeof value === 'string' && /.+@.+/.test(value);

// Dedicated helper for configuration issues so we can surface a clearer
// message when the CSRF secret is missing.
const buildConfigurationStatusMessage = (): StatusMessage => ({
  tone: 'error',
  message:
    'Sign in is temporarily unavailable due to a server configuration issue. Please contact your administrator.',
});

export default async function Page({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? EMPTY_SEARCH_PARAMS;
  noStore();
  let formToken: string | null = null;
  let configurationStatus: StatusMessage | null = null;

  try {
    // Every render attempts to mint a short-lived token used as a CSRF guard for
    // the server action.  If the secret is missing we fall back to a disabled
    // form state with an explicit message.
    formToken = generateAuthFormToken('login');
  } catch (error) {
    if (
      error instanceof MissingAuthFormTokenSecretError ||
      error instanceof EnvironmentValidationError
    ) {
      configurationStatus = buildConfigurationStatusMessage();
    } else {
      throw error;
    }
  }
  const statusCode = firstParamValue(sp.status);
  const errorCode = firstParamValue(sp.error);
  const deletedParam = firstParamValue(sp.deleted);
  const accountDeleted =
    typeof deletedParam === 'string' &&
    (deletedParam === '1' || deletedParam.toLowerCase() === 'true');
  const status = configurationStatus
    ? configurationStatus
    : accountDeleted
      ? {
          tone: 'success' as const,
          message:
            'Your account was deleted successfully. We hope to see you back on the grid soon.',
        }
      : buildStatusMessage(statusCode, errorCode);
  const parsedPrefill = buildPrefill(firstParamValue(sp.prefill));
  const fallbackIdentifier = asOptionalTrimmedString(firstParamValue(sp.identifier));
  const fallbackEmail = asOptionalTrimmedString(firstParamValue(sp.email));
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

  try {
    resendFormToken = generateAuthFormToken('verification-resend');
  } catch (error) {
    if (
      !(error instanceof MissingAuthFormTokenSecretError) &&
      !(error instanceof EnvironmentValidationError)
    ) {
      throw error;
    }
  }

  const inlineBannerCandidate = errorCode ? buildStatusMessage(undefined, errorCode) : null;
  const inlineBannerMessage =
    inlineBannerCandidate && inlineBannerCandidate.tone === 'error'
      ? inlineBannerCandidate.message
      : null;
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
          <LoginForm
            status={status}
            inlineBannerMessage={inlineBannerMessage}
            identifierPrefill={identifierPrefill}
            formToken={formToken}
            isFormDisabled={isFormDisabled}
            defaultStatusCode={statusCode}
            defaultErrorCode={errorCode}
            shouldShowVerificationPanel={shouldShowVerificationPanel}
            candidateEmail={candidateEmail}
            resendFormToken={resendFormToken}
          />
        </article>
      </section>
    </div>
  );
}
