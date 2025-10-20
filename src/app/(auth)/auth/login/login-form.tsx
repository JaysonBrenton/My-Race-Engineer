'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import styles from '../auth.module.css';
import { loginAction, type LoginActionState } from './actions';
import type { StatusMessage } from './status';
import { VerificationStatusPanel } from './verification-status-panel';
import { resendVerificationEmailAction } from './resend-verification/actions';

const INITIAL_STATE: LoginActionState = null;

const getStatusClassName = (tone: StatusMessage['tone']) => {
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

export type LoginFormProps = {
  status: StatusMessage;
  inlineBannerMessage: string | null;
  identifierPrefill: string;
  formToken: string | null;
  isFormDisabled: boolean;
  defaultStatusCode?: string;
  defaultErrorCode?: string;
  shouldShowVerificationPanel: boolean;
  candidateEmail: string;
  resendFormToken: string | null;
};

export function LoginForm(props: LoginFormProps) {
  const {
    status,
    inlineBannerMessage,
    identifierPrefill,
    formToken,
    isFormDisabled,
    defaultStatusCode,
    defaultErrorCode,
    shouldShowVerificationPanel,
    candidateEmail,
    resendFormToken,
  } = props;
  const [state, formAction, isPending] = useActionState(loginAction, INITIAL_STATE);
  const [identifierValue, setIdentifierValue] = useState(identifierPrefill);
  const router = useRouter();

  useEffect(() => {
    if (state?.status === 'success') {
      router.replace(state.redirectTo);
    }
  }, [state, router]);

  useEffect(() => {
    if (state?.status === 'error') {
      const nextIdentifier = state.prefill?.identifier;
      if (typeof nextIdentifier === 'string') {
        setIdentifierValue(nextIdentifier);
      }
    }
  }, [state]);

  useEffect(() => {
    setIdentifierValue(identifierPrefill);
  }, [identifierPrefill]);

  const effectiveStatus: StatusMessage =
    state && state.status === 'error' ? state.statusMessage : status;

  const bannerMessage =
    state && state.status === 'error'
      ? state.statusMessage.tone === 'error'
        ? state.statusMessage.message
        : null
      : inlineBannerMessage;

  const disabled = isFormDisabled || isPending || state?.status === 'success';
  const statusClassName = getStatusClassName(effectiveStatus.tone);

  const effectiveErrorCode = state && state.status === 'error' ? state.error : defaultErrorCode;
  const showVerificationPanel =
    shouldShowVerificationPanel || effectiveErrorCode === 'email-not-verified';

  const verificationEmail = (() => {
    if (state && state.status === 'error') {
      const candidate = state.prefill?.identifier ?? null;
      if (looksLikeEmail(candidate)) {
        return candidate;
      }
    }

    return candidateEmail;
  })();

  return (
    <>
      <form className={styles.form} method="post" action={formAction} aria-describedby="auth-login-status">
        {formToken ? <input type="hidden" name="formToken" value={formToken} /> : null}
        {bannerMessage ? (
          <div className={`${styles.inlineBanner} ${styles.inlineBannerError}`} role="alert">
            {bannerMessage}
          </div>
        ) : null}
        <div className={styles.field}>
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
            value={identifierValue}
            onChange={(event) => setIdentifierValue(event.target.value)}
            disabled={disabled}
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
            disabled={disabled}
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
            disabled={disabled}
          />
          <label htmlFor="auth-login-remember">Remember me on this device</label>
        </div>
        <div className={styles.actions}>
          <button type="submit" className={styles.primaryButton} disabled={disabled}>
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
          {effectiveStatus.message}
        </p>
      </form>
      {showVerificationPanel ? (
        <VerificationStatusPanel
          statusCode={defaultStatusCode}
          errorCode={effectiveErrorCode}
          defaultEmail={verificationEmail}
          resendFormToken={resendFormToken}
          resendAction={resendVerificationEmailAction}
        />
      ) : null}
    </>
  );
}
