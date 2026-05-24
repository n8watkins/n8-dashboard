/** @type {import('next').NextConfig} */
const nextConfig = {
  // Firebase Admin uses Node.js APIs — keep it server-side only
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin'],
  },
}

export default nextConfig
