import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  reactCompiler: true,
  trailingSlash: true, // Forces directory-based routing (register/index.html)
  images: {
    unoptimized: true, // Required for static export
  },
};

export default nextConfig;
