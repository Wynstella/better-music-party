/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Build previews separately so a running room never serves a partially replaced build.
  distDir: process.env.MUSICPARTY_DIST_DIR || '.next',
  ...(process.env.MUSICPARTY_STANDALONE === '1' ? { output: 'standalone' } : {}),
}

module.exports = nextConfig
