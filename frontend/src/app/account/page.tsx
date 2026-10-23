'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft,
  UserCircle,
  Bell,
  MessageSquare,
  Info,
  HelpCircle,
  Trash2,
  LogOut,
  ChevronRight,
  Power,
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import Header from '@/components/Header';

const MenuCard = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-white dark:bg-zinc-900 rounded-3xl p-2 shadow-sm border border-zinc-100 dark:border-zinc-800 overflow-hidden">
    {children}
  </div>
);

const MenuItem = ({ 
  icon: Icon, 
  title, 
  href, 
  onClick, 
  showBorder = true 
}: { 
  icon: any, 
  title: string, 
  href?: string, 
  onClick?: () => void, 
  showBorder?: boolean 
}) => {
  const content = (
    <div className={`flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer rounded-full ${showBorder ? 'border-b border-zinc-100 dark:border-zinc-800/50 rounded-full' : ''}`}>
      <div className="flex items-center gap-4">
        <div className="text-zinc-500 dark:text-zinc-400">
          <Icon className="w-[22px] h-[22px]" strokeWidth={1.5} />
        </div>
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          {title}
        </span>
      </div>
      <ChevronRight className="w-5 h-5 text-zinc-400" strokeWidth={1.5} />
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }

  return <div onClick={onClick} className="block">{content}</div>;
};

