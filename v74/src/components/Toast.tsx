// src/components/Toast.tsx
import React from 'react';
import { useToastStore, ToastMessage } from '../store/useToastStore';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-5 left-5 right-5 sm:right-auto sm:left-6 z-50 flex flex-col space-y-3 pointer-events-none max-w-md w-full">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onClose: () => void }> = ({ toast, onClose }) => {
  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-sky-600 shrink-0" />;
    }
  };

  const getBorderColor = () => {
    switch (toast.type) {
      case 'success':
        return 'border-emerald-200 bg-emerald-50/95';
      case 'error':
        return 'border-rose-200 bg-rose-50/95';
      case 'warning':
        return 'border-amber-200 bg-amber-50/95';
      case 'info':
      default:
        return 'border-sky-200 bg-sky-50/95';
    }
  };

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-lg backdrop-blur transition-all duration-200 animate-in fade-in slide-in-from-top-2 ${getBorderColor()}`}
    >
      {getIcon()}
      <div className="flex-1 text-right">
        {toast.title && <h4 className="text-sm font-bold text-slate-800">{toast.title}</h4>}
        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{toast.message}</p>
      </div>
      <button
        onClick={onClose}
        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-black/5 transition"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
