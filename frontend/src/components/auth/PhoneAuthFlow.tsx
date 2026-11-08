'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ChevronLeft, X, Loader2, CheckCircle2, Phone, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfileStore } from '@/store/profileStore';

type AuthStep = 'phone' | 'verify' | 'welcome';

interface PhoneAuthFlowProps {
  mode?: 'page' | 'modal';
  redirectUrl?: string;
  onClose?: () => void;
}

export default function PhoneAuthFlow({
  mode = 'page',
  redirectUrl = '/profile',
  onClose,
}: PhoneAuthFlowProps) {
  const router = useRouter();
  const setIsEditModalOpen = useProfileStore((state) => state.setIsEditModalOpen);

  const {
    requestSmsVerification,
    resendSmsVerification,
    verifySmsCodeAndAuthenticate,
    saveNewAccountUsername,
    clearError,
    verifiedPhone,
    isLoading,
    error,
  } = useAuth();

  const [step, setStep] = useState<AuthStep>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '']);
  const [username, setUsername] = useState('');
  const [resendFeedback, setResendFeedback] = useState(false);

  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const usernameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step === 'phone') {
      const timer = setTimeout(() => {
        phoneInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
    if (step === 'verify') {
      const timer = setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
    if (step === 'welcome') {
      const timer = setTimeout(() => {
        usernameInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numeric = e.target.value.replace(/\D/g, '').slice(0, 12);
    setPhoneNumber(numeric);
    if (error) clearError();
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await requestSmsVerification(phoneNumber);
    if (result.success) {
      setOtpDigits(['', '', '', '', '']);
      setResendFeedback(false);
      setStep('verify');
    }
  };

  const handleOtpDigitChange = (index: number, value: string) => {
    if (error) clearError();
    const numeric = value.replace(/\D/g, '');

    if (!numeric) {
      const next = [...otpDigits];
      next[index] = '';
      setOtpDigits(next);
      return;
    }

    if (numeric.length > 1) {
      const chars = numeric.slice(0, 5).split('');
      const next = [...otpDigits];
      chars.forEach((char, idx) => {
        if (index + idx < 5) {
          next[index + idx] = char;
        }
      });
      setOtpDigits(next);
      const focusIdx = Math.min(index + chars.length, 4);
      otpInputRefs.current[focusIdx]?.focus();
      return;
    }

    const next = [...otpDigits];
    next[index] = numeric;
    setOtpDigits(next);

    if (index < 4) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (otpDigits[index]) {
        const next = [...otpDigits];
        next[index] = '';
        setOtpDigits(next);
      } else if (index > 0) {
        const next = [...otpDigits];
        next[index - 1] = '';
        setOtpDigits(next);
        otpInputRefs.current[index - 1]?.focus();
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 4) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 5);
    if (!pasted) return;
    if (error) clearError();

    const next = ['', '', '', '', ''];
    pasted.split('').forEach((ch, idx) => {
      next[idx] = ch;
    });
    setOtpDigits(next);
    const focusIdx = Math.min(pasted.length, 4);
    otpInputRefs.current[focusIdx]?.focus();
  };

  const handleResendCode = async () => {
    const res = await resendSmsVerification(verifiedPhone || phoneNumber);
    if (res.success) {
      setOtpDigits(['', '', '', '', '']);
      setResendFeedback(true);
      otpInputRefs.current[0]?.focus();
      setTimeout(() => setResendFeedback(false), 4000);
    }
  };

  const finishExistingUserLogin = () => {
    if (mode === 'modal' && onClose) {
      onClose();
      return;
    }
    router.push(redirectUrl || '/');
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = otpDigits.join('');
    const result = await verifySmsCodeAndAuthenticate(fullCode, verifiedPhone || phoneNumber);

    if (result.success) {
      if (result.isNewAccount) {
        setStep('welcome');
      } else {
        finishExistingUserLogin();
      }
    }
  };

  const handleWelcomeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      const res = await saveNewAccountUsername(username);
      if (!res.success) return;
    }
    setIsEditModalOpen(true);
    if (mode === 'modal' && onClose) {
      onClose();
    }
    router.push('/profile');
  };

  const handleSkipWelcome = async () => {
    if (username.trim()) {
      await saveNewAccountUsername(username);
    }
    if (mode === 'modal' && onClose) {
      onClose();
      return;
    }
    router.push('/');
  };

  return (
    <div
      className={`w-full ${
        mode === 'modal'
          ? 'h-[100dvh] md:h-auto md:max-h-[92dvh]'
          : 'min-h-[calc(100dvh-4rem)] md:min-h-0 md:h-auto'
      } flex flex-col md:max-w-[410px] md:rounded-[2.5rem] md:shadow-[0_24px_60px_rgba(0,0,0,0.14)] dark:md:shadow-[0_24px_60px_rgba(0,0,0,0.5)] overflow-hidden relative bg-[#F5F5F3] dark:bg-zinc-900 select-none transition-all duration-300`}
    >
      {/* Decorative Corner Circles matching the reference UI — scaled proportionally for mobile & desktop */}
      {step === 'phone' && (
        <div
          aria-hidden="true"
          className="absolute -top-6 right-10 w-16 h-12 md:-top-5 md:right-9 md:w-12 md:h-10 rounded-full bg-brand-green/20 dark:bg-brand-green/15 pointer-events-none z-0"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute -bottom-8 -left-8 w-32 h-32 md:-bottom-6 md:-left-6 md:w-24 md:h-24 rounded-full bg-brand-green/20 dark:bg-brand-green/15 pointer-events-none z-0"
      />

      {/* Top Navigation / Header Bar */}
      <div className="relative z-10 flex items-center justify-between px-6 sm:px-8 pt-9 pb-2 md:px-6 md:pt-7 min-h-[76px] md:min-h-[60px] shrink-0">
        {step !== 'phone' ? (
          <button
            type="button"
            onClick={() => {
              clearError();
              if (step === 'verify') {
                setStep('phone');
              } else {
                handleSkipWelcome();
              }
            }}
            aria-label="Retour"
            className="w-10 h-10 md:w-9 md:h-9 -ml-2 md:-ml-1.5 rounded-full flex items-center justify-center text-zinc-800 dark:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" strokeWidth={2.3} />
          </button>
        ) : (
          <div className="w-10 h-10 md:w-9 md:h-9" />
        )}

        <h1 className="text-[21px] sm:text-[23px] md:text-[18px] font-bold text-zinc-900 dark:text-white tracking-tight text-center flex-1">
          {step === 'phone' && 'Connexion'}
          {step === 'verify' && 'Vérification du numéro'}
          {step === 'welcome' && 'Compte créé'}
        </h1>

        {mode === 'modal' && onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-10 h-10 md:w-9 md:h-9 -mr-2 md:-mr-1.5 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
          >
            <X className="w-6 h-6 md:w-5 md:h-5" strokeWidth={2.3} />
          </button>
        ) : (
          <div className="w-10 h-10 md:w-9 md:h-9" />
        )}
      </div>

      {/* Main Step Content — Adaptive flex distribution so mobile fills naturally and desktop stays sleek */}
      <div className="relative z-10 flex-1 flex flex-col px-7 sm:px-9 md:px-8 pt-2 pb-12 md:pb-9 overflow-y-auto no-scrollbar">
        {/* ============================================================
            STEP 1: PHONE NUMBER INPUT ("Connexion")
        ============================================================ */}
        {step === 'phone' && (
          <div className="flex-1 flex flex-col justify-evenly md:justify-start gap-6 md:gap-5 max-w-[390px] w-full mx-auto animate-in fade-in slide-in-from-right-3 duration-300">
            {/* Step 1 Vector Illustration */}
            <div className="relative w-full flex-1 md:flex-none min-h-[220px] max-h-[390px] md:min-h-0 md:h-[225px] mx-auto flex items-center justify-center">
              <Image
                src="/images/login-step1-phone.png"
                alt="Connexion avec numéro de téléphone TranoGasy"
                fill
                className="object-contain p-1 md:p-0 drop-shadow-[0_10px_24px_rgba(0,0,0,0.04)]"
                unoptimized
                priority
              />
            </div>

            {/* Phone Form */}
            <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-5 md:gap-4 w-full shrink-0">
              <div className="relative">
                <div className="flex items-center w-full h-[58px] md:h-12 rounded-full bg-[#E6E4EA] dark:bg-zinc-800/90 px-6 md:px-5 border-2 border-transparent focus-within:border-brand-green focus-within:bg-white dark:focus-within:bg-zinc-800 transition-all shadow-xs">
                  <Phone className="w-5 h-5 md:w-4 md:h-4 text-zinc-500 dark:text-zinc-400 mr-3.5 md:mr-3 shrink-0" />
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    inputMode="numeric"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    placeholder="Numéro de téléphone"
                    className="w-full bg-transparent text-[16px] md:text-sm font-semibold text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 placeholder:font-medium outline-none"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="text-red-600 dark:text-red-400 text-xs sm:text-sm md:text-xs font-semibold bg-red-500/10 border border-red-500/20 px-4 py-3 md:py-2.5 rounded-full text-center animate-in fade-in duration-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !phoneNumber.trim()}
                className="w-full h-[58px] md:h-12 bg-brand-green hover:bg-[#6da819] disabled:opacity-60 text-white font-bold text-[16px] md:text-sm rounded-full shadow-[0_8px_22px_rgba(124,189,30,0.34)] hover:shadow-[0_10px_26px_rgba(124,189,30,0.44)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 md:w-4 md:h-4 animate-spin" />
                    <span>Envoi du code...</span>
                  </>
                ) : (
                  <span>Se connecter</span>
                )}
              </button>

              {/* Passwordless & Automatic Account Creation Info */}
              <div className="pt-2 md:pt-1 text-center">
                <p className="text-[13px] md:text-[11.5px] leading-relaxed font-medium text-zinc-500 dark:text-zinc-400 max-w-[315px] md:max-w-[275px] mx-auto">
                  Aucun mot de passe requis. Un code SMS vérifiera votre numéro et créera votre compte automatiquement lors de votre première connexion.
                </p>
              </div>
            </form>
          </div>
        )}

        {/* ============================================================
            STEP 2: 5-DIGIT SMS CODE VERIFICATION
        ============================================================ */}
        {step === 'verify' && (
          <div className="flex-1 flex flex-col justify-evenly md:justify-start gap-6 md:gap-4 max-w-[390px] w-full mx-auto animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Step 2 Vector Illustration */}
            <div className="relative w-full flex-1 md:flex-none min-h-[210px] max-h-[370px] md:min-h-0 md:h-[210px] mx-auto flex items-center justify-center">
              <Image
                src="/images/login-step2-verify.png"
                alt="Vérification par SMS TranoGasy"
                fill
                className="object-contain p-1 md:p-0 drop-shadow-[0_10px_24px_rgba(0,0,0,0.04)]"
                unoptimized
                priority
              />
            </div>

            <form onSubmit={handleVerifySubmit} className="flex flex-col items-center gap-5 md:gap-4 w-full shrink-0">
              <p className="text-center text-[15px] md:text-[13px] font-medium text-zinc-700 dark:text-zinc-300 leading-relaxed max-w-[300px] md:max-w-[260px]">
                Entrez le code à 5 chiffres envoyé à ce numéro :{' '}
                <span className="font-extrabold text-zinc-950 dark:text-white">
                  {verifiedPhone || phoneNumber}
                </span>
              </p>

              {/* Very Rounded 5-Digit Pill Container */}
              <div className="w-full h-[62px] md:h-13 rounded-full bg-[#E6E4EA] dark:bg-zinc-800/90 px-7 md:px-6 flex items-center justify-center gap-4 md:gap-3 shadow-xs">
                {otpDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      otpInputRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={digit}
                    onChange={(e) => handleOtpDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    onPaste={handleOtpPaste}
                    aria-label={`Chiffre ${index + 1}`}
                    className={`w-11 md:w-9 h-11 md:h-9 text-center text-xl md:text-lg font-extrabold bg-transparent border-0 border-b-[2.5px] md:border-b-2 outline-none transition-all ${
                      digit
                        ? 'border-brand-green text-zinc-950 dark:text-white'
                        : 'border-zinc-400 dark:border-zinc-500 text-zinc-900 dark:text-white focus:border-brand-green'
                    }`}
                  />
                ))}
              </div>

              {/* Resend code link */}
              <div className="flex flex-col items-center gap-1.5 my-0.5">
                <button
                  type="button"
                  onClick={handleResendCode}
                  className="text-[14px] md:text-xs font-semibold text-zinc-700 dark:text-zinc-300 underline underline-offset-4 hover:text-brand-green dark:hover:text-brand-green transition-colors cursor-pointer py-1"
                >
                  Renvoyer le code ?
                </button>
                {resendFeedback && (
                  <span className="inline-flex items-center gap-1 text-xs md:text-[11px] font-semibold text-brand-green animate-in fade-in duration-200">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Nouveau code envoyé (voir console)
                  </span>
                )}
              </div>

              {error && (
                <div className="w-full text-red-600 dark:text-red-400 text-xs sm:text-sm md:text-xs font-semibold bg-red-500/10 border border-red-500/20 px-4 py-3 md:py-2.5 rounded-full text-center animate-in fade-in duration-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || otpDigits.join('').length !== 5}
                className="w-full h-[58px] md:h-12 bg-brand-green hover:bg-[#6da819] disabled:opacity-60 text-white font-bold text-[16px] md:text-sm rounded-full shadow-[0_8px_22px_rgba(124,189,30,0.34)] hover:shadow-[0_10px_26px_rgba(124,189,30,0.44)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 md:w-4 md:h-4 animate-spin" />
                    <span>Vérification...</span>
                  </>
                ) : (
                  <span>Vérifier</span>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ============================================================
            STEP 3: ACCOUNT CREATED ("Compte créé" - First Login Only)
        ============================================================ */}
        {step === 'welcome' && (
          <div className="flex-1 flex flex-col justify-evenly md:justify-start gap-5 md:gap-4 max-w-[390px] w-full mx-auto animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Step 3 Vector Illustration */}
            <div className="relative w-full flex-1 md:flex-none min-h-[200px] max-h-[340px] md:min-h-0 md:h-[205px] mx-auto flex items-center justify-center">
              <Image
                src="/images/login-step3-welcome.png"
                alt="Bienvenue dans la communauté TranoGasy"
                fill
                className="object-contain p-1 md:p-0 drop-shadow-[0_10px_24px_rgba(0,0,0,0.04)]"
                unoptimized
                priority
              />
            </div>

            <form onSubmit={handleWelcomeSubmit} className="flex flex-col w-full shrink-0">
              <h2 className="text-2xl md:text-xl font-extrabold text-zinc-900 dark:text-white tracking-tight mb-1.5 md:mb-1 truncate">
                {username.trim() ? `Bienvenue, ${username.trim()} !` : 'Bienvenue,'}
              </h2>
              <p className="text-[14.5px] md:text-[13px] font-medium text-zinc-600 dark:text-zinc-400 leading-relaxed mb-5 md:mb-4">
                Indiquez votre nom et complétez votre profil pour profiter d&apos;un fil d&apos;actualité personnalisé.
              </p>

              {/* Very Rounded Username Input */}
              <div className="flex items-center w-full h-[58px] md:h-12 rounded-full bg-[#E6E4EA] dark:bg-zinc-800/90 px-6 md:px-5 border-2 border-transparent focus-within:border-brand-green focus-within:bg-white dark:focus-within:bg-zinc-800 transition-all shadow-xs mb-4">
                <User className="w-5 h-5 md:w-4 md:h-4 text-zinc-500 dark:text-zinc-400 mr-3.5 md:mr-3 shrink-0" />
                <input
                  ref={usernameInputRef}
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (error) clearError();
                  }}
                  placeholder="Votre nom d'utilisateur"
                  maxLength={40}
                  className="w-full bg-transparent text-[16px] md:text-sm font-semibold text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 placeholder:font-medium outline-none"
                />
              </div>

              {error && (
                <div className="w-full text-red-600 dark:text-red-400 text-xs sm:text-sm md:text-xs font-semibold bg-red-500/10 border border-red-500/20 px-4 py-3 md:py-2.5 rounded-full text-center mb-4 animate-in fade-in duration-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-[58px] md:h-12 bg-brand-green hover:bg-[#6da819] disabled:opacity-60 text-white font-bold text-[16px] md:text-sm rounded-full shadow-[0_8px_22px_rgba(124,189,30,0.34)] hover:shadow-[0_10px_26px_rgba(124,189,30,0.44)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 md:w-4 md:h-4 animate-spin" />
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  <span>Compléter mon profil</span>
                )}
              </button>

              <div className="mt-5 md:mt-4 text-center">
                <button
                  type="button"
                  onClick={handleSkipWelcome}
                  className="text-[14.5px] md:text-xs font-semibold text-zinc-700 dark:text-zinc-300 underline underline-offset-4 hover:text-brand-green dark:hover:text-brand-green transition-colors cursor-pointer py-1"
                >
                  {username.trim() ? 'Enregistrer et passer' : 'Passer'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
