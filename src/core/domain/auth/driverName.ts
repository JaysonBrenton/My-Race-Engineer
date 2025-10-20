/**
 * Produces the canonical driver-name key used for case-insensitive comparisons.
 */
export const normaliseDriverName = (value: string): string => value.trim().toLowerCase();
