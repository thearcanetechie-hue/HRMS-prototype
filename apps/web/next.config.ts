import type { NextConfig } from 'next';
import path from 'node:path';

// Read at build time: rewrites are baked into the build, so Docker passes it as a build arg.
const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  poweredByHeader: false,
  transpilePackages: ['@hrms/shared'],
  // The browser only talks to this origin; /api/* is proxied to the NestJS API,
  // which keeps the refresh cookie first-party and avoids CORS in production.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
