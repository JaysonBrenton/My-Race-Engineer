/**
 * Project: My Race Engineer
 * File: src/core/app/connectors/liverc/client.ts
 * Summary: HTTP client responsible for fetching LiveRC HTML and JSON resources.
 */

const DEFAULT_USER_AGENT = 'MyRaceEngineer.LiveRcClient/0.1 (+https://myraceengineer.example)';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_RETRY_DELAY_MS = 750;
const DEFAULT_MAX_RETRY_DELAY_MS = 5_000;
const DEFAULT_JITTER_RATIO = 0.35;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 1_000;

/**
 * Base origin used for LiveRC HTML pages when callers supply relative paths. The
 * upstream service now serves canonical content from live.liverc.com, so we
 * mirror that domain to ensure generated URLs align with production data.
 */
const DEFAULT_BASE_ORIGIN = 'https://live.liverc.com/';

const DEFAULT_FALLBACK_PATTERNS: readonly RegExp[] = [
  /<link[^>]+rel=["']canonical["'][^>]*href=["'](?<url>[^"']+)["']/i,
  /<meta[^>]+property=["']og:url["'][^>]*content=["'](?<url>[^"']+)["']/i,
  /data-json-url=["'](?<url>[^"']+)["']/i,
];

export type LiveRcClientConfig = {
  /**
   * Base origin used when callers provide relative URLs (defaults to https://live.liverc.com/).
   */
  baseOrigin?: string;
  /**
   * Minimum time (in milliseconds) between upstream requests. Defaults to 1 second.
   */
  minRequestIntervalMs?: number;
  /**
   * Maximum number of retry attempts for transient failures. Defaults to 3.
   */
  maxRetries?: number;
  /**
   * Initial delay (in milliseconds) used for exponential backoff. Defaults to 750ms.
   */
  initialRetryDelayMs?: number;
  /**
   * Upper bound (in milliseconds) for exponential backoff delays. Defaults to 5 seconds.
   */
  maxRetryDelayMs?: number;
  /**
   * Ratio applied to calculate randomised jitter for backoff delays. Defaults to 35%.
   */
  jitterRatio?: number;
  /**
   * Custom fetch implementation used for requests. Defaults to the global fetch.
   */
  fetchImpl?: typeof fetch;
  /**
   * User agent string attached to upstream requests.
   */
  userAgent?: string;
};

export type LiveRcClient = {
  getRootTrackList(): Promise<string>;
  getClubEventsPage(liveRcSubdomain: string): Promise<string>;
  getEventOverview(urlOrRef: string): Promise<string>;
  getSessionPage(urlOrRef: string): Promise<string>;
  resolveJsonUrlFromHtml(html: string, fallbackPatterns?: string[]): string | null;
  fetchJson<T>(jsonUrl: string): Promise<T>;
};

export class HttpLiveRcClient implements LiveRcClient {
  private readonly config: Required<Omit<LiveRcClientConfig, 'fetchImpl'>> & {
    fetchImpl: typeof fetch;
  };

  private nextAllowedAt = 0;

  private queue: Promise<void> = Promise.resolve();

  constructor(config: LiveRcClientConfig = {}) {
    this.config = {
      baseOrigin: config.baseOrigin ?? DEFAULT_BASE_ORIGIN,
      minRequestIntervalMs: config.minRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
      initialRetryDelayMs: config.initialRetryDelayMs ?? DEFAULT_INITIAL_RETRY_DELAY_MS,
      maxRetryDelayMs: config.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS,
      jitterRatio: config.jitterRatio ?? DEFAULT_JITTER_RATIO,
      userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
      fetchImpl: config.fetchImpl ?? fetch,
    };
  }

  async getRootTrackList(): Promise<string> {
    // The track directory lives at the root of live.liverc.com, so resolve the
    // configured base origin and fetch the page verbatim.
    const url = this.resolveAbsoluteUrl('/');
    const response = await this.fetchWithRetry(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': this.config.userAgent,
      },
      cache: 'no-store',
    });

    return response.text();
  }

  async getClubEventsPage(liveRcSubdomain: string): Promise<string> {
    const subdomain = liveRcSubdomain.trim();
    if (!subdomain) {
      throw new LiveRcClientError('LiveRC subdomain is required to fetch club events.', {
        code: 'INVALID_SUBDOMAIN',
      });
    }

    const originHost = /\.liverc\.com$/i.test(subdomain) ? subdomain : `${subdomain}.liverc.com`;
    const origin = `https://${originHost.replace(/\/+$/, '')}`;
    const url = `${origin}/events/`;

    // Club event listings live under the club subdomain rather than the root
    // LiveRC domain, so avoid the base origin helper here to preserve the host.
    const response = await this.fetchWithRetry(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': this.config.userAgent,
      },
      cache: 'no-store',
    });

    return response.text();
  }

  async getEventOverview(urlOrRef: string): Promise<string> {
    const url = this.resolveAbsoluteUrl(urlOrRef);
    const response = await this.fetchWithRetry(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': this.config.userAgent,
      },
      cache: 'no-store',
    });

    return response.text();
  }

  async getSessionPage(urlOrRef: string): Promise<string> {
    const url = this.resolveAbsoluteUrl(urlOrRef);
    const response = await this.fetchWithRetry(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': this.config.userAgent,
      },
      cache: 'no-store',
    });

    return response.text();
  }

  resolveJsonUrlFromHtml(html: string, fallbackPatterns?: string[]): string | null {
    const linkHref = this.findAlternateJsonLink(html);
    if (linkHref) {
      return this.normaliseCandidateUrl(linkHref);
    }

    const patterns: RegExp[] = [
      ...DEFAULT_FALLBACK_PATTERNS,
      ...(fallbackPatterns?.map((pattern) => new RegExp(pattern, 'i')) ?? []),
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(html);
      if (!match) {
        continue;
      }

      const candidate = (match.groups?.url ?? match[1])?.trim();
      if (!candidate) {
        continue;
      }

      const normalised = this.normaliseCandidateUrl(candidate);
      if (normalised) {
        return normalised;
      }
    }

    return null;
  }

  async fetchJson<T>(jsonUrl: string): Promise<T> {
    const response = await this.fetchWithRetry(jsonUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': this.config.userAgent,
      },
      cache: 'no-store',
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new LiveRcClientError('LiveRC responded with a non-JSON payload.', {
        url: jsonUrl,
        status: response.status,
        code: 'INVALID_CONTENT_TYPE',
        details: { contentType },
      });
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new LiveRcClientError('Failed to parse JSON response from LiveRC.', {
        url: jsonUrl,
        status: response.status,
        code: 'JSON_PARSE_FAILURE',
        details: { cause: serializeError(error) },
      });
    }
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.config.maxRetries) {
      try {
        const response = await this.executeWithRateLimit(() =>
          this.config.fetchImpl(url, {
            ...init,
            headers: new Headers(init.headers),
          }),
        );

        if (this.shouldRetryResponse(response)) {
          lastError = new LiveRcClientError('LiveRC responded with a retryable status.', {
            url,
            status: response.status,
            code: 'RETRYABLE_STATUS',
            details: { statusText: response.statusText },
          });

          await this.delay(this.computeDelayMs(attempt, response));
          attempt += 1;
          continue;
        }

        if (!response.ok) {
          throw new LiveRcClientError('LiveRC responded with an error status.', {
            url,
            status: response.status,
            code: 'HTTP_ERROR',
            details: { statusText: response.statusText },
          });
        }

        return response;
      } catch (error) {
        const parsedError = error instanceof LiveRcClientError ? error : serializeError(error);
        lastError = parsedError;

        if (error instanceof LiveRcClientError && error.code === 'HTTP_ERROR') {
          throw error;
        }

        if (attempt >= this.config.maxRetries) {
          break;
        }

        await this.delay(this.computeDelayMs(attempt));
        attempt += 1;
      }
    }

    throw new LiveRcClientError('Failed to contact LiveRC after retries.', {
      url,
      code: 'MAX_RETRIES_EXCEEDED',
      details: { lastError },
    });
  }

  private async executeWithRateLimit<T>(operation: () => Promise<T>): Promise<T> {
    let release: () => void = () => {};
    const previous = this.queue;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      const waitMs = Math.max(0, this.nextAllowedAt - Date.now());
      if (waitMs > 0) {
        await this.delay(waitMs);
      }

      const result = await operation();
      this.nextAllowedAt = Date.now() + this.config.minRequestIntervalMs;
      return result;
    } finally {
      release();
    }
  }

  private shouldRetryResponse(response: Response): boolean {
    if (response.status === 429) {
      return true;
    }

    if (response.status >= 500 && response.status < 600) {
      return true;
    }

    return false;
  }

  private computeDelayMs(attempt: number, response?: Response): number {
    const retryAfterHeader = response?.headers.get('retry-after');
    const retryAfterMs = retryAfterHeader ? parseRetryAfter(retryAfterHeader) : 0;
    if (retryAfterMs > 0) {
      return retryAfterMs;
    }

    const exponentialDelay = Math.min(
      this.config.maxRetryDelayMs,
      this.config.initialRetryDelayMs * 2 ** attempt,
    );
    const jitter = exponentialDelay * this.config.jitterRatio * Math.random();

    return Math.round(exponentialDelay + jitter);
  }

  private delay(durationMs: number): Promise<void> {
    if (durationMs <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      setTimeout(resolve, durationMs);
    });
  }

  private resolveAbsoluteUrl(urlOrRef: string): string {
    const trimmed = urlOrRef.trim();
    if (!trimmed) {
      throw new LiveRcClientError('LiveRC request URL cannot be empty.', {
        code: 'EMPTY_URL',
      });
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    if (trimmed.startsWith('//')) {
      return `https:${trimmed}`;
    }

    const base = this.config.baseOrigin.replace(/\/+$/, '');

    if (trimmed.startsWith('/')) {
      return `${base}${trimmed}`;
    }

    return `${base}/${trimmed}`;
  }

  private findAlternateJsonLink(html: string): string | null {
    const linkRegex = /<link\b[^>]*>/gi;
    const matches = html.match(linkRegex) ?? [];

    for (const linkTag of matches) {
      const rel = extractAttribute(linkTag, 'rel');
      if (!rel || !/\balternate\b/i.test(rel)) {
        continue;
      }

      const type = extractAttribute(linkTag, 'type');
      if (type && !/application\/json/i.test(type)) {
        continue;
      }

      const href = extractAttribute(linkTag, 'href');
      if (!href) {
        continue;
      }

      return href;
    }

    return null;
  }

  private normaliseCandidateUrl(candidate: string): string | null {
    if (!candidate) {
      return null;
    }

    const trimmed = candidate.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith('//')) {
      return `https:${trimmed}`;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      if (/\.json(\?|$)/i.test(trimmed)) {
        return trimmed;
      }

      return appendJsonSuffix(trimmed);
    }

    // Relative URLs cannot be resolved without additional context.
    return null;
  }
}

