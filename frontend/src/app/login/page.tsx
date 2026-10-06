'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '../../hooks/useAuth';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  
  const { login, isLoading, error } = useAuth();

  const handlePhoneNumberInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numericValue = e.target.value.replace(/\D/g, "");
    setPhoneNumber(numericValue);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(phoneNumber, password, { redirectUrl: '/profile' });
  };

  return (
    <div className="h-[calc(100dvh-4rem)] md:h-[100dvh] bg-zinc-50 dark:bg-zinc-950 flex flex-col md:items-center md:justify-center font-sans overflow-hidden">
      
      {/* Container (Full height on mobile, Card on desktop) */}
      <div className="w-full flex-grow flex flex-col md:flex-grow-0 md:max-w-md md:rounded-[2rem] md:shadow-2xl md:overflow-hidden relative bg-zinc-50 dark:bg-zinc-900">
        
        {/* Top Image */}
        <div className="w-full h-[30vh] md:h-64 relative bg-[#f4f4f4] dark:bg-zinc-800/50 flex-shrink-0 overflow-hidden">
          <Image 
            src="/login-illustration-masterpiece.jpg" 
            alt="Tranogasy Masterpiece Illustration" 
            fill 
            className="object-cover animate-ken-burns" 
            unoptimized
            priority
          />
        </div>

        {/* Form Section */}
        <div className="flex-grow bg-white dark:bg-zinc-900 w-full rounded-t-[2.5rem] md:rounded-none -mt-8 md:mt-0 relative z-10 px-8 pt-8 pb-4 flex flex-col overflow-y-auto">
          <h1 className="text-[2rem] font-serif font-bold text-zinc-900 dark:text-white mb-6 tracking-tight">
            Log-in
          </h1>
          
          <form onSubmit={handleSubmit} className="flex flex-col gap-5 flex-grow">
            
            <div className="relative">
              <label className="text-[13px] font-bold text-zinc-900 dark:text-zinc-200 mb-1 block">Numéro de téléphone</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={handlePhoneNumberInput}
                placeholder="Votre numéro de téléphone"
                className="w-full border-0 border-b border-zinc-300 dark:border-zinc-700 focus:border-brand-green focus:ring-0 px-0 py-2 text-sm text-zinc-600 dark:text-zinc-400 bg-transparent outline-none transition-colors"
                required
              />
            </div>

            <div className="relative">
              <label className="text-[13px] font-bold text-zinc-900 dark:text-zinc-200 mb-1 block">Mot de passe</label>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Votre mot de passe"
                className="w-full border-0 border-b border-zinc-300 dark:border-zinc-700 focus:border-brand-green focus:ring-0 px-0 py-2 text-sm text-zinc-600 dark:text-zinc-400 bg-transparent outline-none transition-colors pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 bottom-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 outline-none"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <div className="flex justify-end -mt-2">
              <Link href="/password-recovery" className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors">
                Mot de passe oublié ?
              </Link>
            </div>

            {error && (
              <div className="text-red-500 text-xs font-semibold bg-red-50 dark:bg-red-900/20 p-2 rounded-md">
                {error}
              </div>
            )}

            <div className="mt-4 w-full">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-brand-green text-white font-semibold py-3.5 rounded-full hover:bg-emerald-600 transition-colors active:scale-[0.98] disabled:opacity-70 flex justify-center items-center"
              >
                {isLoading ? '...' : 'Se connecter'}
              </button>
            </div>
            
            <div className="mt-auto pt-4 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Vous n'avez pas de compte ?{' '}
              <Link href="/signup" className="text-zinc-800 dark:text-zinc-200 font-bold hover:underline">
                Créer un compte
              </Link>
            </div>

          </form>

        </div>

      </div>
    </div>
  );
}
