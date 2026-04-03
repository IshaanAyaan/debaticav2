/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      '/api/search/meta': ['./data/evidence-index.sqlite'],
      '/api/search/cards': ['./data/evidence-index.sqlite'],
      '/api/cards/[id]': ['./data/evidence-index.sqlite'],
      '/api/cards/[id]/variants': ['./data/evidence-index.sqlite'],
    },
  },
}

export default nextConfig
