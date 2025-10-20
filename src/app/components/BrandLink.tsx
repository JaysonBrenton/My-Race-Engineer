/**
 * Author: Jayson Brenton + The Brainy One
 * Date: 2025-10-20
 * Purpose: Centralize header brand link around typed home route.
 * License: MIT
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ROUTE_HOME } from '@/app/routes';

export function BrandLink() {
  const pathname = usePathname();
  const isHome = pathname === '/' || pathname === '';

  if (isHome) {
    return (
      <span className="app-header__brand" aria-current="page">
        My Race Engineer
      </span>
    );
  }

  return (
    <Link href={ROUTE_HOME} className="app-header__brand">
      My Race Engineer
    </Link>
  );
}
