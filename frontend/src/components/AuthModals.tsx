'use client';

import { useState, useEffect } from 'react';
import { useModalStore } from '@/store/modalStore';
import PhoneAuthFlow from '@/components/auth/PhoneAuthFlow';

export default function AuthModals() {
  const { activeModal, closeModal } = useModalStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || !activeModal) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col md:items-center md:justify-center bg-[#F6F6F4] dark:bg-zinc-950 md:bg-black/45 md:dark:bg-black/65 md:backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="w-full h-[100dvh] md:h-auto flex flex-col md:items-center md:justify-center animate-in slide-in-from-bottom-4 md:zoom-in-95 duration-300">
        <PhoneAuthFlow mode="modal" onClose={closeModal} />
      </div>
    </div>
  );
}
