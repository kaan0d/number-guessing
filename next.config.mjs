// PAGES_BASE_PATH set (GitHub Pages build): static export under that sub-path.
// Unset: normal server build for `node server.mjs`, relay on the same host.
const basePath = process.env.PAGES_BASE_PATH ?? ''

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(basePath && { output: 'export', basePath, trailingSlash: true }),
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
}

export default nextConfig
