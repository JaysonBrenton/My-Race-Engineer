'use client';

/**
 * Filename: src/app/(auth)/auth/login/verification-status-panel.tsx
 * Purpose: Display verification status messaging and expose a resend workflow.
 */

import type { ResendVerificationEmailAction } from './resend-verification/actions.impl';
import styles from '../auth.module.css';

type PanelTone = 'info' | 'success' | 'error';

type PanelCopy = {
  heading: string;
  message: string;
  tone: PanelTone;
  helper?: string;
};

const buildPanelCopy = (statusCode?: string, errorCode?: string): PanelCopy => {
  if (statusCode === 'verification-resent') {
    return {
      heading: 'Verification email sent again',
      message: 'We just dispatched a fresh verification link. Check your inbox and spam folder.',
      tone: 'success',
      helper: 'The new link replaces any older verification emails.',
    };
  }

  if (statusCode === 'verify-email-awaiting-approval') {
    return {
      heading: 'Verify your email and await approval',
      message:
        'Confirm your email address to finish setup. An administrator will complete the approval once verification succeeds.',
      tone: 'info',
      helper: 'Resend the verification email if the previous message expired.',
    };
  }

  if (statusCode === 'verify-email') {
    return {
      heading: 'Complete email verification',
      message:
        'You need to confirm your email before signing in. Use the form below if you need a new verification link.',
      tone: 'info',
    };
  }

  switch (errorCode) {
    case 'verification-rate-limited':
      return {
        heading: 'Too many resend attempts',
        message: 'Please wait a few minutes before requesting another verification email.',
        tone: 'error',
        helper: 'We limit resends to protect against abuse.',
      };
    case 'verification-invalid-token':
      return {
        heading: 'Verification session expired',
        message: 'Reload the page and try resending the verification email again.',
        tone: 'error',
      };
    case 'verification-server-error':
      return {
        heading: 'Unable to resend right now',
        message: 'We could not queue a new verification email. Try again in a moment.',
        tone: 'error',
      };
    case 'verification-validation':
      return {
        heading: 'Check the email address',
        message: 'Enter a valid email address before requesting another verification email.',
        tone: 'error',
      };
    case 'email-not-verified':
      return {
        heading: 'Verify your email to continue',
        message: 'Your login attempt was blocked because the account email is not verified yet.',
        tone: 'info',
        helper: 'Send yourself a new verification email using the form below.',
      };
    default:
      return {
        heading: 'Email verification pending',
        message:
          'Confirm your email address to unlock telemetry dashboards. Request another link if needed.',
        tone: 'info',
      };
  }
};

const getStatusToneClassName = (tone: PanelTone): string => {
  switch (tone) {
    case 'error':
      return styles.statusError;
    case 'success':
      return styles.statusSuccess;
    default:
      return styles.statusInfo;
  }
};

type VerificationStatusPanelProps = {
  statusCode?: string;
  errorCode?: string;
  defaultEmail: string;
  resendFormToken: string | null;
  resendAction: ResendVerificationEmailAction;
};

export function VerificationStatusPanel(props: VerificationStatusPanelProps) {
  const { statusCode, errorCode, defaultEmail, resendFormToken, resendAction } = props;
  const copy = buildPanelCopy(statusCode, errorCode);
  const statusClass = `${styles.verificationMessage} ${getStatusToneClassName(copy.tone)}`;
  const isDisabled = !resendFormToken;

  return (
    <section className={styles.verificationPanel} aria-labelledby="auth-verification-heading">
      <div>
        <h2 className={styles.verificationHeading} id="auth-verification-heading">
          {copy.heading}
        </h2>
        <p className={statusClass}>{copy.message}</p>
        {copy.helper ? <p className={styles.verificationMessage}>{copy.helper}</p> : null}
      </div>
      <form className={styles.verificationForm} method="post" action={resendAction}>
        {resendFormToken ? <input type="hidden" name="formToken" value={resendFormToken} /> : null}
        <div className={styles.verificationInputRow}>
          <label className={styles.label} htmlFor="auth-verification-email">
            Email address
          </label>
          <input
            id="auth-verification-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className={styles.input}
            defaultValue={defaultEmail}
            disabled={isDisabled}
            aria-required="true"
          />
        </div>
        <button
          type="submit"
          className={`${styles.primaryButton} ${styles.verificationButton}`}
          disabled={isDisabled}
        >
          Resend verification email
        </button>
        <p className={styles.verificationStatusNote}>
          We send at most one verification email every 10 minutes to prevent abuse.
        </p>
        {isDisabled ? (
          <p className={`${styles.verificationStatusNote} ${styles.statusError}`}>
            Verification resends are temporarily unavailable while security tokens are missing.
          </p>
        ) : null}
      </form>
    </section>
  );
}
