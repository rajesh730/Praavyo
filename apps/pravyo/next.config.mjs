/** @type {import('next').NextConfig} */
const deploymentId =
  process.env.NEXT_DEPLOYMENT_ID ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.DEPLOYMENT_VERSION ||
  process.env.GITHUB_SHA ||
  process.env.GIT_COMMIT_SHA ||
  (process.env.NODE_ENV === 'development' ? `dev-${process.pid}` : undefined);

const nextConfig = {
  // Keep open tabs on the same client/server build. Next.js forces a full
  // navigation when a tab's deployment ID no longer matches the server.
  deploymentId,

  // Workspace packages ship untranspiled ESM/JSX.
  transpilePackages: ['@pravyo/db', '@pravyo/auth', '@pravyo/cas', '@pravyo/core', '@pravyo/ui'],
  // Enable compression for faster response times
  compress: true,

  // Enable React strict mode for development
  reactStrictMode: true,

  // Image optimization
  images: {
    formats: ["image/avif", "image/webp"],
  },

  // Tree-shake large icon libraries so each route ships only the icons it uses
  // (react-icons/fa is imported in ~90 files). Smaller bundles = faster loads,
  // especially on mobile, plus faster dev compiles.
  experimental: {
    optimizePackageImports: ["react-icons", "react-icons/fa", "react-icons/fi"],
  },

  // Production optimizations
  poweredByHeader: false, // Remove X-Powered-By header for security

  // The dev-only route indicator defaults to bottom-left, where it covers the
  // sidebar's Log out button on every dashboard.
  devIndicators: { position: 'bottom-right' },

  async redirects() {
    return [
      {
        source: "/challenges",
        destination: "/events",
        permanent: false,
      },
    ];
  },

  // Baseline security headers applied to every response. (A full CSP is left
  // out deliberately — it needs per-app tuning and can break inline scripts,
  // EventSource, and external images.)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Permissions-Policy",
            // Parent card scanning and voice messages use first-party media
            // capture. `self` lets our pages request access while the browser
            // still requires an explicit user permission prompt. Third-party
            // origins and embedded content remain blocked.
            value: "camera=(self), microphone=(self), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            // Conservative CSP: locks down base-uri/object/frame-ancestors (the
            // high-value, low-breakage directives) while leaving script/style
            // permissive because Next.js relies on inline runtime scripts.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "frame-ancestors 'self'",
              // School location maps (lib/googleMapEmbed.js) are Google embeds.
              "frame-src 'self' https://www.google.com",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https:",
              "style-src 'self' 'unsafe-inline' https:",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "connect-src 'self' https: wss:",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
