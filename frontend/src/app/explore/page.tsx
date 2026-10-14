import { Metadata } from 'next';
import TranogasyFeed from '@/components/feed/TranogasyFeed';

export const metadata: Metadata = {
  title: 'TranoFeed - Explorer les Propriétés | TranoGasy',
  description: 'Découvrez les biens immobiliers à Madagascar dans un format immersif façon TikTok.',
};

async function getInitialProperties() {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const res = await fetch(`${apiUrl}/properties?page=1&limit=10`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      throw new Error('Failed to fetch initial properties');
    }
    const data = await res.json();
    return data.properties || [];
  } catch (error) {
    console.error('Error fetching initial feed properties:', error);
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
