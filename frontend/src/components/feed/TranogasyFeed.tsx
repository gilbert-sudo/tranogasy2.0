'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronUp, ChevronDown, Check, Sparkles } from 'lucide-react';

import { FeedProperty } from './types';
import TikTokCard from './TikTokCard';
import TikTokDetailsDrawer, { TikTokDetailsSkeleton } from './TikTokDetailsDrawer';
import TikTokContactModal from './TikTokContactModal';
import TikTokMapModal from './TikTokMapModal';
import TikTokCommentsDrawer from './TikTokCommentsDrawer';
import TikTokSkeleton from './TikTokSkeleton';
import { usePropertyStore } from '@/store/propertyStore';

interface TranogasyFeedProps {
  initialProperties?: FeedProperty[];
}

export default function TranogasyFeed({ initialProperties = [] }: TranogasyFeedProps) {
  const [properties, setProperties] = useState<FeedProperty[]>(initialProperties);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scrollDirection, setScrollDirection] = useState<'down' | 'up'>('down');
  const prevIndexRef = useRef(currentIndex);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(initialProperties.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Modals state
  const [showContactModal, setShowContactModal] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState(false);
  const [showCommentsDrawer, setShowCommentsDrawer] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const addProperties = usePropertyStore((state) => state.addProperties);

  // Screen size detection for responsive desktop layout
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch initial properties if not provided
  useEffect(() => {
    if (initialProperties.length === 0) {
      const fetchInitial = async () => {
        setIsLoading(true);
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
          const res = await fetch(`${apiUrl}/properties?page=1&limit=10`);
          if (res.ok) {
            const data = await res.json();
            const fetched = data.properties || [];
            setProperties(fetched);
            addProperties(fetched);
            setHasMore(data.page < data.totalPages);
          }
        } catch (e) {
          console.error('Failed to fetch initial properties:', e);
        } finally {
          setIsLoading(false);
        }
      };
      fetchInitial();
    } else {
      addProperties(initialProperties);
    }
  }, [initialProperties, addProperties]);

  // Load more properties when approaching end of list
  const loadMoreProperties = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiUrl}/properties?page=${nextPage}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        const newProps = data.properties || [];
        if (newProps.length > 0) {
          setProperties((prev) => [...prev, ...newProps]);
          addProperties(newProps);
          setPage(nextPage);
          setHasMore(nextPage < data.totalPages);
        } else {
          setHasMore(false);
        }
      }
    } catch (e) {
      console.error('Failed to load more properties:', e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [page, hasMore, isLoadingMore, addProperties]);

  // Track scroll direction whenever currentIndex changes
  useEffect(() => {
    if (currentIndex > prevIndexRef.current) {
      setScrollDirection('down');
    } else if (currentIndex < prevIndexRef.current) {
      setScrollDirection('up');
    }
    prevIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Preload next 1-2 properties images ahead for instantaneous, flicker-free display
  useEffect(() => {
    const preloadAhead = [currentIndex + 1, currentIndex + 2];
    preloadAhead.forEach((idx) => {
      const prop = properties[idx];
      if (prop?.images && prop.images.length > 0) {
        const firstImg = typeof prop.images[0] === 'string' ? prop.images[0] : prop.images[0]?.src;
        if (firstImg) {
          const img = new Image();
          img.src = firstImg;
        }
      }
    });
  }, [currentIndex, properties]);

  // Handle scroll snap index detection
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const height = target.clientHeight;
    if (height === 0) return;
    const newIndex = Math.round(target.scrollTop / height);
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < properties.length) {
      setScrollDirection(newIndex > currentIndex ? 'down' : 'up');
      setCurrentIndex(newIndex);
    }

    // Trigger infinite scroll when near end
    if (newIndex >= properties.length - 3 && hasMore && !isLoadingMore) {
      loadMoreProperties();
    }
  };

  // Programmatic slide navigation
  const scrollToIndex = useCallback(
    (index: number) => {
      if (containerRef.current && index >= 0 && index < properties.length) {
        if (index > currentIndex) {
          setScrollDirection('down');
        } else if (index < currentIndex) {
          setScrollDirection('up');
        }
        const height = containerRef.current.clientHeight;
        containerRef.current.scrollTo({
          top: index * height,
          behavior: 'smooth',
        });
        setCurrentIndex(index);
      }
    },
    [properties.length, currentIndex]
  );

  const scrollNext = () => {
    if (currentIndex < properties.length - 1) {
      setScrollDirection('down');
      scrollToIndex(currentIndex + 1);
    }
  };

  const scrollPrev = () => {
    if (currentIndex > 0) {
      setScrollDirection('up');
      scrollToIndex(currentIndex - 1);
    }
  };

  // Keyboard navigation (ArrowUp, ArrowDown)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if any modal is open
      if (showContactModal || showMapModal || showDetailsDrawer) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setScrollDirection('down');
        scrollNext();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setScrollDirection('up');
        scrollPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, properties.length, showContactModal, showMapModal, showDetailsDrawer]);

  // Mouse wheel debounce on desktop for silky smooth 1-slide jumps
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isDesktop) return;

    const handleWheel = (e: WheelEvent) => {
      if (showContactModal || showMapModal) return;
      if (Math.abs(e.deltaY) < 30) return;

      if (isScrollingRef.current) {
        e.preventDefault();
        return;
      }

      if (e.deltaY > 0 && currentIndex < properties.length - 1) {
        e.preventDefault();
        setScrollDirection('down');
        isScrollingRef.current = true;
        scrollNext();
        setTimeout(() => {
          isScrollingRef.current = false;
        }, 500);
      } else if (e.deltaY < 0 && currentIndex > 0) {
        e.preventDefault();
        setScrollDirection('up');
        isScrollingRef.current = true;
        scrollPrev();
        setTimeout(() => {
          isScrollingRef.current = false;
        }, 500);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [isDesktop, currentIndex, properties.length, showContactModal, showMapModal]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleShare = async (property: FeedProperty) => {
    const shareUrl = `${window.location.origin}/properties/${property._id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: property.title,
          text: `Regardez cette propriété sur TranoGasy: ${property.title}`,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled share
      }
    } else {
      navigator.clipboard.writeText(shareUrl);
      showToast('Lien de la propriété copié !');
    }
  };

  const currentProperty = properties[currentIndex] || properties[0];

  if (isLoading) {
    return <TikTokSkeleton />;
  }

  if (properties.length === 0) {
    return (
      <div className="w-full h-[calc(100dvh-4rem)] md:h-[100dvh] bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <Sparkles className="w-16 h-16 text-brand-green mb-4 animate-pulse" />
        <h2 className="text-2xl font-black mb-2">Aucune annonce trouvée</h2>
        <p className="text-sm text-zinc-400 max-w-sm mb-6">
          Le flux TranoGasy est momentanément vide. Vérifiez votre connexion ou revenez dans quelques instants.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 rounded-full bg-brand-green text-white font-bold text-sm shadow-lg hover:bg-green-600 transition-transform active:scale-95"
        >
          Actualiser le flux
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100dvh-4rem)] md:h-[100dvh] bg-black text-white relative overflow-hidden select-none">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-900/90 text-white backdrop-blur-md border border-white/20 shadow-2xl text-xs font-bold animate-in fade-in slide-in-from-top-4 duration-300">
          <Check className="w-4 h-4 text-brand-green" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Container: 2-column on Desktop, full phone viewport on Mobile */}
      <div className="w-full h-full max-w-[1440px] mx-auto flex items-center justify-center lg:gap-6 xl:gap-8 lg:pl-6 lg:pr-[120px] xl:pl-8 xl:pr-[130px]">
        {/* Left Column (or single column on mobile): Reel Viewport */}
        <div className="w-full lg:w-[480px] xl:w-[500px] h-full lg:h-[calc(100dvh-40px)] relative overflow-hidden lg:rounded-[2.5rem] lg:border lg:border-white/10 lg:shadow-2xl bg-black shrink-0">
          {/* Scroll Snap Feed Container */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="w-full h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar"
            style={{
              scrollBehavior: 'smooth',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {properties.map((property, idx) => {
              // Virtual window: only mount heavy TikTokCard DOM for active slide, 1 behind and 2 ahead
              const isWithinWindow = idx >= currentIndex - 1 && idx <= currentIndex + 2;

              return (
                <div
                  key={property._id || idx}
                  className="w-full h-[calc(100dvh-4rem)] md:h-[100dvh] lg:h-[calc(100dvh-40px)] snap-start snap-always relative shrink-0 bg-black"
                >
                  {isWithinWindow ? (
                    <TikTokCard
                      property={property}
                      isActive={currentIndex === idx}
                      isDesktop={isDesktop}
                      onOpenDetails={() => setShowDetailsDrawer(true)}
                      onOpenMap={() => setShowMapModal(true)}
                      onOpenContact={() => setShowContactModal(true)}
                      onOpenComments={() => setShowCommentsDrawer(true)}
                      onShare={() => handleShare(property)}
                    />
                  ) : (
                    <div className="w-full h-full bg-black flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-brand-green/60 animate-spin" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Desktop Synchronized Details Panel + Sticking Navigation Controls */}
        {isDesktop && (
          <div className="hidden lg:flex items-center gap-3 xl:gap-4 h-[calc(100dvh-40px)] flex-1 min-w-0">
            {/* Details Panel */}
            <div className="flex-1 h-full overflow-hidden">
              {currentProperty ? (
                <TikTokDetailsDrawer
                  key={currentProperty._id || currentIndex}
                  property={currentProperty}
                  direction={scrollDirection}
                  isDesktop={true}
                  onOpenContact={() => setShowContactModal(true)}
                  onOpenComments={() => setShowCommentsDrawer(true)}
                  onShare={() => handleShare(currentProperty)}
                />
              ) : (
                <TikTokDetailsSkeleton isDesktop={true} />
              )}
            </div>

            {/* Floating Desktop Next / Prev Controls sticking to the details section */}
            <div className="flex flex-col gap-3 shrink-0 z-30 pointer-events-auto">
              <button
                onClick={scrollPrev}
                disabled={currentIndex === 0}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer backdrop-blur-md shadow-xl border ${
                  currentIndex === 0
                    ? 'bg-zinc-900/40 text-white/20 border-white/5 cursor-not-allowed'
                    : 'bg-zinc-900/80 hover:bg-zinc-800 text-white border-white/20 hover:scale-110 active:scale-95 hover:border-white/40'
                }`}
                title="Propriété précédente (Flèche Haut)"
              >
                <ChevronUp className="w-5 h-5" />
              </button>
              <button
                onClick={scrollNext}
                disabled={currentIndex === properties.length - 1}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer backdrop-blur-md shadow-xl border ${
                  currentIndex === properties.length - 1
                    ? 'bg-zinc-900/40 text-white/20 border-white/5 cursor-not-allowed'
                    : 'bg-zinc-900/80 hover:bg-zinc-800 text-white border-white/20 hover:scale-110 active:scale-95 hover:border-white/40'
                }`}
                title="Propriété suivante (Flèche Bas)"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Slide-Up Details Drawer */}
      {!isDesktop && currentProperty && (
        <TikTokDetailsDrawer
          key={currentProperty._id || currentIndex}
          property={currentProperty}
          direction={scrollDirection}
          isDesktop={false}
          isOpen={showDetailsDrawer}
          onClose={() => setShowDetailsDrawer(false)}
          onOpenContact={() => {
            setShowDetailsDrawer(false);
            setShowContactModal(true);
          }}
          onOpenComments={() => {
            setShowDetailsDrawer(false);
            setShowCommentsDrawer(true);
          }}
          onShare={() => handleShare(currentProperty)}
        />
      )}

      {/* Global Interactive Map Modal */}
      {showMapModal && currentProperty && (
        <TikTokMapModal
          property={currentProperty}
          onClose={() => setShowMapModal(false)}
        />
      )}

      {/* Global Contact Modal */}
      {showContactModal && currentProperty && (
        <TikTokContactModal
          property={currentProperty}
          onClose={() => setShowContactModal(false)}
        />
      )}

      {/* Global Comments Drawer / Modal */}
      <TikTokCommentsDrawer
        property={currentProperty}
        isOpen={showCommentsDrawer}
        onClose={() => setShowCommentsDrawer(false)}
        isDesktop={isDesktop}
      />
    </div>
  );
}
