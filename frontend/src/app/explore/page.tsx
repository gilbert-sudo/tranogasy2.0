import { Metadata } from 'next';
import TranogasyFeed from '@/components/feed/TranogasyFeed';

export const metadata: Metadata = {
  title: 'TranoFeed - Explorer les Propriétés | TranoGasy',
  description: 'Découvrez les biens immobiliers à Madagascar dans un format immersif façon TikTok.',
};

export default function ExplorePage() {
  return (
    <div className="w-full h-full bg-black">
      <TranogasyFeed />
    </div>
  );
}
