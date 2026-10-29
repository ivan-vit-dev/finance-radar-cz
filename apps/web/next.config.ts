import type { NextConfig } from "next";

// Hostováno na Vercelu. Data čte klient přímo z Firestore,
// backend (sběr dat, AI pipeline) tvoří Firebase Cloud Functions.
const nextConfig: NextConfig = {
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
