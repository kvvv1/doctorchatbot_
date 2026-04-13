import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'better-sqlite3',
    'googleapis',
    'ical-generator',
    'lightningcss',
    'mercadopago',
    'stripe',
  ],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
