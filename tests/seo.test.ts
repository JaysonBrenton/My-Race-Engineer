import assert from 'node:assert/strict';
import test from 'node:test';

const originalAppUrl = process.env.APP_URL;
const originalNextPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalNextPublicBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
const originalPort = process.env.PORT;

test.beforeEach(() => {
  process.env.APP_URL = 'https://example.com';
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_BASE_URL;
  if (originalPort === undefined) {
    delete process.env.PORT;
  } else {
    process.env.PORT = originalPort;
  }
});

test.after(() => {
  if (originalAppUrl === undefined) {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = originalAppUrl;
  }

  if (originalNextPublicAppUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = originalNextPublicAppUrl;
  }

  if (originalNextPublicBaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_BASE_URL = originalNextPublicBaseUrl;
  }

  if (originalPort === undefined) {
    delete process.env.PORT;
  } else {
    process.env.PORT = originalPort;
  }
});

test('absUrl returns absolute URLs using APP_URL as base', { concurrency: false }, async () => {
  const { absUrl, __resetAppUrlCacheForTests } = await import('../src/lib/seo');
  __resetAppUrlCacheForTests();
  assert.equal(absUrl('/docs'), 'https://example.com/docs');
  assert.equal(absUrl('about'), 'https://example.com/about');
});

test(
  'absUrl falls back to NEXT_PUBLIC_BASE_URL when APP_URL is missing',
  { concurrency: false },
  async () => {
    const { absUrl, __resetAppUrlCacheForTests } = await import('../src/lib/seo');
    delete process.env.APP_URL;
    process.env.NEXT_PUBLIC_BASE_URL = 'https://fallback.example.com';
    __resetAppUrlCacheForTests();
    assert.equal(absUrl('/docs'), 'https://fallback.example.com/docs');
    assert.equal(absUrl('about'), 'https://fallback.example.com/about');
  },
);

test(
  'absUrl falls back to NEXT_PUBLIC_APP_URL for legacy environments',
  { concurrency: false },
  async () => {
    const { absUrl, __resetAppUrlCacheForTests } = await import('../src/lib/seo');
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://legacy.example.com';
    __resetAppUrlCacheForTests();
    assert.equal(absUrl('/docs'), 'https://legacy.example.com/docs');
    assert.equal(absUrl('about'), 'https://legacy.example.com/about');
  },
);

test(
  'absUrl falls back to default localhost origin when no URLs are configured',
  { concurrency: false },
  async () => {
    const { absUrl, __resetAppUrlCacheForTests } = await import('../src/lib/seo');
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.PORT = '4321';
    __resetAppUrlCacheForTests();
    assert.equal(absUrl('/docs'), 'http://localhost:4321/docs');
    assert.equal(absUrl(''), 'http://localhost:4321/');
  },
);

test('canonicalFor defaults to the homepage', { concurrency: false }, async () => {
  const { canonicalFor, __resetAppUrlCacheForTests } = await import('../src/lib/seo');
  __resetAppUrlCacheForTests();
  assert.equal(canonicalFor(), 'https://example.com/');
});

test('sitemap includes the homepage with canonical origin', { concurrency: false }, async () => {
  const { __resetAppUrlCacheForTests } = await import('../src/lib/seo');
  __resetAppUrlCacheForTests();
  const sitemapModule = await import('../src/app/sitemap');
  const entries = sitemapModule.default();
  assert.equal(entries[0]?.url, 'https://example.com/');
});

test(
  'robots.txt references the sitemap and disallows sensitive paths',
  { concurrency: false },
  async () => {
    const { __resetAppUrlCacheForTests } = await import('../src/lib/seo');
    __resetAppUrlCacheForTests();
    const robotsModule = await import('../src/app/robots.txt/route');
    const response = robotsModule.GET();
    const body = await response.text();

    assert.ok(body.includes('Sitemap: https://example.com/sitemap.xml'));
    assert.ok(body.includes('Disallow: /api/web-vitals'));
  },
);
