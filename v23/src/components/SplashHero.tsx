// src/components/SplashHero.tsx — v22: واجهة محايدة بين الصيدلية والمستودع
import React, { useState, useEffect } from 'react';
import { Pill, Store, Play, Pause, RotateCcw, Check, ShieldCheck, MessageSquare, BadgeCheck } from 'lucide-react';
import { PharmacyBrandLoader } from './Loader';

interface SplashHeroProps {
  onGoogleSignIn?: () => void;
  onSelectRegister?: () => void;
  onSelectLogin?: () => void;
  hideActionButtons?: boolean;
  audience?: 'pharmacy' | 'warehouse';
  onAudienceChange?: (a: 'pharmacy' | 'warehouse') => void;
}

const CONTENT = {
  pharmacy: {
    title: 'قارن العروض بنفسك واختر ما يناسب صيدليتك',
    desc: 'اطّلع على أسعار وبونص المستودعات المسجلة، رتّبها حسب السعر أو البونص أو سرعة التوصيل، وتواصل مباشرة مع من تختار.',
    scenes: [
      { tag: '01. تصفّح العروض', title: 'أسعار وبونص من عدة مستودعات', sub: 'كل مستودع يدير أسعاره وعروضه بنفسه، وأنت ترتّب وتختار.' },
      { tag: '02. جهّز طلبيتك', title: 'مسودة طلبية بضغطة منك', sub: 'تجهّز رسالة جاهزة تراجعها وتعدّلها قبل أن ترسلها بنفسك.' },
      { tag: '03. تواصل مباشر', title: 'اتفاق مباشر مع المستودع', sub: 'السعر النهائي والدفع والتوصيل يُتفق عليها بينك وبين المستودع.' },
    ],
  },
  warehouse: {
    title: 'اعرض أسعارك وعروضك أمام صيدليات جديدة',
    desc: 'ارفع قائمتك وحدّد أنت أسعارك وشروطك، وتلقَّ طلبات الصيدليات والتواصل معها مباشرة.',
    scenes: [
      { tag: '01. اعرض قائمتك', title: 'أسعارك كما تدخلها أنت', sub: 'المنصة لا تعدّل أسعارك ولا تفرض عليك تسعيراً.' },
      { tag: '02. استقبل الطلبات', title: 'طلبات واضحة من صيدليات موثّقة', sub: 'تصلك رسائل جاهزة ومنسّقة من الصيدليات المهتمة بعروضك.' },
      { tag: '03. أدر علاقتك', title: 'شروطك أنت', sub: 'الحد الأدنى للطلب والتوصيل والدفع تحددها أنت وتتفق عليها مباشرة.' },
    ],
  },
} as const;

// أمثلة توضيحية فقط بأسماء عامة، بلا تفضيل لأي طرف
const DEMO = [
  { name: 'مستودع (أ)', price: '4.10 ₪', perk: 'بونص 10+1', note: 'توصيل خلال 24 ساعة' },
  { name: 'مستودع (ب)', price: '4.25 ₪', perk: 'خصم 5%', note: 'توصيل خلال 48 ساعة' },
];

