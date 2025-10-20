/**
 * Author: Jayson Brenton + The Brainy One
 * Date: 2025-10-20
 * Purpose: Maintain typed routes for register page navigation helpers.
 * License: MIT
 */

import type { Metadata } from 'next';
import type { AppPageProps, ResolvedSearchParams } from '@/types/app-page-props';
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
} from '../shared/search-params';
import {
  buildStatusMessage,
  parseDriverNameSuggestionsParam,
  type RegisterErrorCode,
  type StatusMessage,
} from './state';
import { registerAction } from './actions';
import { ROUTE_LOGIN } from '@/app/routes';

type PageProps = AppPageProps;

const EMPTY_SEARCH_PARAMS: ResolvedSearchParams<PageProps> = {};

const PAGE_TITLE = 'Create your My Race Engineer account';
const PAGE_DESCRIPTION =
  'Self-serve registration with email verification keeps your team ready for telemetry insights.';

export function generateMetadata(): Metadata {
  // Registration is SEO-addressable because we link to it from marketing content. We
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

type RegisterPrefill = {
  name?: string;
  driverName?: string;
  email?: string;
};

const buildPrefill = (raw: string | undefined): RegisterPrefill => {
  const parsed = safeParseJsonRecord(raw);

  if (!parsed) {
    return {};
  }

  return {
    name: asOptionalTrimmedString(parsed.name),
    driverName: asOptionalTrimmedString(parsed.driverName),
    email: asOptionalTrimmedString(parsed.email),
  };
};

const parseErrorCode = (raw: string | undefined): RegisterErrorCode | undefined => {
  switch (raw) {
    case 'invalid-origin':
    case 'invalid-token':
    case 'validation':
    case 'rate-limited':
    case 'email-taken':
    case 'driver-name-taken':
    case 'weak-password':
    case 'server-error':
      return raw;
    default:
      return undefined;
  }
};

const getStatusClassName = (tone: StatusMessage['tone']) => {
  switch (tone) {
    case 'error':
      return `${styles.statusRegion} ${styles.statusError}`;
    case 'success':
      return `${styles.statusRegion} ${styles.statusSuccess}`;
    default:
      return styles.statusRegion;
  }
};

const buildConfigurationErrorStatus = (): StatusMessage => ({
  tone: 'error',
  message:
    'Account registration is temporarily unavailable due to a server configuration issue. Please contact your administrator.',
});

export default async function Page({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? EMPTY_SEARCH_PARAMS;
  noStore();
  let formToken: string | null = null;
  let configurationStatus: StatusMessage | null = null;

  try {
    // We generate a per-request token that the action checks to prevent CSRF. If the
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

  const errorParam = firstParamValue(sp.error);
  const errorCode = parseErrorCode(errorParam);
  const parsedPrefill = buildPrefill(firstParamValue(sp.prefill));
  const fallbackName = asOptionalTrimmedString(firstParamValue(sp.name));
  const fallbackDriverName = asOptionalTrimmedString(firstParamValue(sp.driverName));
  const fallbackEmail = asOptionalTrimmedString(firstParamValue(sp.email));
  const driverNameSuggestions = parseDriverNameSuggestionsParam(
    firstParamValue(sp.driverNameSuggestions),
  );

  const namePrefill = parsedPrefill.name ?? fallbackName ?? '';
  const driverNamePrefill = parsedPrefill.driverName ?? fallbackDriverName ?? '';
  const emailPrefill = parsedPrefill.email ?? fallbackEmail ?? '';

  const statusContext = configurationStatus ? undefined : { driverNameSuggestions };
  const resolvedStatus = configurationStatus ?? buildStatusMessage(errorCode, statusContext);

  const inlineBannerCandidate =
    errorCode && !configurationStatus ? buildStatusMessage(errorCode, statusContext) : null;
  const inlineBannerMessage =
    inlineBannerCandidate && inlineBannerCandidate.tone === 'error'
      ? inlineBannerCandidate.message
      : null;
  const statusClassName = getStatusClassName(resolvedStatus.tone);
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
            Create an account and verify your email to start analysing pace, consistency, and race
            trends with your crew.
          </p>
        </header>
        <form
          className={styles.form}
          method="post"
          action={registerAction}
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
            <label className={styles.label} htmlFor="auth-register-driver-name">
              Driver name
            </label>
            <input
              id="auth-register-driver-name"
              name="driverName"
              type="text"
              autoComplete="nickname"
              required
              aria-required="true"
              className={styles.input}
              aria-describedby="auth-register-driver-name-help auth-register-status"
              defaultValue={driverNamePrefill}
              disabled={isFormDisabled}
            />
            <p className={styles.helpText} id="auth-register-driver-name-help">
              This driver name must be unique and will represent you in race telemetry.
            </p>
            {driverNameSuggestions.length > 0 ? (
              <div className={styles.suggestionGroup} role="note" aria-live="polite">
                <p className={styles.suggestionHeading}>Suggested driver names</p>
                <ul className={styles.suggestionList}>
                  {driverNameSuggestions.map((suggestion) => (
                    <li key={suggestion} className={styles.suggestionListItem}>
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="auth-register-email">
              Email
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
            <Link className={styles.secondaryLink} href={ROUTE_LOGIN}>
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
            {resolvedStatus.message}
          </p>
        </form>
      </article>
    </section>
  );
}
