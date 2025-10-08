import { createHash } from 'node:crypto';

/**
 * Produces a deterministic fingerprint suitable for logging sensitive values
 * without storing the original PII.
 */
export const createLogFingerprint = (value: string | null | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  return createHash('sha256').update(value).digest('hex');
};
