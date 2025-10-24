import type { ReactNode } from 'react';

import { requireAuthenticatedUser } from '@/lib/auth/serverSession';

type DashboardLayoutProps = {
  children: ReactNode;
};

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  await requireAuthenticatedUser();
  return <>{children}</>;
}
