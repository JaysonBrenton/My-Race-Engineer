/**
 * Filename: src/types/app-page-props.ts
 * Purpose: Provide shared App Router page prop typings aligned with Next.js 15 expectations.
 * Author: Jayson Brenton
 * Date: 2025-10-19
 * License: MIT License
 */

export type AppPageRouteParams = Record<string, string | string[] | undefined>;

export type AppPageSearchParams = Record<string, string | string[] | undefined>;

export type AppPageParams<
  TParams extends AppPageRouteParams = AppPageRouteParams,
> = Promise<TParams>;

export type AppPageSearchParamsPromise<
  TSearchParams extends AppPageSearchParams = AppPageSearchParams,
> = Promise<TSearchParams>;

export interface AppPageProps<
  TParams extends AppPageRouteParams = AppPageRouteParams,
  TSearchParams extends AppPageSearchParams = AppPageSearchParams,
> {
  params?: AppPageParams<TParams>;
  searchParams?: AppPageSearchParamsPromise<TSearchParams>;
}

export type ResolvedSearchParams<TProps extends { searchParams?: unknown }> = NonNullable<
  Awaited<TProps['searchParams']>
>;
