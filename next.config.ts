import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // unpdf ships a serverless PDF.js build with its own worker/WASM loading.
  // Keep it out of the bundler so the API route can load it natively.
  serverExternalPackages: ["unpdf"],
  async redirects() {
    return [
      {
        source: "/",
        destination: "/sign-in",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
