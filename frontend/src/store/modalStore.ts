import { create } from 'zustand';

type ModalType = 'login' | 'signup' | 'forgot_password' | null;

interface ModalStore {
  activeModal: ModalType;
  openModal: (type: ModalType) => void;
  closeModal: () => void;
}

export const useModalStore = create<ModalStore>((set) => ({
  activeModal: null,
  openModal: (type) => set({ activeModal: type }),
  closeModal: () => set({ activeModal: null }),
}));
