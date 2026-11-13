import Header from '@/components/Header';

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col w-full h-[100dvh] -mb-16 md:-mb-24 lg:-mb-8 overflow-hidden bg-white dark:bg-zinc-900">
      <div className="shrink-0 w-full">
        <Header />
      </div>
      <div className="w-full h-[calc(100dvh-4rem)] shrink-0 bg-black pb-16 md:pb-20 lg:pb-0">
        {children}
      </div>
    </div>
  );
}

