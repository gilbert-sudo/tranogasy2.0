import { Metadata } from 'next';
import TranogasyFeed from '@/components/feed/TranogasyFeed';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'TranoFeed - Explorer les Propriétés | TranoGasy',
  description: 'Découvrez les biens immobiliers à Madagascar dans un format immersif façon TikTok.',
};

async function getInitialProperties() {
  try {
    const rawUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const apiUrl = rawUrl.replace(/\/$/, '');

    // Add a strict 3-second timeout so Vercel builds or slow backends never hang the worker
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${apiUrl}/properties?page=1&limit=10`, {
      cache: 'no-store',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.properties || [];
  } catch (error) {
    // If backend is unreachable or during Vercel build, gracefully fallback to client-side fetch in TranogasyFeed
    return [];
  }
}

export default async function ExplorePage() {
  const initialProperties = await getInitialProperties();

  return (
    <div className="w-full h-full bg-black">
      <TranogasyFeed initialProperties={initialProperties} />
    </div>
  );
}
