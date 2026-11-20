'use client';

import { useEffect, useState } from 'react';
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
  Moon,
  Sun,
  Sparkles,
  X,
  AlertTriangle,
  Loader2,
  Phone,
  Send,
  ShieldCheck,
  MapPin,
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useModalStore } from '@/store/modalStore';
import { useAuth } from '@/hooks/useAuth';
import { resolveProfileHref } from '@/services/user.service';
import Header from '@/components/Header';
import DarkModeToggle from '@/components/DarkModeToggle';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import {
  AGENCY_SUPPORT_PHONE_DISPLAY,
  AGENCY_SUPPORT_PHONE_TEL,
} from '@/lib/platform';
import {
  useAccountCommerce,
  AccountHeaderBadge,
  AccountWalletSection,
  AccountPricingMenuItem,
  AccountHistoryModal,
} from '@/components/account/AccountCommerce';

const MenuCard = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-white dark:bg-zinc-900 rounded-[2.25rem] p-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.04)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.35)] overflow-hidden">
    {children}
  </div>
);

const MenuItem = ({
  icon: Icon,
  title,
  subtitle,
  href,
  onClick,
}: {
  icon: any;
  title: string;
  subtitle?: string;
  href?: string;
  onClick?: () => void;
}) => {
  const content = (
    <div className="flex items-center justify-between p-4 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800/60 transition-colors cursor-pointer rounded-full">
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-10 h-10 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 shrink-0">
          <Icon className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <span className="font-semibold text-zinc-800 dark:text-zinc-100 block truncate">
            {title}
          </span>
          {subtitle && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500 block truncate">
              {subtitle}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-zinc-400 shrink-0" strokeWidth={1.75} />
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return (
    <div onClick={onClick} className="block">
      {content}
    </div>
  );
};

export default function AccountPage() {
  const { user, logout, initialize } = useUserStore();
  const openModal = useModalStore((state) => state.openModal);
  const { refreshUserSession, deleteAccount, isLoading: isAuthActionLoading } = useAuth();
  const {
    balance,
    transactions,
    refreshCommerce,
    showHistory,
    setShowHistory,
  } = useAccountCommerce();
  const router = useRouter();
  const [testSent, setTestSent] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<'bug' | 'idea' | 'question'>('idea');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [showAboutModal, setShowAboutModal] = useState(false);

  const {
    isSubscribed,
    isLoading: isPushLoading,
    feedback: pushFeedback,
    enableNotifications,
    sendTest,
  } = usePushNotifications();

  useEffect(() => {
    initialize();
    refreshUserSession();
    refreshCommerce();
  }, [initialize, refreshUserSession, refreshCommerce]);

  const handleLogout = () => {
    logout();
    router.replace('/');
  };

  const handleOpenDeleteModal = () => {
    setDeleteConfirmText('');
    setDeleteError(null);
    setShowDeleteModal(true);
  };

  const handleConfirmDeleteAccount = async () => {
    setDeleteError(null);
    const result = await deleteAccount();
    if (!result.success) {
      setDeleteError(
        result.error || 'Impossible de supprimer votre compte pour le moment.'
      );
      return;
    }
    setShowDeleteModal(false);
  };

  const buildSupportWhatsappUrl = () => {
    const cleanDigits = AGENCY_SUPPORT_PHONE_TEL.replace(/\D/g, '');
    const intlPhone = cleanDigits.startsWith('0')
      ? `261${cleanDigits.slice(1)}`
      : cleanDigits;
    const categoryLabel =
      feedbackCategory === 'bug'
        ? 'Signalement de bug'
        : feedbackCategory === 'question'
          ? 'Question'
          : 'Suggestion';
    const text = `[TranoGasy — ${categoryLabel}]${
      currentUser?.username ? ` (${currentUser.username})` : ''
    }\n${feedbackMessage.trim() || 'Bonjour équipe TranoGasy,'}`;
    return `https://wa.me/${intlPhone}?text=${encodeURIComponent(text)}`;
  };

  const buildSupportSmsUrl = () => {
    const categoryLabel =
      feedbackCategory === 'bug'
        ? 'Bug'
        : feedbackCategory === 'question'
          ? 'Question'
          : 'Suggestion';
    const text = `[TranoGasy - ${categoryLabel}] ${
      feedbackMessage.trim() || 'Bonjour équipe TranoGasy,'
    }`;
    return `sms:${AGENCY_SUPPORT_PHONE_TEL}?body=${encodeURIComponent(text)}`;
  };

  const currentUser = user?.user || user;
  const isLoggedIn = !!currentUser;
  const profileUrl = currentUser?._id
    ? resolveProfileHref(currentUser)
    : '/profile';

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-zinc-950 pb-24 font-sans selection:bg-brand-green/20">
      {/* Header Mobile / Desktop Header */}
      <div className="sticky top-0 z-50">
        <Header />
      </div>

      <div className="sticky top-[calc(64px+var(--ios-safe-top))] z-40 w-full bg-[#F5F5F7]/90 dark:bg-zinc-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 md:px-8 lg:px-28 xl:px-32 2xl:px-36 py-2.5 md:py-4">
          <div className="flex items-center">
            <Link
              href="/"
              className="p-2 -ml-2 rounded-full hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors mr-2"
            >
              <ArrowLeft
                className="w-5 h-5 md:w-6 md:h-6 text-zinc-800 dark:text-zinc-200"
                strokeWidth={2.5}
              />
            </Link>
            <h1 className="text-lg md:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
              Mon compte
            </h1>
          </div>

          {/* Quick Header Balance / Assistance Pill */}
          <AccountHeaderBadge balance={balance} />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8 lg:px-28 xl:px-32 2xl:px-36 pb-8 pt-2 w-full">
        <div className="flex flex-col lg:grid lg:grid-cols-12 lg:gap-8">
          {/* Left Column (Sticky Profile) */}
          <div className="lg:col-span-4 lg:sticky lg:top-[150px] lg:self-start flex flex-col gap-6 mb-6 lg:mb-0">
            {/* Profile Section (Zero double borders) */}
            <div className="bg-white dark:bg-zinc-900 rounded-[2.25rem] lg:rounded-[2.5rem] p-5 lg:p-7 shadow-[0_12px_40px_rgba(0,0,0,0.04)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.35)] flex flex-row lg:flex-col items-center justify-between lg:justify-start lg:text-center relative overflow-hidden gap-3 sm:gap-4 lg:gap-0">
              <div className="hidden lg:block absolute top-0 left-0 w-full h-24 bg-gradient-to-br from-brand-green/20 to-emerald-500/5 dark:from-brand-green/10 dark:to-transparent" />

              {/* User Avatar + Details */}
              <div className="flex items-center gap-3.5 sm:gap-4 lg:flex-col lg:gap-0 min-w-0 flex-1 lg:flex-initial">
                {/* Profile Picture with Social Green Active Dot Badge */}
                <Link
                  href={profileUrl}
                  className="relative shrink-0 lg:mt-3 lg:mb-4 z-10 block group transition-transform active:scale-95 cursor-pointer"
                  title="Voir mon profil"
                >
                  <div className="relative w-16 h-16 lg:w-24 lg:h-24 rounded-full shadow-md overflow-hidden bg-zinc-200 dark:bg-zinc-800 group-hover:ring-2 group-hover:ring-brand-green/70 transition-all">
                    {currentUser?.avatar ? (
                      <Image
                        src={currentUser.avatar}
                        alt="Profile"
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-zinc-900 dark:bg-zinc-800 text-white text-2xl lg:text-3xl font-bold uppercase">
                        {currentUser?.username?.charAt(0) ||
                          currentUser?.email?.charAt(0) ||
                          'U'}
                      </div>
                    )}
                  </div>
                  {/* Green dot badge on the avatar like a social network */}
                  <span
                    className="absolute bottom-0 right-0 lg:bottom-1 lg:right-1 w-4 h-4 lg:w-5 lg:h-5 bg-brand-green rounded-full ring-2 lg:ring-[3px] ring-white dark:ring-zinc-900 shadow-sm"
                    title="Compte actif"
                  />
                </Link>

                {/* Username & Phone (Clicking username opens profile) */}
                <div className="z-10 flex flex-col items-start lg:items-center min-w-0 flex-1">
                  <Link
                    href={profileUrl}
                    className="group/name block max-w-full cursor-pointer"
                    title="Voir mon profil"
                  >
                    <h2 className="text-base sm:text-xl lg:text-2xl font-bold text-zinc-900 dark:text-white truncate group-hover/name:text-brand-green transition-colors">
                      {currentUser?.username || 'Utilisateur'}
                    </h2>
                  </Link>
                  <p className="text-xs lg:text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-0.5 lg:mt-1 truncate max-w-full">
                    {currentUser?.phone || 'Aucun numéro renseigné'}
                  </p>
                </div>
              </div>

              {/* Disconnect Pill Button for Mobile (Zero nested borders) */}
              {isLoggedIn && (
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Se déconnecter"
                  className="lg:hidden h-11 px-3 pr-4 rounded-full flex items-center gap-2.5 flex-shrink-0 transition-all active:scale-95 cursor-pointer bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-red-500/10 hover:text-brand-red dark:hover:text-red-400 group"
                >
                  <div className="h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors bg-white dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 group-hover:bg-red-500/15 group-hover:text-red-500">
                    <Power className="h-4 w-4" />
                  </div>
                  <span className="text-sm tracking-tight font-semibold">
                    Déconnexion
                  </span>
                </button>
              )}
            </div>

            {/* Actions (Desktop only) */}
            <div className="hidden lg:flex flex-col gap-3">
              {isLoggedIn ? (
                <>
                  <button
                    type="button"
                    onClick={handleOpenDeleteModal}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-red-500/10 text-brand-red font-bold text-xs sm:text-sm rounded-full hover:bg-red-500/15 active:scale-95 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4.5 h-4.5" strokeWidth={2} />
                    Supprimer mon compte
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-zinc-950 hover:bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 font-bold text-xs sm:text-sm rounded-full shadow-md active:scale-95 transition-all cursor-pointer"
                  >
                    <LogOut className="w-4.5 h-4.5" strokeWidth={2} />
                    Se déconnecter
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => openModal('login')}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-brand-green hover:bg-[#6da819] text-white font-bold text-xs sm:text-sm rounded-full shadow-md active:scale-95 transition-all cursor-pointer"
                >
                  <UserCircle className="w-4.5 h-4.5" strokeWidth={2} />
                  Se connecter
                </button>
              )}
            </div>
          </div>

          {/* Right Column (Content) */}
          <div className="lg:col-span-8 space-y-8 pb-8">
            <AccountWalletSection
              balance={balance}
              transactions={transactions}
              onOpenHistory={() => setShowHistory(true)}
            />

            {/* Informations personnelles */}
            <section>
              <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-200 mb-3 px-2">
                Informations personnelles
              </h3>
              <MenuCard>
                <div className="flex flex-col p-1 sm:p-2 space-y-1">
                  <div className="flex flex-row justify-between items-center p-3.5 rounded-full hover:bg-[#F5F5F7] dark:hover:bg-zinc-800/50 transition-colors gap-4">
                    <span className="text-zinc-500 dark:text-zinc-400 text-sm font-medium shrink-0">
                      Email
                    </span>
                    <span className="text-zinc-900 dark:text-zinc-200 text-sm sm:text-base font-semibold truncate text-right">
                      {currentUser?.email || 'Non renseigné'}
                    </span>
                  </div>
                  <div className="flex flex-row justify-between items-center p-3.5 rounded-full hover:bg-[#F5F5F7] dark:hover:bg-zinc-800/50 transition-colors gap-4">
                    <span className="text-zinc-500 dark:text-zinc-400 text-sm font-medium shrink-0">
                      Bio
                    </span>
                    <span className="text-zinc-900 dark:text-zinc-200 text-sm sm:text-base font-semibold text-right max-w-[60%] sm:max-w-[70%] line-clamp-1 sm:line-clamp-2">
                      {currentUser?.bio || 'Aucune biographie'}
                    </span>
                  </div>
                  <div className="flex flex-row justify-between items-center p-3.5 rounded-full hover:bg-[#F5F5F7] dark:hover:bg-zinc-800/50 transition-colors gap-4">
                    <span className="text-zinc-500 dark:text-zinc-400 text-sm font-medium shrink-0">
                      Rôle
                    </span>
                    <span className="text-zinc-900 dark:text-zinc-200 text-sm sm:text-base font-semibold capitalize inline-flex items-center gap-1.5 text-right">
                      {currentUser?.role === 'admin' && (
                        <UserCircle className="w-4 h-4 text-brand-green" />
                      )}
                      {currentUser?.role === 'admin'
                        ? 'Administrateur'
                        : currentUser?.role || 'Utilisateur'}
                    </span>
                  </div>
                  <div className="flex flex-row justify-between items-center p-3.5 rounded-full hover:bg-[#F5F5F7] dark:hover:bg-zinc-800/50 transition-colors gap-4">
                    <span className="text-zinc-500 dark:text-zinc-400 text-sm font-medium shrink-0">
                      Membre depuis
                    </span>
                    <span className="text-zinc-900 dark:text-zinc-200 text-sm sm:text-base font-semibold text-right">
                      {currentUser?.created_at
                        ? new Date(currentUser.created_at).toLocaleDateString(
                            'fr-FR',
                            { day: 'numeric', month: 'long', year: 'numeric' }
                          )
                        : 'Inconnu'}
                    </span>
                  </div>
                </div>
              </MenuCard>
            </section>

            {/* Settings */}
            <section>
              <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-200 mb-4 px-2">
                Paramètres
              </h3>
              <MenuCard>
                {/* Theme Toggle Setting */}
                <div className="flex items-center justify-between p-4 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800/60 transition-colors rounded-full">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 shrink-0">
                      <Sun
                        className="w-5 h-5 block dark:hidden"
                        strokeWidth={1.75}
                      />
                      <Moon
                        className="w-5 h-5 hidden dark:block"
                        strokeWidth={1.75}
                      />
                    </div>
                    <div>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-100 block">
                        Apparence & Thème
                      </span>
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        Basculer entre mode clair et sombre
                      </span>
                    </div>
                  </div>
                  <DarkModeToggle />
                </div>
                <AccountPricingMenuItem />
                {(currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && (
                  <MenuItem
                    icon={Sparkles}
                    title="Ingestion Facebook (Admin)"
                    subtitle="Scraper, fréquence des groupes & file de validation"
                    href="/admin/scraper"
                  />
                )}
                <MenuItem
                  icon={UserCircle}
                  title="Paramètres du compte"
                  href="/profile"
                />
                {/* Push Notification Setting */}
                <div className="flex items-center justify-between p-4 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800/60 transition-colors rounded-full">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 shrink-0">
                      <Bell className="w-5 h-5" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-800 dark:text-zinc-100 block">
                          Notifications Push
                        </span>
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                            isSubscribed
                              ? 'bg-brand-green/10 text-brand-green'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {isSubscribed ? 'Activées' : 'Désactivées'}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-400 dark:text-zinc-500 block truncate">
                        {isSubscribed
                          ? 'Alertes en temps réel pour paiements et annonces'
                          : 'Recevoir les alertes de recharge et messages'}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {isSubscribed ? (
                      <button
                        type="button"
                        onClick={async () => {
                          setTestSent(true);
                          await sendTest();
                          setTimeout(() => setTestSent(false), 3000);
                        }}
                        disabled={testSent}
                        className="text-xs font-bold px-3.5 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-95 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        {testSent ? '✓ Envoyé !' : 'Tester la notification'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={enableNotifications}
                        disabled={isPushLoading}
                        className="text-xs font-bold px-4 py-1.5 rounded-full bg-brand-green text-white hover:bg-brand-green/90 active:scale-95 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        {isPushLoading ? 'Activation…' : 'Activer'}
                      </button>
                    )}
                  </div>
                </div>
                {pushFeedback && (
                  <p className="px-5 pb-2.5 -mt-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    {pushFeedback}
                  </p>
                )}
                <MenuItem
                  icon={MessageSquare}
                  title="Retours"
                  subtitle="Signaler un bug ou suggérer une amélioration"
                  onClick={() => setShowFeedbackModal(true)}
                />
              </MenuCard>
            </section>

            {/* Others */}
            <section>
              <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-200 mb-4 px-2">
                Autres
              </h3>
              <MenuCard>
                <MenuItem
                  icon={Info}
                  title="À propos"
                  subtitle="TranoGasy 2.0 • Immobilier à Madagascar"
                  onClick={() => setShowAboutModal(true)}
                />
                <MenuItem icon={HelpCircle} title="FAQ" href="/pricing" />
              </MenuCard>
            </section>

            {/* Actions (Mobile only) */}
            {isLoggedIn && (
              <section className="pt-4 space-y-3.5 lg:hidden">
                <button
                  type="button"
                  onClick={handleOpenDeleteModal}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-red-500/10 text-brand-red font-bold text-xs sm:text-sm rounded-full hover:bg-red-500/15 active:scale-95 transition-all cursor-pointer"
                >
                  <Trash2 className="w-4.5 h-4.5" strokeWidth={2} />
                  Supprimer mon compte
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-zinc-950 hover:bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 font-bold text-xs sm:text-sm rounded-full shadow-md active:scale-95 transition-all cursor-pointer"
                >
                  <LogOut className="w-4.5 h-4.5" strokeWidth={2} />
                  Se déconnecter
                </button>
              </section>
            )}
          </div>
        </div>
      </div>

      <AccountHistoryModal
        open={showHistory}
        transactions={transactions}
        onClose={() => setShowHistory(false)}
      />

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => !isAuthActionLoading && setShowDeleteModal(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 max-w-md w-full shadow-2xl space-y-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-red-500/10 text-brand-red flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h4
                  id="delete-account-title"
                  className="text-base font-bold text-zinc-900 dark:text-white"
                >
                  Supprimer mon compte
                </h4>
              </div>
              <button
                type="button"
                disabled={isAuthActionLoading}
                onClick={() => setShowDeleteModal(false)}
                aria-label="Fermer"
                className="w-8 h-8 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Cette action est <strong className="text-zinc-900 dark:text-white">définitive et irréversible</strong>. Votre profil, vos favoris, vos notifications ainsi que vos annonces publiées seront supprimés.
            </p>

            <div className="space-y-1.5">
              <label
                htmlFor="delete-confirm-input"
                className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block"
              >
                Tapez <span className="font-mono font-bold text-brand-red">SUPPRIMER</span> pour confirmer
              </label>
              <input
                id="delete-confirm-input"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="SUPPRIMER"
                disabled={isAuthActionLoading}
                autoComplete="off"
                className="w-full px-4 py-2.5 rounded-2xl bg-[#F5F5F7] dark:bg-zinc-800 text-sm font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red/40 transition-all"
              />
            </div>

            {deleteError && (
              <div className="px-3.5 py-2.5 rounded-2xl bg-red-500/10 text-brand-red text-xs font-semibold">
                {deleteError}
              </div>
            )}

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                disabled={isAuthActionLoading}
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-3 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-bold text-xs sm:text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={
                  isAuthActionLoading ||
                  deleteConfirmText.trim().toUpperCase() !== 'SUPPRIMER'
                }
                onClick={handleConfirmDeleteAccount}
                className="flex-1 py-3 rounded-full bg-brand-red hover:bg-red-600 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isAuthActionLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Suppression…</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Supprimer</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback / Retours Modal */}
      {showFeedbackModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowFeedbackModal(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 max-w-md w-full shadow-2xl space-y-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-brand-green/12 text-brand-green flex items-center justify-center shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <h4
                  id="feedback-modal-title"
                  className="text-base font-bold text-zinc-900 dark:text-white"
                >
                  Vos retours
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowFeedbackModal(false)}
                aria-label="Fermer"
                className="w-8 h-8 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              Aidez-nous à améliorer TranoGasy. Décrivez votre remarque et envoyez-la directement à notre équipe.
            </p>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'idea', label: 'Suggestion' },
                  { id: 'bug', label: 'Bug' },
                  { id: 'question', label: 'Question' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setFeedbackCategory(cat.id)}
                  className={`py-2 px-3 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    feedbackCategory === cat.id
                      ? 'bg-brand-green text-white shadow-sm'
                      : 'bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <textarea
              rows={4}
              value={feedbackMessage}
              onChange={(e) => setFeedbackMessage(e.target.value)}
              placeholder="Décrivez votre suggestion, un problème rencontré ou une question…"
              className="w-full p-3.5 rounded-2xl bg-[#F5F5F7] dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-brand-green/40 resize-none"
            />

            <div className="flex flex-col gap-2">
              <a
                href={buildSupportWhatsappUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-full bg-brand-green hover:bg-[#6da819] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Send className="w-4 h-4" />
                <span>Envoyer via WhatsApp</span>
              </a>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={buildSupportSmsUrl()}
                  className="py-2.5 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Par SMS</span>
                </a>
                <a
                  href={`tel:${AGENCY_SUPPORT_PHONE_TEL}`}
                  className="py-2.5 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Appeler</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* About / À propos Modal */}
      {showAboutModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowAboutModal(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 max-w-md w-full shadow-2xl space-y-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-brand-green/12 text-brand-green flex items-center justify-center shrink-0">
                  <Info className="w-5 h-5" />
                </div>
                <div>
                  <h4
                    id="about-modal-title"
                    className="text-base font-bold text-zinc-900 dark:text-white leading-tight"
                  >
                    À propos de TranoGasy
                  </h4>
                  <span className="text-[11px] font-semibold text-zinc-400">
                    Version 2.0
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAboutModal(false)}
                aria-label="Fermer"
                className="w-8 h-8 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              TranoGasy facilite la recherche et la publication de biens immobiliers à Madagascar — maisons, appartements, studios et locaux commerciaux — avec une recherche par quartier (fokontany) et carte interactive.
            </p>

            <div className="bg-[#F5F5F7] dark:bg-zinc-800/80 rounded-2xl p-4 space-y-2.5 text-xs">
              <div className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-200">
                <MapPin className="w-4 h-4 text-brand-green shrink-0" />
                <span className="font-semibold">Antananarivo, Madagascar</span>
              </div>
              <div className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-200">
                <Phone className="w-4 h-4 text-brand-green shrink-0" />
                <a
                  href={`tel:${AGENCY_SUPPORT_PHONE_TEL}`}
                  className="font-semibold hover:text-brand-green transition-colors"
                >
                  Support : {AGENCY_SUPPORT_PHONE_DISPLAY}
                </a>
              </div>
              <div className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-200">
                <ShieldCheck className="w-4 h-4 text-brand-green shrink-0" />
                <span className="font-semibold">
                  Annonces vérifiées & paiements sécurisés
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              <Link
                href="/pricing"
                onClick={() => setShowAboutModal(false)}
                className="flex-1 py-3 rounded-full bg-brand-green hover:bg-[#6da819] text-white font-bold text-xs sm:text-sm text-center transition-all active:scale-95"
              >
                Voir nos offres & FAQ
              </Link>
              <button
                type="button"
                onClick={() => setShowAboutModal(false)}
                className="px-5 py-3 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-bold text-xs sm:text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
