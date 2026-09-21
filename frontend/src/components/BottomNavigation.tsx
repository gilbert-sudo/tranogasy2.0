'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Compass, Heart, Bell, User } from 'lucide-react';

export default function BottomNavigation() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Accueil', href: '/', icon: Home },
    { name: 'Explorer', href: '/explore', icon: Compass },
    { name: 'Favoris', href: '/favorites', icon: Heart },
    { name: 'Notifs', href: '/notifications', icon: Bell },
    { name: 'Compte', href: '/profile', icon: User },
  ];

  return (
    <nav className="fixed z-50 transition-all duration-300 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md border-zinc-200 dark:border-zinc-700 
      bottom-0 left-0 w-full border-t pb-safe pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.2)]
      md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:w-[375px] md:rounded-[2rem] md:border md:pb-2 md:shadow-xl
      lg:top-1/2 lg:right-6 lg:left-auto lg:bottom-auto lg:translate-x-0 lg:-translate-y-1/2 lg:w-[85px] lg:h-[400px] lg:rounded-[2.5rem] lg:pt-4 lg:pb-4 lg:px-0">
      <div className="flex h-full items-center justify-around px-2 pb-2 md:pb-0 lg:flex-col lg:px-0 lg:py-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex flex-col items-center gap-1 p-2 transition-all hover:scale-105 ${
                isActive ? 'text-brand-red' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <Icon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
