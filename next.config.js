/** @type {import('next').NextConfig} */
const devServerActions =
  process.env.NODE_ENV !== 'production'
    ? {
        allowedOrigins: ['127.0.0.1:3001', '10.211.55.13:3001', 'localhost:3001'],
      }
    : undefined;

const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream', 'pino-abstract-transport'],
  experimental: {
    ...(devServerActions ? { serverActions: devServerActions } : {}),
  },
  eslint: {
    dirs: ['src'],
  },
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  env: {
    TZ: process.env.TZ ?? 'Australia/Sydney',
    ENABLE_LIVERC_RESOLVER: process.env.ENABLE_LIVERC_RESOLVER,
    LIVERC_HTTP_BASE: process.env.LIVERC_HTTP_BASE,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'pino-pretty': 'commonjs pino-pretty',
        'thread-stream': 'commonjs thread-stream',
        'pino-abstract-transport': 'commonjs pino-abstract-transport',
      });
    }

    return config;
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
