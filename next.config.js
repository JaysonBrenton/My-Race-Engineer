/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  eslint: {
    dirs: ['src'],
  },
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  env: {
    TZ: process.env.TZ ?? 'Australia/Sydney',
  },
  poweredByHeader: false,
  async redirects() {
    const redirects = [
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
    ];

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      return redirects;
    }

    try {
      const canonicalUrl = new URL(appUrl);
      const canonicalHost = canonicalUrl.host;
      const apexHost = canonicalHost.replace(/^www\./, '');
      const wwwHost = canonicalHost.startsWith('www.') ? canonicalHost : `www.${canonicalHost}`;

      if (canonicalHost.startsWith('www.')) {
        redirects.push({
          source: '/:path*',
          has: [
            {
              type: 'host',
              value: apexHost,
            },
          ],
          destination: `${canonicalUrl.origin}/:path*`,
          permanent: true,
        });
      } else {
        redirects.push({
          source: '/:path*',
          has: [
            {
              type: 'host',
              value: wwwHost,
            },
          ],
          destination: `${canonicalUrl.origin}/:path*`,
          permanent: true,
        });
      }
    } catch (error) {
      console.warn('Unable to configure host redirects:', error);
    }

    return redirects;
  },
};

module.exports = nextConfig;
