import PolicyDetailClient from './PolicyDetailClient';

// Static export: generates a single shell page at /policies/_/.
// All real policy detail pages are rendered client-side from any path.
// Direct URL access on hard refresh requires CloudFront 404→200 → /index.html.
export function generateStaticParams(): Array<{ id: string }> {
  return [{ id: '_' }];
}

export default function PolicyDetailPage() {
  return <PolicyDetailClient />;
}
