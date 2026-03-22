/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure TensorFlow.js is treated as a client-side only dependency
  // This prevents it from being bundled into serverless functions
  experimental: {
    serverComponentsExternalPackages: ['@tensorflow/tfjs', '@tensorflow/tfjs-core'],
  },
  webpack: (config, { isServer }) => {
    // TensorFlow.js should never be in server bundles
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push('@tensorflow/tfjs')
    }
    return config
  },
}

module.exports = nextConfig
