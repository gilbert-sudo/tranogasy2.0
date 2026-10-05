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
    <div className={`flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer rounded-2xl ${showBorder ? 'border-b border-zinc-100 dark:border-zinc-800/50 rounded-none' : ''}`}>
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
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-zinc-950 pb-24 font-sans selection:bg-brand-red/20">
      
      {/* Header Mobile / Desktop Header */}
      <div className="sticky top-0 z-50">
        <Header />
      </div>

      <div className="md:hidden sticky top-[64px] z-40 bg-[#F8F9FA]/90 dark:bg-zinc-950/90 backdrop-blur-xl px-4 py-3 flex items-center gap-4 border-b border-zinc-200 dark:border-zinc-800">
        <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="w-6 h-6 text-zinc-800 dark:text-zinc-200" strokeWidth={2.5} />
        </Link>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white">Mon compte</h1>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:pr-[120px] pb-8 pt-2 md:pt-4">
        {/* Title for desktop */}
        <div className="hidden md:flex items-center gap-4 sticky top-[64px] z-40 bg-[#F8F9FA]/90 dark:bg-zinc-950/90 backdrop-blur-xl py-4 mb-6">
          <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
            <ArrowLeft className="w-7 h-7 text-zinc-800 dark:text-zinc-200" strokeWidth={2.5} />
          </Link>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Mon compte</h1>
        </div>

        <div className="flex flex-col lg:grid lg:grid-cols-12 lg:gap-8">
          
          {/* Left Column (Sticky Profile) */}
          <div className="lg:col-span-4 lg:sticky lg:top-[160px] lg:self-start lg:flex lg:flex-col gap-8">
            
            {/* Profile Section */}
            <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-6 shadow-sm border border-zinc-100 dark:border-zinc-800 flex flex-col items-center text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-br from-brand-green/20 to-brand-red/10 dark:from-brand-green/10 dark:to-brand-red/5"></div>
              
              <div className="relative w-24 h-24 rounded-full border-4 border-white dark:border-zinc-900 shadow-md overflow-hidden bg-zinc-200 dark:bg-zinc-800 mt-4 mb-4 z-10">
                {currentUser?.avatar ? (
                  <Image 
                    src={currentUser.avatar} 
                    alt="Profile" 
                    fill 
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-white text-3xl font-bold uppercase">
                    {currentUser?.username?.charAt(0) || currentUser?.email?.charAt(0) || 'U'}
                  </div>
                )}
              </div>
              <div className="z-10">
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
                  {currentUser?.username || 'Utilisateur'}
                </h2>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                  {currentUser?.phone || 'Aucun numéro renseigné'}
                </p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-4 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Compte actif
                </div>
              </div>
            </div>

            {/* Actions (Desktop only - mobile puts this at the bottom) */}
            <div className="hidden lg:flex flex-col gap-3">
              <button className="w-full flex items-center justify-center gap-2 py-3.5 bg-transparent border-2 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 font-semibold rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-all active:scale-[0.98]">
                <Trash2 className="w-5 h-5" strokeWidth={2} />
                Supprimer mon compte
              </button>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#D65B4A] text-white font-semibold rounded-2xl shadow-md hover:bg-[#C24D3D] transition-all active:scale-[0.98]"
              >
                <LogOut className="w-5 h-5" strokeWidth={2} />
                Se déconnecter
              </button>
            </div>
          </div>

          {/* Right Column (Content) */}
          <div className="lg:col-span-8 space-y-8 pb-8">
            
            {/* Informations personnelles */}
            <section>
              <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-200 mb-4 px-2">Informations personnelles</h3>
              <MenuCard>
                <div className="flex flex-col p-2 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors gap-1 sm:gap-4">
                    <span className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">Email</span>
                    <span className="text-zinc-900 dark:text-zinc-200 font-semibold truncate">{currentUser?.email || 'Non renseigné'}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors gap-1 sm:gap-4">
                    <span className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">Bio</span>
                    <span className="text-zinc-900 dark:text-zinc-200 font-semibold sm:text-right max-w-full sm:max-w-[70%] line-clamp-2">{currentUser?.bio || 'Aucune biographie'}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors gap-1 sm:gap-4">
                    <span className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">Rôle</span>
                    <span className="text-zinc-900 dark:text-zinc-200 font-semibold capitalize inline-flex items-center gap-1.5">
                      {currentUser?.role === 'admin' && <UserCircle className="w-4 h-4 text-brand-green" />}
                      {currentUser?.role === 'admin' ? 'Administrateur' : currentUser?.role || 'Utilisateur'}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors gap-1 sm:gap-4">
                    <span className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">Membre depuis</span>
                    <span className="text-zinc-900 dark:text-zinc-200 font-semibold">
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
            <section className="pt-6 space-y-4 lg:hidden">
              <button className="w-full flex items-center justify-center gap-2 py-4 bg-transparent border-2 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 font-semibold rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-all active:scale-[0.98]">
                <Trash2 className="w-5 h-5" strokeWidth={2} />
                Supprimer mon compte
              </button>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-4 bg-[#D65B4A] text-white font-semibold rounded-2xl shadow-md hover:bg-[#C24D3D] transition-all active:scale-[0.98]"
              >
                <LogOut className="w-5 h-5" strokeWidth={2} />
                Se déconnecter
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
