// src/components/AuthErrorCard.tsx
import React, { useState } from 'react';
import { 
  AlertCircle, 
  Copy, 
  Check, 
  HelpCircle, 
  RotateCcw, 
  ExternalLink,
  ShieldAlert,
  X
} from 'lucide-react';
import { TranslatedAuthError } from '../utils/authErrorTranslator';

interface AuthErrorCardProps {
  error: TranslatedAuthError | string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  onSwitchToEmail?: () => void;
  className?: string;
}

export const AuthErrorCard: React.FC<AuthErrorCardProps> = ({
  error,
  onRetry,
  onDismiss,
  onSwitchToEmail,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);

  if (!error) return null;

  // توحيد شكل كائن الخطأ
  const errorObj: TranslatedAuthError = typeof error === 'string' 
    ? {
        code: 'custom',
        title: 'تنبيه في تسجيل الدخول',
        message: error,
      }
    : error;

  const currentHostname = errorObj.unauthorizedDomain || (typeof window !== 'undefined' ? window.location.hostname : '');

  const handleCopyDomain = async () => {
    if (!currentHostname) return;
    try {
      await navigator.clipboard.writeText(currentHostname);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback copy
      const textArea = document.createElement('textarea');
      textArea.value = currentHostname;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div 
      className={`rounded-2xl border bg-rose-50/90 border-rose-200/90 p-4 text-rose-950 shadow-sm space-y-3 relative overflow-hidden transition-all duration-200 ${className}`}
      dir="rtl"
      role="alert"
    >
      {/* زر إغلاق التنبيه */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-3 left-3 p-1 rounded-lg text-rose-400 hover:text-rose-700 hover:bg-rose-100 transition"
          title="إغلاق التنبيه"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* الترويسة الرئيسية للخطأ بالعربية */}
      <div className="flex items-start gap-2.5 pl-6">
        <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
          {errorObj.isDomainError ? (
            <ShieldAlert className="w-4.5 h-4.5 text-rose-600" />
          ) : (
            <AlertCircle className="w-4.5 h-4.5 text-rose-600" />
          )}
        </div>
        <div>
          <h4 className="text-sm font-black text-rose-900 leading-tight">
            {errorObj.title}
          </h4>
          <p className="mt-1 text-xs text-rose-800 leading-relaxed font-medium">
            {errorObj.message}
          </p>
        </div>
      </div>

      {/* بطاقة حل مشكلة النطاق غير المصرح به (Unauthorized Domain) */}
      {errorObj.isDomainError && currentHostname && (
        <div className="p-3 bg-white/95 rounded-xl border border-rose-200 text-xs space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-slate-700 text-[11.5px]">
              النطاق المطلوب إضافته في Firebase:
            </span>
            <button
              type="button"
              onClick={handleCopyDomain}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer ${
                copied 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span>تم النسخ بنجاح!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>نسخ النطاق</span>
                </>
              )}
            </button>
          </div>

          <div className="p-2 rounded-lg bg-slate-900 text-emerald-400 font-mono text-xs text-left dir-ltr select-all break-all border border-slate-800">
            {currentHostname}
          </div>

          <div className="text-[11px] text-slate-600 leading-relaxed space-y-1">
            <p>
              📌 <strong>خطوات الحل في Firebase Console:</strong>
            </p>
            <ol className="list-decimal list-inside pr-1 space-y-0.5 text-slate-500">
              <li>افتح مشروعك في <span className="font-sans font-semibold text-slate-700">Firebase Console</span>.</li>
              <li>انتقل إلى <strong>Authentication</strong> ثم تبويب <strong>Settings</strong>.</li>
              <li>في قسم <strong>Authorized domains</strong>، انقر <strong>Add domain</strong> وألصق النطاق أعلاه.</li>
            </ol>
          </div>

          {onSwitchToEmail && (
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onSwitchToEmail}
                className="w-full py-2 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>حل فوري: الدخول بالبريد الإلكتروني وكلمة المرور دون انتظار</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* إرشادات ونصائح الحل الأخرى إن وجدت */}
      {!errorObj.isDomainError && errorObj.actionTip && (
        <div className="p-2.5 bg-amber-50/90 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
          <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="leading-relaxed font-medium">{errorObj.actionTip}</span>
        </div>
      )}

      {/* أزرار الإجراءات السريعة */}
      <div className="flex items-center gap-2 pt-1">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="py-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-2xs active:scale-98 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة المحاولة</span>
          </button>
        )}

        {onSwitchToEmail && !errorObj.isDomainError && (
          <button
            type="button"
            onClick={onSwitchToEmail}
            className="py-1.5 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
          >
            <span>استخدام البريد وكلمة المرور</span>
          </button>
        )}
      </div>
    </div>
  );
};
