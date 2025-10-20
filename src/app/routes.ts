/**
 * Author: Jayson Brenton + The Brainy One
 * Date: 2025-10-20
 * Purpose: Centralize typed route helpers for auth navigation.
 * License: MIT
 */

import type { Route } from 'next';

/**
 * Ensure every exported route helper satisfies Next.js typed routes.
 */
export const ROUTE_HOME: Route = '/';
export const ROUTE_LOGIN: Route = '/auth/login';

export function loginWithStatus(status: 'logout' | 'reset' | 'verify'): Route {
  return (`${ROUTE_LOGIN}?status=${status}`) as Route; // safe: fixed base + constrained status
}
