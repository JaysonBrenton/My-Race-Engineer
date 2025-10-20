/**
 * Author: Jayson Brenton + The Brainy One
 * Date: 2025-10-20
 * Purpose: Redirect auth index to the login route with typed safety.
 * License: MIT
 */

import type { Route } from 'next';
import { redirect } from 'next/navigation';

import { ROUTE_LOGIN } from '@/app/routes';

export default function AuthIndexPage() {
  const target: Route = ROUTE_LOGIN;
  redirect(target);
}
