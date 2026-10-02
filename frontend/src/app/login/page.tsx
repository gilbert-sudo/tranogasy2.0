'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, EyeOff, ArrowRight, Phone, Lock, ChevronLeft } from 'lucide-react';
import Header from '@/components/Header';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');

  const handlePhoneNumberInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numericValue = e.target.value.replace(/\D/g, "");
    setPhoneNumber(numericValue);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    window.location.href = '/profile';
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      <Header />
      
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-5xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row border border-zinc-200 dark:border-zinc-800">
          
          {/* Left Side - Image/Branding */}
          <div className="hidden md:block w-1/2 relative bg-brand-green/10">
            <div className="absolute inset-0">
              <Image 
                src="/hero-bg.jpg" 
                alt="TranoGasy Login" 
                fill 
                className="object-cover opacity-80 mix-blend-overlay"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-brand-green/90 to-black/40 mix-blend-multiply" />
            </div>
            <div className="relative h-full p-12 flex flex-col justify-end text-white">
              <h2 className="text-4xl font-black mb-4">Trouvez votre<br />maison idéale.</h2>
              <p className="text-lg text-white/80 max-w-md">
                Rejoignez la première plateforme immobilière de Madagascar et découvrez des milliers de propriétés exclusives.
              </p>
            </div>
          </div>

          {/* Right Side - Form */}
          <div className="w-full md:w-1/2 p-8 sm:p-12 lg:p-16 flex flex-col justify-center">
            
            <div className="mb-10">
              <Link href="/" className="inline-flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 mb-6 transition-colors">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Retour
              </Link>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-zinc-900 dark:text-white mb-2 tracking-tight">
                Bon retour !
              </h1>
              <p className="text-zinc-500 dark:text-zinc-400">
                Connectez-vous pour accéder à votre espace TranoGasy.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Numéro de téléphone</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Phone className="h-5 w-5 text-zinc-400" />
                  </div>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={handlePhoneNumberInput}
                    placeholder="034 00 000 00"
                    required
                    className="block w-full pl-11 pr-4 py-3.5 bg-zinc-100/50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-green focus:border-brand-green focus:bg-white dark:focus:bg-zinc-900 transition-all outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Mot de passe</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-zinc-400" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Votre mot de passe"
                    required
                    className="block w-full pl-11 pr-12 py-3.5 bg-zinc-100/50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-green focus:border-brand-green focus:bg-white dark:focus:bg-zinc-900 transition-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 focus:outline-none transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <div className="flex justify-end pt-1">
                  <Link href="/password-recovery" className="text-sm font-medium text-brand-green hover:text-brand-green/80 transition-colors">
                    Mot de passe oublié ?
                  </Link>
                </div>
              </div>

              <button
                type="submit"
                className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent rounded-2xl shadow-sm text-base font-bold text-white bg-brand-green hover:bg-brand-green/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green transition-all transform active:scale-[0.98] mt-4"
              >
                Se connecter
                <ArrowRight className="h-5 w-5" />
              </button>
            </form>

            <div className="mt-8 pt-8 border-t border-zinc-200 dark:border-zinc-800 text-center">
              <p className="text-zinc-600 dark:text-zinc-400">
                Vous n'avez pas de compte ?{' '}
                <Link href="/signup" className="font-bold text-brand-green hover:text-brand-green/80 transition-colors">
                  Créer un compte
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
