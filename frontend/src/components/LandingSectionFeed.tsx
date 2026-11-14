'use client';

import TopPropertySection from '@/components/TopPropertySection';
import PropertyFeed from '@/components/PropertyFeed';
import { usePropertyStore } from '@/store/propertyStore';

interface LandingSectionFeedProps {
  initialProperties?: any[];
}

export default function LandingSectionFeed({
  initialProperties = [],
}: LandingSectionFeedProps) {
  const activeTab = usePropertyStore((state) => state.activeTab);
  const setActiveTab = usePropertyStore((state) => state.setActiveTab);
  const activeCategory = usePropertyStore((state) => state.activeCategory);
  const sortBy = usePropertyStore((state) => state.sortBy);
  const setSortBy = usePropertyStore((state) => state.setSortBy);

  return (
    <section className="w-full">
      {/* Top Property Section header with tab & sort controls */}
      <TopPropertySection
        viewAllHref={
          activeCategory !== 'all' ? `/search?category=${activeCategory}` : '/search'
        }
        activeTab={activeTab}
        sortBy={sortBy}
        onTabChange={(tab) => setActiveTab(tab)}
        onSortChange={(sort) => setSortBy(sort)}
      />

      {/* Property feed loading data with Zustand store caching */}
      <PropertyFeed
        initialProperties={initialProperties}
        filterType={activeTab}
        houseTypeFilter={activeCategory}
        sortBy={sortBy}
      />
    </section>
  );
}
