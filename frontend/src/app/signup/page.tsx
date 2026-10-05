'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Camera } from 'lucide-react';
import Image from 'next/image';

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
      
      // Step 1: Check if user exists
      const checkRes = await fetch(`${apiUrl}/users/exist/${phone}`);
      if (checkRes.ok) {
        throw new Error("Ce numéro de téléphone est déjà utilisé.");
      }

      // Step 2: Create user
      const res = await fetch(`${apiUrl}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: name,
          email,
          phone,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la création du compte');
      }

      localStorage.setItem('user', JSON.stringify(data));
      window.location.href = '/profile';
    } catch (err: any) {
      setError(err.message || "Une erreur s'est produite. Veuillez réessayer.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100dvh-4rem)] md:h-[100dvh] bg-zinc-50 dark:bg-zinc-950 flex flex-col md:items-center md:justify-center font-sans overflow-hidden">
      
      {/* Container (Full height on mobile, Card on desktop) */}
      <div className="w-full flex-grow flex flex-col md:flex-grow-0 md:max-w-md md:rounded-[2rem] md:shadow-2xl md:overflow-hidden relative bg-zinc-50 dark:bg-zinc-900">
        
        {/* Top Image */}
        <div className="w-full h-[25vh] md:h-56 relative bg-[#f4f4f4] dark:bg-zinc-800/50 flex-shrink-0">
          <Image 
            src="/signup-illustration.svg" 
            alt="Signup Illustration" 
            fill 
            className="object-cover md:object-contain p-4" 
            unoptimized
          />
        </div>

        {/* Form Section */}
        <div className="flex-grow bg-white dark:bg-zinc-900 w-full rounded-t-[2.5rem] md:rounded-none -mt-8 md:mt-0 relative z-10 px-8 pt-6 pb-4 flex flex-col overflow-y-auto">
          
          {/* Circular Avatar */}
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

            <div className="mt-auto pt-2 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Vous avez déjà un compte ?{' '}
              <Link href="/login" className="text-zinc-800 dark:text-zinc-200 font-bold hover:underline">
                Se connecter
              </Link>
            </div>

          </form>
        </div>

      </div>
    </div>
  );
}