export class LiveRcClientError extends Error {
  readonly code?: string;

  readonly status?: number;

  readonly url?: string;

  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number;
      url?: string;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = 'LiveRcClientError';
    this.code = options.code;
    this.status = options.status;
    this.url = options.url;
    this.details = options.details;
  }
}

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }

  return { message: String(error) };
};

const parseRetryAfter = (headerValue: string): number => {
  const trimmed = headerValue.trim();
  if (!trimmed) {
    return 0;
  }

  const numericDelay = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(numericDelay)) {
    return Math.max(0, numericDelay * 1_000);
  }

  const date = Number.isNaN(Date.parse(trimmed)) ? null : new Date(trimmed);
  if (!date) {
    return 0;
  }

  const delta = date.getTime() - Date.now();
  return delta > 0 ? delta : 0;
};

export const appendJsonSuffix = (url: string): string => {
  const [base, query = ''] = url.split('?');
  const stripped = base.replace(/\/+$/, '');
  const hasJsonSuffix = stripped.toLowerCase().endsWith('.json');
  const withSuffix = hasJsonSuffix ? stripped : `${stripped}.json`;
  return query ? `${withSuffix}?${query}` : withSuffix;
};

const extractAttribute = (tag: string, attribute: string): string | null => {
  const pattern = new RegExp(`${attribute}\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\s\"'>]+))`, 'i');
  const match = tag.match(pattern);
  if (!match) {
    return null;
  }

  return match[2] ?? match[3] ?? match[4] ?? null;
};
