/**
 * Filename: src/app/(auth)/auth/register/page.tsx
 * Purpose: Render the registration form with safe prefills, inline error states, and cache disabling.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { MissingAuthFormTokenSecretError, generateAuthFormToken } from '@/lib/auth/formTokens';
import { canonicalFor } from '@/lib/seo';

import styles from '../auth.module.css';
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
  searchParams?: Record<string, string | string[] | undefined>;
};

// `searchParams` values may be arrays due to repeated query keys.  We take the first
// entry to keep the UI deterministic and ignore unexpected values.
const getParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value ?? undefined;
};

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
  const normalizedErrorCode = (errorCode ?? undefined) as RegisterErrorCode | undefined;
  const status = configurationStatus ?? buildStatusMessage(normalizedErrorCode);
  const parsedPrefill = parsePrefillParam(getParam(searchParams?.prefill));
  const fallbackName = getParam(searchParams?.name);
  const fallbackEmail = getParam(searchParams?.email);
  const namePrefill = (parsedPrefill.name ?? fallbackName ?? '').trim();
  const emailPrefill = (parsedPrefill.email ?? fallbackEmail ?? '').trim();
  const initialState: RegisterActionState = {
    ...INITIAL_REGISTER_STATE,
    status,
    errorCode: normalizedErrorCode,
    values: {
      name: namePrefill,
      email: emailPrefill,
    },
  };

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
        <RegisterForm action={registerAction} initialState={initialState} formToken={formToken} />
      </article>
    </section>
  );
}
