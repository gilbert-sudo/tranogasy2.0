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
    <nav className="fixed bottom-0 left-0 z-50 w-full border-t border-zinc-200 bg-zinc-50 pb-safe pt-2 dark:border-zinc-700 dark:bg-zinc-800 md:hidden">
      <div className="flex items-center justify-around px-2 pb-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex flex-col items-center gap-1 p-2 ${
                isActive ? 'text-brand-red' : 'text-zinc-500 dark:text-zinc-400'
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
