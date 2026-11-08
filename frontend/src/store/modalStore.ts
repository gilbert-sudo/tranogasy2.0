import { create } from 'zustand';

type ModalType = 'login' | 'signup' | null;

interface ModalStore {
  activeModal: 'login' | null;
  openModal: (type: ModalType) => void;
  closeModal: () => void;
}

export const useModalStore = create<ModalStore>((set) => ({
  activeModal: null,
  openModal: (type) => set({ activeModal: type ? 'login' : null }),
  closeModal: () => set({ activeModal: null }),
}));
