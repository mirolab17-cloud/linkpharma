// src/components/Toast.tsx
import React from 'react';
import { useToastStore, ToastMessage } from '../store/useToastStore';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div 
      className="fixed top-4 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-6 sm:right-auto z-50 flex flex-col space-y-2 pointer-events-none max-w-sm w-[92vw] sm:w-88"
      dir="rtl"
    >
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
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />;
      case 'info':
      default:
        return <Info className="w-4 h-4 text-sky-600 shrink-0" />;
    }
  };

  const getBorderColor = () => {
    switch (toast.type) {
      case 'success':
        return 'border-emerald-200 bg-white/95 text-slate-800 shadow-emerald-500/5';
      case 'error':
        return 'border-rose-200 bg-white/95 text-slate-800 shadow-rose-500/5';
      case 'warning':
        return 'border-amber-200 bg-white/95 text-slate-800 shadow-amber-500/5';
      case 'info':
      default:
        return 'border-sky-200 bg-white/95 text-slate-800 shadow-sky-500/5';
    }
  };

  return (
    <div
      className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-xl border shadow-lg backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-top-2 ${getBorderColor()}`}
    >
      <div className="mt-0.5">{getIcon()}</div>
      <div className="flex-1 text-right min-w-0">
        {toast.title && <h4 className="text-xs font-bold text-slate-900 leading-tight">{toast.title}</h4>}
        <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed break-words">{toast.message}</p>
      </div>
      <button
        onClick={onClose}
        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition shrink-0 cursor-pointer"
        aria-label="إغلاق"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
