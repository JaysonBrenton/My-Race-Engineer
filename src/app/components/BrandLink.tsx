'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
    <Link href="/" className="app-header__brand">
      My Race Engineer
    </Link>
  );
}
