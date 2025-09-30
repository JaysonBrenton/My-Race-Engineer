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
};

module.exports = nextConfig;
