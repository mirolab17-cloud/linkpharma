// src/store/useToastStore.ts
import { create } from 'zustand';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  duration?: number;
}

interface ToastState {
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastMessage = { ...toast, id, duration: toast.duration || 4000 };
    set((state) => ({ toasts: [...state.toasts, newToast] }));

    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, newToast.duration);
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  success: (message, title = 'تم بنجاح') => {
    useToastStore.getState().addToast({ type: 'success', title, message });
  },
  error: (message, title = 'حدث خطأ') => {
    useToastStore.getState().addToast({ type: 'error', title, message, duration: 6000 });
  },
  info: (message, title = 'معلومة') => {
    useToastStore.getState().addToast({ type: 'info', title, message });
  },
  warning: (message, title = 'تنبيه') => {
    useToastStore.getState().addToast({ type: 'warning', title, message });
  },
}));
