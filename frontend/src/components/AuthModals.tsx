'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Eye, EyeOff, Camera, X, Check } from 'lucide-react';
import { useModalStore } from '@/store/modalStore';
import { useUserStore } from '@/store/userStore';

export default function AuthModals() {
  const { activeModal, closeModal, openModal } = useModalStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || !activeModal) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col md:items-center md:justify-center bg-zinc-50 dark:bg-zinc-950 md:bg-black/40 md:dark:bg-black/60 md:backdrop-blur-sm animate-in fade-in duration-200">
      
      {/* Modal Container */}
      <div className="w-full h-[100dvh] md:h-auto flex-grow flex flex-col md:flex-grow-0 md:max-w-md md:rounded-[2rem] md:shadow-2xl md:overflow-hidden relative bg-zinc-50 dark:bg-zinc-900 animate-in slide-in-from-bottom-4 md:zoom-in-95 duration-300">
        
        {/* Close Button */}
        <button 
          onClick={closeModal}
          className="absolute top-4 right-4 z-50 p-2 bg-white/70 dark:bg-black/50 backdrop-blur-md rounded-full text-zinc-800 dark:text-zinc-200 hover:bg-white dark:hover:bg-zinc-800 transition-colors shadow-sm"
        >
          <X size={20} />
        </button>

        {activeModal === 'login' && <LoginForm openModal={openModal} closeModal={closeModal} />}
        {activeModal === 'signup' && <SignupForm openModal={openModal} closeModal={closeModal} />}
        
      </div>
    </div>
  );
}

function LoginForm({ openModal, closeModal }: { openModal: any, closeModal: any }) {
  const [showPassword, setShowPassword] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setUser = useUserStore((state) => state.setUser);

  const handlePhoneNumberInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numericValue = e.target.value.replace(/\D/g, "");
    setPhoneNumber(numericValue);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      let phone = phoneNumber;
      if (phone.startsWith("261")) phone = phone.slice(3);
      if (phone.startsWith("0")) phone = phone;
      else phone = `0${phone}`;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/users/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        // NestJS typically sends the error description in data.message
        throw new Error(data.message || data.error || 'Erreur lors de la connexion');
      }

      localStorage.setItem('user', JSON.stringify(data));
      
      setUser(data);
      closeModal();
    } catch (err: any) {
      setError(err.message || "Impossible de se connecter.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="w-full h-[30vh] md:h-56 relative bg-[#f4f4f4] dark:bg-zinc-800/50 flex-shrink-0 overflow-hidden">
        <Image 
          src="/login-illustration-masterpiece.jpg" 
          alt="Tranogasy Masterpiece Illustration" 
          fill 
          className="object-cover animate-ken-burns" 
          unoptimized
          priority
        />
      </div>

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

          <div className="flex justify-end items-center -mt-2">
            <button type="button" className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors">
              Mot de passe oublié ?
            </button>
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
          
          <div className="mt-auto pt-4 pb-2 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            Vous n'avez pas de compte ?{' '}
            <button type="button" onClick={() => openModal('signup')} className="text-zinc-800 dark:text-zinc-200 font-bold hover:underline">
              Créer un compte
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function SignupForm({ openModal, closeModal }: { openModal: any, closeModal: any }) {
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setUser = useUserStore((state) => state.setUser);

  const handlePhoneNumberInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numericValue = e.target.value.replace(/\D/g, "");
    setPhoneNumber(numericValue);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      let phone = phoneNumber;
      if (phone.startsWith("261")) phone = phone.slice(3);
      if (phone.startsWith("0")) phone = phone;
      else phone = `0${phone}`;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      
      const checkRes = await fetch(`${apiUrl}/users/exist/${phone}`);
      if (checkRes.ok) {
        throw new Error("Ce numéro de téléphone est déjà utilisé.");
      }

      const res = await fetch(`${apiUrl}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, email, phone, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Erreur lors de la création du compte');

      // For signup, always log the user in directly and persist to local storage
      localStorage.setItem('user', JSON.stringify(data));
      setUser(data);
      closeModal();
    } catch (err: any) {
      setError(err.message || "Une erreur s'est produite.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="w-full h-[25vh] md:h-48 relative bg-[#f4f4f4] dark:bg-zinc-800/50 flex-shrink-0">
        <Image 
          src="/signup-illustration.svg" 
          alt="Signup Illustration" 
          fill 
          className="object-cover md:object-contain p-4" 
          unoptimized
        />
      </div>

      <div className="flex-grow bg-white dark:bg-zinc-900 w-full rounded-t-[2.5rem] md:rounded-none -mt-8 md:mt-0 relative z-10 px-8 pt-6 pb-4 flex flex-col overflow-y-auto">
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full bg-zinc-200 dark:bg-zinc-800 border-4 border-white dark:border-zinc-900 shadow-md overflow-hidden group cursor-pointer flex items-center justify-center">
          <Image 
            src="https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=200&auto=format&fit=crop" 
            alt="Profile avatar" 
            fill 
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="text-white w-6 h-6" />
          </div>
          <div className="absolute bottom-0 right-0 bg-brand-green rounded-full p-1 border-2 border-white dark:border-zinc-900 translate-x-2 translate-y-2">
            <Camera className="text-white w-3 h-3" />
          </div>
        </div>

        <h1 className="text-2xl font-serif font-bold text-zinc-900 dark:text-white mb-4 tracking-tight text-center mt-3">
          Sign-up
        </h1>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-grow">
          <div className="relative">
            <label className="text-[13px] font-bold text-zinc-900 dark:text-zinc-200 mb-1 block">Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Votre nom"
              className="w-full border-0 border-b border-zinc-300 dark:border-zinc-700 focus:border-brand-green focus:ring-0 px-0 py-2 text-sm text-zinc-600 dark:text-zinc-400 bg-transparent outline-none transition-colors"
              required
            />
          </div>

          <div className="relative">
            <label className="text-[13px] font-bold text-zinc-900 dark:text-zinc-200 mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Votre email"
              className="w-full border-0 border-b border-zinc-300 dark:border-zinc-700 focus:border-brand-green focus:ring-0 px-0 py-2 text-sm text-zinc-600 dark:text-zinc-400 bg-transparent outline-none transition-colors"
              required
            />
          </div>

          <div className="relative">
            <label className="text-[13px] font-bold text-zinc-900 dark:text-zinc-200 mb-1 block">Contact</label>
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
              {isLoading ? '...' : "S'inscrire"}
            </button>
          </div>

          <div className="mt-auto pt-2 pb-2 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            Vous avez déjà un compte ?{' '}
            <button type="button" onClick={() => openModal('login')} className="text-zinc-800 dark:text-zinc-200 font-bold hover:underline">
              Se connecter
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
