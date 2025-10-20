/**
 * Filename: src/app/(auth)/auth/login/status.ts
 * Purpose: Share login status message helpers between server actions and UI components.
 */

export type StatusTone = 'info' | 'success' | 'error';

export type StatusMessage = {
  tone: StatusTone;
  message: string;
};

export const buildStatusMessage = (
  statusCode: string | undefined,
  errorCode: string | undefined,
): StatusMessage => {
  if (statusCode === 'account-created') {
    return {
      tone: 'success',
      message: 'Account created successfully. You can now sign in with your credentials.',
    };
  }

  if (statusCode === 'verify-email') {
    return {
      tone: 'info',
      message:
        'Check your inbox for a verification link. Once confirmed, you can sign in immediately.',
    };
  }

  if (statusCode === 'verify-email-awaiting-approval') {
    return {
      tone: 'info',
      message:
        'We received your elevated access request. Verify your email and we will alert you when an administrator approves it.',
    };
  }

  if (statusCode === 'awaiting-approval') {
    return {
      tone: 'info',
      message:
        'An administrator is reviewing your elevated access request. We will notify you as soon as it is approved.',
    };
  }

  if (statusCode === 'password-reset-confirmed') {
    return {
      tone: 'success',
      message: 'Password updated successfully. Sign in with your new credentials.',
    };
  }

  switch (errorCode) {
    case 'invalid-origin':
      return {
        tone: 'error',
        message: 'Your request came from an unapproved origin.',
      };
    case 'invalid-token':
      return {
        tone: 'error',
        message: 'Your form expired. Please try again.',
      };
    case 'validation':
      return {
        tone: 'error',
        message: 'Please fix the highlighted fields.',
      };
    case 'invalid-credentials':
      return {
        tone: 'error',
        message: 'Incorrect email, driver name, or password. Try again or reset your password.',
      };
    case 'email-not-verified':
      return {
        tone: 'error',
        message:
          'Verify your email address before signing in. Check your inbox for the verification link.',
      };
    case 'server-error':
      return {
        tone: 'error',
        message: 'We were unable to sign you in. Please try again in a moment.',
      };
    case 'account-pending':
      return {
        tone: 'error',
        message:
          'Your access request is pending administrator approval. We will email you once it is ready to use.',
      };
    case 'account-suspended':
      return {
        tone: 'error',
        message:
          'This account has been suspended. Contact support if you believe this is an error.',
      };
    case 'session-expired':
      return {
        tone: 'error',
        message: 'Your session expired. Please sign in again to continue.',
      };
    case 'session-invalid':
      return {
        tone: 'error',
        message: 'Your session is no longer valid. Sign in again to resume.',
      };
    case 'rate-limited':
      return {
        tone: 'error',
        message: 'Too many sign-in attempts. Wait a few minutes before trying again.',
      };
    default:
      return {
        tone: 'info',
        message: 'Status updates will appear here during sign in.',
      };
  }
};
