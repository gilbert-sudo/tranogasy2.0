import TikTokSkeleton from '@/components/feed/TikTokSkeleton';

// Shown instantly when navigating to /explore while the server fetches the feed.
// Also lets Next.js partially prefetch this dynamic route.
export default function ExploreLoading() {
  return (
    <div className="w-full h-full bg-black">
      <TikTokSkeleton />
    </div>
  );
}
