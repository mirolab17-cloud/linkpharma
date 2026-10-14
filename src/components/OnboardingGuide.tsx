import React, { useState } from 'react';
import { ArrowLeft, BarChart3, Check, ShoppingCart, X } from 'lucide-react';

export const OnboardingGuide: React.FC = () => {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(() => localStorage.getItem('pharma_onboarding_seen') !== 'yes');
  if (!open) return null;

  const steps = [
    { icon: BarChart3, title: 'قارن بذكاء', text: 'استعرض أسعار وبونص الصنف نفسه بين المستودعات المعتمدة.' },
    { icon: ShoppingCart, title: 'كوّن طلبيتك', text: 'أضف الكميات إلى السلة ودع المنصة تقترح التوزيع الأقل سعراً.' },
    { icon: Check, title: 'أرسل بثقة', text: 'بعد اكتمال بياناتك، تُحفظ الطلبية وتفتح رسالة واتساب للمورد.' },
  ];
  const current = steps[step];
  const Icon = current.icon;
  const finish = () => { localStorage.setItem('pharma_onboarding_seen', 'yes'); setOpen(false); };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm p-4 flex items-center justify-center" dir="rtl" role="dialog" aria-modal="true" aria-label="دليل البدء">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl p-6 relative">
        <button type="button" onClick={finish} className="absolute top-4 left-4 p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="إغلاق"><X className="w-4 h-4" /></button>
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-[#0f9d7a] flex items-center justify-center mb-5"><Icon className="w-8 h-8" /></div>
        <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-black mb-1">خطوات سريعة {step + 1} من 3</p>
        <h2 className="text-xl font-black text-slate-900 dark:text-white">{current.title}</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{current.text}</p>
        <div className="flex gap-1.5 mt-6 mb-5">{steps.map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-[#0f9d7a]' : 'bg-slate-200 dark:bg-slate-700'}`} />)}</div>
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={finish} className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white">تخطي</button>
          {step < steps.length - 1 ? <button type="button" onClick={() => setStep(step + 1)} className="px-5 py-2.5 rounded-xl bg-[#0f9d7a] text-white text-xs font-black flex items-center gap-2">التالي <ArrowLeft className="w-4 h-4" /></button> : <button type="button" onClick={finish} className="px-5 py-2.5 rounded-xl bg-[#0f9d7a] text-white text-xs font-black">ابدأ الآن</button>}
        </div>
      </div>
    </div>
  );
};
