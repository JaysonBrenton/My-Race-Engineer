/**
 * Author: Jayson Brenton + The Brainy One
 * Date: 2025-10-20
 * Purpose: Route settings index visitors to the account page using typed routes.
 * License: MIT
 */

import type { Route } from 'next';
import { redirect } from 'next/navigation';

export default function SettingsIndexPage(): never {
  const target: Route = ('/settings/account') as Route; // safe: canonical settings account path
  redirect(target);
}
