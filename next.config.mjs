/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.WAFERCLAW_DIST_DIR || ".next",
  devIndicators: { appIsrStatus: false, buildActivity: false },
  outputFileTracingExcludes: { "*": [".openclaw-sandbox/**"] },
};
export default nextConfig;
