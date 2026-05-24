/** @type {import('next').NextConfig} */
const nextConfig = {
  // Firebase Admin uses Node.js APIs — keep it server-side only
  serverExternalPackages: ['firebase-admin'],
}

export default nextConfig