export const SplashHero: React.FC<SplashHeroProps> = ({ audience = 'pharmacy', onAudienceChange }) => {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const c = CONTENT[audience];
  const accent = audience === 'pharmacy' ? 'emerald' : 'sky';

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setStep(p => (p + 1) % c.scenes.length), 4500);
    return () => clearInterval(t);
  }, [playing, c.scenes.length]);
  useEffect(() => setStep(0), [audience]);

  const scene = c.scenes[step];
  const tabCls = (a: 'pharmacy' | 'warehouse') =>
    `px-4 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
      audience === a ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
    }`;

  return (
    <div className="w-full text-right" dir="rtl">
      <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold mb-4">
        <PharmacyBrandLoader size="xs" glow={false} />
        <span>شبكة تواصل مهنية بين الصيدليات والمستودعات</span>
      </div>

      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight leading-snug">
        مكان واحد يجمع الصيدلية والمستودع
      </h1>
      <p className="mt-3 text-sm sm:text-base text-slate-600 font-medium leading-relaxed max-w-2xl">
        نعرض الأسعار والعروض ونسهّل التواصل المباشر بين الطرفين. الاتفاق والدفع والتوريد تتم بينكما مباشرة.
      </p>

      {/* تبديل الجمهور */}
      <div className="mt-6 flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button type="button" onClick={() => onAudienceChange?.('pharmacy')} className={tabCls('pharmacy')}>
            <Pill className="w-3.5 h-3.5 text-emerald-600" /><span>للصيدليات</span>
          </button>
          <button type="button" onClick={() => onAudienceChange?.('warehouse')} className={tabCls('warehouse')}>
            <Store className="w-3.5 h-3.5 text-sky-600" /><span>للمستودعات</span>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPlaying(!playing)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition" title={playing ? 'إيقاف مؤقت' : 'تشغيل'}>
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button type="button" onClick={() => setStep(p => (p + 1) % c.scenes.length)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition" title="المشهد التالي">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <h2 className="mt-4 text-lg font-black text-slate-900">{c.title}</h2>
      <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed">{c.desc}</p>

      {/* عرض توضيحي محايد */}
      <div className="mt-4 rounded-3xl bg-slate-900 text-white p-5 sm:p-6 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className={`absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl pointer-events-none ${accent === 'emerald' ? 'bg-emerald-500/10' : 'bg-sky-500/10'}`} />
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 relative">
          <span className="text-xs font-bold text-slate-200">مثال توضيحي — الأسماء والأرقام وهمية</span>
          <div className="flex items-center gap-1.5">
            {c.scenes.map((_, i) => (
              <button key={i} type="button" onClick={() => setStep(i)} aria-label={`المشهد ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === step ? `w-6 ${accent === 'emerald' ? 'bg-emerald-400' : 'bg-sky-400'}` : 'w-2 bg-slate-700 hover:bg-slate-600'}`} />
            ))}
          </div>
        </div>

        <div className="space-y-4 relative">
          <div>
            <span className={`text-[11px] font-bold block mb-0.5 ${accent === 'emerald' ? 'text-emerald-400' : 'text-sky-400'}`}>{scene.tag}</span>
            <h3 className="text-base sm:text-lg font-black text-white">{scene.title}</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{scene.sub}</p>

          <div className="bg-slate-800/90 rounded-2xl p-4 border border-slate-700/80">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700/60">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-700 text-slate-200 flex items-center justify-center"><Pill className="w-4 h-4 rotate-45" /></div>
                <div>
                  <span className="text-xs font-black text-white block">صنف تجريبي (14 حبة)</span>
                  <span className="text-[10px] text-slate-400">رتّب حسب: السعر · البونص · التوصيل</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {DEMO.map(d => (
                <div key={d.name} className="p-3 rounded-xl bg-slate-900/70 border border-slate-600 text-right">
                  <div className="text-[11px] text-slate-300 font-bold mb-1">{d.name}</div>
                  <div className="text-sm sm:text-base font-black text-white">{d.price}</div>
                  <div className="text-[10px] text-slate-300 mt-0.5">{d.perk}</div>
                  <div className="text-[10px] text-slate-400">{d.note}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1 text-slate-300"><Check className="w-3.5 h-3.5" /><span>القرار النهائي للمستخدم وليس للمنصة</span></span>
            <span>المشهد {step + 1} من {c.scenes.length}</span>
          </div>
        </div>
      </div>

      {/* نقاط القوة */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: <BadgeCheck className="w-4 h-4 text-emerald-600" />, t: 'حسابات موثّقة', d: 'نراجع ترخيص الصيدليات والمستودعات قبل تفعيل الحساب.' },
          { icon: <ShieldCheck className="w-4 h-4 text-sky-600" />, t: 'أسعار من المصدر', d: 'كل مستودع يدير أسعاره وعروضه بنفسه، وتاريخ التحديث ظاهر.' },
          { icon: <MessageSquare className="w-4 h-4 text-slate-600" />, t: 'تواصل مباشر', d: 'رسالة واتساب جاهزة تُرسل منك، والاتفاق بينكما مباشرة.' },
        ].map(x => (
          <div key={x.t} className="p-3.5 rounded-2xl bg-white border border-slate-200/90">
            <div className="text-xs font-black text-slate-900 mb-1 flex items-center gap-1.5">{x.icon}<span>{x.t}</span></div>
            <p className="text-[11px] text-slate-500 leading-relaxed">{x.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
