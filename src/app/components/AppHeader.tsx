/**
 * Author: Jayson Brenton + The Brainy One
 * Date: 2025-10-20
 * Purpose: Ensure header navigation leverages typed routes for settings access.
 * License: MIT
 */

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';

import { logout } from '@/app/actions/logout';

import { BrandLink } from './BrandLink';

const HIDDEN_EXACT_PATHS = new Set(['', '/']);
const HIDDEN_PREFIXES = ['/auth'];
const SETTINGS_ACCOUNT_ROUTE: Route = '/settings/account' as Route; // safe: canonical settings page

export interface AppHeaderProps {
  isAuthenticated: boolean;
}

export function AppHeader({ isAuthenticated }: AppHeaderProps) {
  const pathname = usePathname();

  const shouldHideHeader = useMemo(() => {
    if (!pathname) {
      return false;
    }

    const normalizedPath =
      pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;

    if (HIDDEN_EXACT_PATHS.has(normalizedPath)) {
      return true;
    }

    return HIDDEN_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix));
  }, [pathname]);

  if (shouldHideHeader) {
    return null;
  }

  return (
    <header className="app-header" aria-label="Primary">
      <div className="app-header__inner">
        <BrandLink />
        {isAuthenticated ? (
          <nav className="app-header__actions" aria-label="Account">
            <Link className="app-header__action" href={SETTINGS_ACCOUNT_ROUTE}>
              Settings
            </Link>
            <form action={logout} className="app-header__logout" aria-label="Sign out form">
              <button type="submit" className="app-header__action app-header__logoutButton">
                Sign out
              </button>
            </form>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
