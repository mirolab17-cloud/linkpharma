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

// سجل منع التكرار خلال 10 ثوانٍ
const recentToastMap = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10_000;
const MAX_VISIBLE_TOASTS = 3;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const key = `${(toast.title || '').trim()}::${(toast.message || '').trim()}`;
    const now = Date.now();
    const lastSeen = recentToastMap.get(key);

    if (lastSeen && now - lastSeen < DEDUPE_WINDOW_MS) {
      return;
    }
    recentToastMap.set(key, now);

    // تنظيف السجل القديم
    for (const [k, timestamp] of recentToastMap.entries()) {
      if (now - timestamp > DEDUPE_WINDOW_MS * 2) {
        recentToastMap.delete(k);
      }
    }

    const id = Math.random().toString(36).substring(2, 9);
    const duration = toast.duration || 5000;
    const newToast: ToastMessage = { ...toast, id, duration };

    set((state) => {
      // الاحتفاظ بحد أقصى MAX_VISIBLE_TOASTS
      const updated = [...state.toasts, newToast];
      if (updated.length > MAX_VISIBLE_TOASTS) {
        return { toasts: updated.slice(updated.length - MAX_VISIBLE_TOASTS) };
      }
      return { toasts: updated };
    });

    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  success: (message, title = 'تم بنجاح') => {
    useToastStore.getState().addToast({ type: 'success', title, message, duration: 4000 });
  },
  error: (message, title = 'حدث خطأ') => {
    useToastStore.getState().addToast({ type: 'error', title, message, duration: 5000 });
  },
  info: (message, title = 'معلومة') => {
    useToastStore.getState().addToast({ type: 'info', title, message, duration: 4500 });
  },
  warning: (message, title = 'تنبيه') => {
    useToastStore.getState().addToast({ type: 'warning', title, message, duration: 5000 });
  },
}));
