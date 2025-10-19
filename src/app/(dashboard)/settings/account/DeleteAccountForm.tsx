'use client';

import { useEffect, useRef, useState } from 'react';

import styles from './page.module.css';

type DeleteAccountFormProps = {
  deleteAccountAction: (formData: FormData) => Promise<void>;
};

export function DeleteAccountForm({ deleteAccountAction }: DeleteAccountFormProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const warningRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isConfirming) {
      warningRef.current?.focus();
    }
  }, [isConfirming]);

  const handleSubmit = () => {
    setIsSubmitting(true);
  };

  const handleRequestConfirmation = () => {
    setIsConfirming(true);
  };

  const handleCancelConfirmation = () => {
    setIsConfirming(false);
    setIsSubmitting(false);
  };

  return (
    <form className={styles.deleteForm} action={deleteAccountAction} onSubmit={handleSubmit}>
      <p className={styles.confirmationPrompt}>
        To continue, select <strong>Delete account</strong>. You will be redirected to the sign-in
        page once complete.
      </p>

      {isConfirming ? (
        <>
          <div
            className={styles.warningMessage}
            role="alert"
            tabIndex={-1}
            ref={warningRef}
            aria-live="assertive"
          >
            <h3 className={styles.warningTitle}>Confirm account deletion</h3>
            <p className={styles.warningText}>
              Deleting your account will permanently remove all telemetry history and immediately
              sign you out on every device. This action cannot be undone.
            </p>
          </div>
          <div className={styles.warningActions}>
            <button type="submit" className={styles.deleteButton} disabled={isSubmitting}>
              {isSubmitting ? 'Deleting account…' : 'Yes, delete my account'}
            </button>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={handleCancelConfirmation}
              disabled={isSubmitting}
            >
              Keep my account
            </button>
          </div>
        </>
      ) : (
        <button type="button" className={styles.deleteButton} onClick={handleRequestConfirmation}>
          Delete account
        </button>
      )}
    </form>
  );
}