export default function AccountPage() {
  const { user, logout, initialize } = useUserStore();
  const router = useRouter();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const currentUser = user?.user || user;

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-zinc-950 pb-24 font-sans selection:bg-brand-green/20">
      
      {/* Header Mobile / Desktop Header */}
      <div className="sticky top-0 z-50">
        <Header />
      </div>

      <div className="sticky top-[64px] z-40 w-full bg-[#F8F9FA]/90 dark:bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800 md:border-transparent">
        <div className="mx-auto flex max-w-6xl items-center px-4 sm:px-6 md:px-8 lg:px-28 xl:px-32 2xl:px-36 py-2 md:py-4">
          <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors mr-2">
            <ArrowLeft className="w-5 h-5 md:w-6 md:h-6 text-zinc-800 dark:text-zinc-200" strokeWidth={2.5} />
          </Link>
          <h1 className="text-lg md:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
            Mon compte
          </h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8 lg:px-28 xl:px-32 2xl:px-36 pb-8 pt-2 w-full">

        <div className="flex flex-col lg:grid lg:grid-cols-12 lg:gap-8">
          
          {/* Left Column (Sticky Profile) */}
          <div className="lg:col-span-4 lg:sticky lg:top-[160px] lg:self-start lg:flex lg:flex-col gap-8">
            
            {/* Profile Section */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl lg:rounded-[2.5rem] p-4 lg:p-6 shadow-sm border border-zinc-100 dark:border-zinc-800 flex flex-row lg:flex-col items-center justify-between lg:justify-start lg:text-center relative overflow-hidden gap-3 sm:gap-4 lg:gap-0">
              <div className="hidden lg:block absolute top-0 left-0 w-full h-24 bg-gradient-to-br from-brand-green/20 to-emerald-500/5 dark:from-brand-green/10 dark:to-transparent"></div>
              
              {/* User Avatar + Details */}
              <div className="flex items-center gap-3 sm:gap-4 lg:flex-col lg:gap-0 min-w-0 flex-1 lg:flex-initial">
                <div className="relative w-16 h-16 lg:w-24 lg:h-24 shrink-0 rounded-full border-2 lg:border-4 border-white dark:border-zinc-900 shadow-md overflow-hidden bg-zinc-200 dark:bg-zinc-800 lg:mt-4 lg:mb-4 z-10">
                  {currentUser?.avatar ? (
                    <Image 
                      src={currentUser.avatar} 
                      alt="Profile" 
                      fill 
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-white text-2xl lg:text-3xl font-bold uppercase">
                      {currentUser?.username?.charAt(0) || currentUser?.email?.charAt(0) || 'U'}
                    </div>
                  )}
                </div>
                <div className="z-10 flex flex-col items-start lg:items-center min-w-0 flex-1">
                  <h2 className="text-base sm:text-xl lg:text-2xl font-bold text-zinc-900 dark:text-white truncate max-w-full">
                    {currentUser?.username || 'Utilisateur'}
                  </h2>
                  <p className="text-xs lg:text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-0.5 lg:mt-1 truncate max-w-full">
                    {currentUser?.phone || 'Aucun numéro renseigné'}
                  </p>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-2 lg:mt-4 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] lg:text-xs font-bold text-zinc-700 dark:text-zinc-300 shrink-0">
                    <span className="w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full bg-brand-green animate-pulse"></span>
                    Compte actif
                  </div>
                </div>
              </div>

              {/* Disconnect Pill Button for Mobile matching LandingNav */}
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Se déconnecter"
                className="lg:hidden h-11 px-2.5 pr-4 rounded-full flex items-center gap-2.5 flex-shrink-0 transition-all active:scale-95 cursor-pointer bg-zinc-50/90 dark:bg-zinc-800/80 backdrop-blur-xl border border-zinc-200/80 dark:border-white/15 text-zinc-800 dark:text-zinc-200 shadow-[0_2px_10px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)] hover:bg-white dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-white/25 hover:text-brand-red dark:hover:text-red-400 group"
              >
                {/* Circular icon badge inside pill */}
                <div className="h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors bg-white dark:bg-zinc-700/80 border border-zinc-200/60 dark:border-white/10 text-zinc-700 dark:text-zinc-200 shadow-xs group-hover:bg-red-500/10 group-hover:text-red-500 group-hover:border-red-500/20 dark:group-hover:bg-red-500/20 dark:group-hover:text-red-400">
                  <Power className="h-4 w-4" />
                </div>

                {/* Pill text */}
                <span className="text-sm tracking-tight font-semibold">
                  Déconnexion
                </span>
              </button>
            </div>

            {/* Actions (Desktop only - mobile puts this at the bottom) */}
            <div className="hidden lg:flex flex-col gap-3">
              <button 
                type="button"
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-transparent border-2 border-brand-red/35 text-brand-red font-bold text-xs sm:text-sm rounded-full hover:bg-red-50 dark:hover:bg-red-950/20 active:scale-95 transition-all cursor-pointer"
              >
                <Trash2 className="w-4.5 h-4.5" strokeWidth={2} />
                Supprimer mon compte
              </button>
              <button 
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-zinc-950 hover:bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 font-bold text-xs sm:text-sm rounded-full shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <LogOut className="w-4.5 h-4.5" strokeWidth={2} />
                Se déconnecter
              </button>
            </div>
          </div>

          {/* Right Column (Content) */}
          <div className="lg:col-span-8 space-y-8 pb-8">
            
            {/* Informations personnelles */}
            <section>
              <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-200 mb-3 px-2">Informations personnelles</h3>
              <MenuCard>
                <div className="flex flex-col p-1 sm:p-2 space-y-1">
                  <div className="flex flex-row justify-between items-center p-3 rounded-full hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors gap-4">
                    <span className="text-zinc-500 dark:text-zinc-400 text-sm font-medium shrink-0">Email</span>
                    <span className="text-zinc-900 dark:text-zinc-200 text-sm sm:text-base font-semibold truncate text-right">{currentUser?.email || 'Non renseigné'}</span>
                  </div>
                  <div className="flex flex-row justify-between items-center p-3 rounded-full hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors gap-4">
                    <span className="text-zinc-500 dark:text-zinc-400 text-sm font-medium shrink-0">Bio</span>
                    <span className="text-zinc-900 dark:text-zinc-200 text-sm sm:text-base font-semibold text-right max-w-[60%] sm:max-w-[70%] line-clamp-1 sm:line-clamp-2">{currentUser?.bio || 'Aucune biographie'}</span>
                  </div>
                  <div className="flex flex-row justify-between items-center p-3 rounded-full hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors gap-4">
                    <span className="text-zinc-500 dark:text-zinc-400 text-sm font-medium shrink-0">Rôle</span>
                    <span className="text-zinc-900 dark:text-zinc-200 text-sm sm:text-base font-semibold capitalize inline-flex items-center gap-1.5 text-right">
                      {currentUser?.role === 'admin' && <UserCircle className="w-4 h-4 text-brand-green" />}
                      {currentUser?.role === 'admin' ? 'Administrateur' : currentUser?.role || 'Utilisateur'}
                    </span>
                  </div>
                  <div className="flex flex-row justify-between items-center p-3 rounded-full hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors gap-4">
                    <span className="text-zinc-500 dark:text-zinc-400 text-sm font-medium shrink-0">Membre depuis</span>
                    <span className="text-zinc-900 dark:text-zinc-200 text-sm sm:text-base font-semibold text-right">
                      {currentUser?.created_at ? new Date(currentUser.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Inconnu'}
                    </span>
                  </div>
                </div>
              </MenuCard>
            </section>

            {/* Settings */}
            <section>
              <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-200 mb-4 px-2">Paramètres</h3>
              <MenuCard>
                <MenuItem icon={UserCircle} title="Paramètres du compte" href="#" />
                <MenuItem icon={Bell} title="Paramètres de notification" href="#" />
                <MenuItem icon={MessageSquare} title="Retours" href="#" showBorder={false} />
              </MenuCard>
            </section>

            {/* Others */}
            <section>
              <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-200 mb-4 px-2">Autres</h3>
              <MenuCard>
                <MenuItem icon={Info} title="À propos" href="#" />
                <MenuItem icon={HelpCircle} title="FAQ" href="#" showBorder={false} />
              </MenuCard>
            </section>

            {/* Actions (Mobile only) */}
            <section className="pt-6 space-y-3.5 lg:hidden">
              <button 
                type="button"
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-transparent border-2 border-brand-red/35 text-brand-red font-bold text-xs sm:text-sm rounded-full hover:bg-red-50 dark:hover:bg-red-950/20 active:scale-95 transition-all cursor-pointer"
              >
                <Trash2 className="w-4.5 h-4.5" strokeWidth={2} />
                Supprimer mon compte
              </button>
              <button 
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-zinc-950 hover:bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 font-bold text-xs sm:text-sm rounded-full shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <LogOut className="w-4.5 h-4.5" strokeWidth={2} />
                Se déconnecter
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
