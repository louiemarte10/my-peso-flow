import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // myPesoFlow is fully dynamic (your own ledger behind a login), so data flows
  // through Route Handlers which are dynamic by default.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
