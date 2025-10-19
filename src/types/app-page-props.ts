/**
 * Helpers for typing Next.js App Router page components.
 *
 * Next.js 15 removed the `PageProps` export from the public `next` entry point.
 * These utilities provide a small, typed surface that mirrors the runtime
 * contract while allowing individual pages to tighten their search parameter
 * definitions as needed.
 */

export type AppPageSearchParams = Record<string, string | string[] | undefined>;

export type AsyncSearchParams<TSearchParams extends AppPageSearchParams = AppPageSearchParams> =
  | TSearchParams
  | Promise<TSearchParams>;

export interface AppPageProps<
  TSearchParams extends AppPageSearchParams = AppPageSearchParams,
  TParams = Record<string, string | string[] | undefined>,
> {
  params?: TParams;
  searchParams?: AsyncSearchParams<TSearchParams>;
}

export type ResolvedSearchParams<TProps extends { searchParams?: unknown }> = NonNullable<
  Awaited<TProps['searchParams']>
>;
