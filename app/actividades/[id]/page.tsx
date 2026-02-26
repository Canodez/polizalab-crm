import ActivityDetailClient from './ActivityDetailClient';

// Static export: generates a single shell page at /actividades/_/.
// All real activity detail pages are rendered client-side from any path.
// Direct URL access on hard refresh requires CloudFront 404→200 → /index.html.
export function generateStaticParams(): Array<{ id: string }> {
  return [{ id: '_' }];
}

export default function ActivityDetailPage() {
  return <ActivityDetailClient />;
}
