/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // MCUE: the browser driver + pixel pipeline are server-only packages —
  // never bundle them into route output (Next 14 key).
  experimental: {
    serverComponentsExternalPackages: ["playwright-core", "pixelmatch", "pngjs"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Optional runtime-loaded dependency (serverless chromium variant) —
      // the engine feature-detects it with a guarded dynamic import, so it
      // must not be resolved/bundled at build time.
      config.externals = config.externals ?? [];
      config.externals.push({ "@sparticuz/chromium": "commonjs @sparticuz/chromium" });
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
