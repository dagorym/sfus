import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stripTrailingSlash = (value) => value.replace(/\/$/, "");
const developmentApiOrigin = stripTrailingSlash(
  process.env.WEB_API_ORIGIN || "http://localhost:3001"
);
const internalApiOrigin = process.env.WEB_API_INTERNAL_URL
  ? stripTrailingSlash(process.env.WEB_API_INTERNAL_URL)
  : null;

const apiProxyTarget = process.env.NODE_ENV === "development" ? developmentApiOrigin : internalApiOrigin;

/**
 * Baseline Content Security Policy for all web routes.
 *
 * Allowances beyond 'self':
 *
 * script-src 'unsafe-inline':
 *   Next.js 15 injects inline scripts for hydration state (e.g. __NEXT_DATA__
 *   and server-action manifest). These cannot be nonce-scoped without a custom
 *   server. Accepted as a baseline tradeoff until a nonce/hash migration is
 *   planned; see docs/deferred-tasks.md (CSP nonce hardening).
 *
 * style-src 'unsafe-inline':
 *   Next.js 15 injects inline styles for CSS module hydration and critical
 *   path rendering. Like script-src, these cannot be nonce-scoped without a
 *   custom server. Accepted under the same baseline tradeoff.
 *
 * connect-src http://localhost:3001 (development only):
 *   In hybrid-dev mode the browser makes direct XHR/fetch calls to the local
 *   API origin before the Next.js proxy rewrites are in place (e.g. during
 *   HMR and early page loads). Allowing localhost:3001 as a connect-src target
 *   prevents CSP violations in development without affecting production, where
 *   this value is omitted.
 *
 * img-src data::
 *   markdown-renderer.tsx uses inline data: URIs for image previews rendered
 *   from markdown content. data: URIs are required for that rendering path.
 *
 * No Swagger UI is mounted by this app; no additional CSP exception is needed.
 */
const buildCsp = () => {
  const isDev = process.env.NODE_ENV === "development";

  // In development, allow the local API origin for direct fetch/XHR connections
  // that bypass the Next.js /api proxy rewrite (e.g. during HMR).
  const connectSrc = isDev
    ? `'self' ${developmentApiOrigin}`
    : "'self'";

  const directives = [
    "default-src 'self'",
    // 'unsafe-inline' required for Next.js 15 hydration scripts; see comment above.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // data: required for markdown image preview rendering; see comment above.
    "img-src 'self' data:",
    `connect-src ${connectSrc}`,
    "font-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ];

  return directives.join("; ");
};

/**
 * Baseline security headers applied to every web route.
 *
 * No Strict-Transport-Security is emitted here: HSTS is handled at the
 * reverse-proxy (nginx) level per the locked deployment decision
 * (docs/architecture/milestone-1-foundation-decisions.md).
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: buildCsp()
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff"
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin"
  },
  {
    key: "X-Frame-Options",
    value: "DENY"
  },
  {
    // Disable all browser features that are not required by any current page.
    // Individual feature policies can be expanded here if a page requires them.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()"
  }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      }
    ];
  },
  async rewrites() {
    if (!apiProxyTarget) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
