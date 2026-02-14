import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  reactCompiler: true,
  images: {
    unoptimized: true, // Required for static export
  },
  // Disable features not supported in static export
  trailingSlash: true,
};

export default nextConfig;
