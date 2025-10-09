/**
 * Filename: src/app/(auth)/auth/register/register-form.tsx
 * Purpose: Client-side wrapper that binds the registration server action to the form while preserving field values on errors.
 * Author: Jayson Brenton
 * Date: 2025-03-18
 * License: MIT License
 */

'use client';

import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';

import styles from '../auth.module.css';
import type { RegisterActionState } from './state';

type RegisterFormProps = {
  action: (previousState: RegisterActionState, formData: FormData) => Promise<RegisterActionState>;
  initialState: RegisterActionState;
  formToken: string | null;
};

const getStatusClassName = (tone: RegisterActionState['status']['tone']) => {
  switch (tone) {
    case 'error':
      return `${styles.statusRegion} ${styles.statusError}`;
    case 'success':
      return `${styles.statusRegion} ${styles.statusSuccess}`;
    default:
      return styles.statusRegion;
  }
};

export function RegisterForm({ action, initialState, formToken }: RegisterFormProps) {
  const [state, formAction] = useFormState(action, initialState);
  const inlineBannerMessage =
    state.errorCode && state.status.tone === 'error' ? state.status.message : null;
  const formKey = `${state.values.name}|${state.values.email}|${state.status.tone}|${state.status.message}`;

  return (
    <form
      key={formKey}
      className={styles.form}
      method="post"
      action={formAction}
      aria-describedby="auth-register-status"
    >
      <FormFields formToken={formToken} state={state} inlineBannerMessage={inlineBannerMessage} />
    </form>
  );
}

type FormFieldsProps = {
  formToken: string | null;
  state: RegisterActionState;
  inlineBannerMessage: string | null;
};

const FormFields = ({ formToken, state, inlineBannerMessage }: FormFieldsProps) => {
  const { pending } = useFormStatus();
  const isFormDisabled = !formToken || pending;

  return (
    <>
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
          defaultValue={state.values.name}
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
          defaultValue={state.values.email}
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
        <SubmitButton disabled={!formToken} />
        <Link className={styles.secondaryLink} href="/auth/login">
          Already have an account? Sign in
        </Link>
      </div>
      <p
        className={getStatusClassName(state.status.tone)}
        id="auth-register-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {state.status.message}
      </p>
    </>
  );
};

type SubmitButtonProps = { disabled: boolean };

const SubmitButton = ({ disabled }: SubmitButtonProps) => {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={styles.primaryButton} disabled={disabled || pending}>
      Create account
    </button>
  );
};
