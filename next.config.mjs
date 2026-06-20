/** @type {import('next').NextConfig} */
const nextConfig = {
  // Firebase Admin uses Node.js APIs — keep it server-side only.
  // (Renamed from experimental.serverComponentsExternalPackages in Next 15+.)
  // TODO: remove once firebase-admin is replaced by the Turso/libSQL client.
  serverExternalPackages: ['firebase-admin'],
}

export default nextConfig
