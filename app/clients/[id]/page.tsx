import ClientDetailClient from './ClientDetailClient';

// Static export: generates a single shell page at /clients/_/.
// All real client detail pages are rendered client-side from any path.
// Direct URL access on hard refresh requires CloudFront 404→200 → /index.html.
export function generateStaticParams(): Array<{ id: string }> {
  return [{ id: '_' }];
}

export default function ClientDetailPage() {
  return <ClientDetailClient />;
}
