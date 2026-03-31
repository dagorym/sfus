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

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../../"),
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
