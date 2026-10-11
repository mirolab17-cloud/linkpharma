// src/components/SplashHero.tsx
import React, { useState } from 'react';
import { 
  Pill, 
  TrendingDown, 
  Zap, 
  Sparkles, 
  CheckCircle2, 
  Layers, 
  ArrowLeft,
  DollarSign,
  Percent,
  Clock,
  ThumbsUp
} from 'lucide-react';

interface SplashHeroProps {
  onGoogleSignIn?: () => void;
  onSelectRegister?: () => void;
  onSelectLogin?: () => void;
  hideActionButtons?: boolean;
  trialDays?: number;
}

export const SplashHero: React.FC<SplashHeroProps> = ({ 
  onGoogleSignIn,
  onSelectRegister, 
  onSelectLogin,
  hideActionButtons = false,
  trialDays = 7
}) => {
  const [monthlySpend, setMonthlySpend] = useState<number>(5000);
  const estimatedSavings = Math.round(monthlySpend * 0.18);
  const handleAction = onGoogleSignIn || onSelectRegister || onSelectLogin;

  return (
    <div className="w-full text-right" dir="rtl">
      {/* الشارة الترحيبية الاحترافية */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 text-xs font-bold mb-4">
        <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
        <span>المنصة الأولى لتمكين الصيادلة في مقارنة أسعار وتوريد الأدوية</span>
      </div>

      {/* الهوك الرئيسي القوي والجاذب */}
      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight leading-tight">
        «لا تدع أرباح صيدليتك تضيع بين فواتير المستودعات ورسائل الواتساب!»
      </h1>

      <p className="mt-3.5 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
        قارن أسعار كافة الأدوية بين أكثر من <span className="text-emerald-700 font-bold">50 مستودعاً ومورداً</span> في ثوانٍ، اكشف أفضل بونص وعروض، وقسّم طلبيتك تلقائياً على الأرخص بضغطة زر واحدة.
      </p>

      {/* حاسبة التوفير التفاعلية السريعة للصيدلي */}
      <div className="mt-6 p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50/60 border border-emerald-200/80 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
            <TrendingDown className="w-4 h-4 text-emerald-600" />
            <span>حاسبة توفير مشتريات صيدليتك التقديرية:</span>
          </div>
          <span className="text-xs text-slate-500 font-medium">وفورات حتى 25%</span>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="w-full sm:w-1/2">
            <div className="flex justify-between text-xs text-slate-700 font-bold mb-1">
              <span>حجم طلبياتك الشهري:</span>
              <span className="text-emerald-800">{monthlySpend.toLocaleString('ar-EG')} د.أ / ر.س</span>
            </div>
            <input 
              type="range" 
              min={1000} 
              max={25000} 
              step={500}
              value={monthlySpend} 
              onChange={(e) => setMonthlySpend(Number(e.target.value))}
              className="w-full accent-[#0f9d7a] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>1,000</span>
              <span>25,000</span>
            </div>
          </div>

          <div className="w-full sm:w-auto bg-white px-4 py-2.5 rounded-xl border border-emerald-200 text-center shadow-2xs">
            <span className="block text-[11px] font-bold text-slate-500">التوفير الشهري المتوقع:</span>
            <span className="text-lg sm:text-xl font-black text-emerald-700 tracking-tight">
              +{estimatedSavings.toLocaleString('ar-EG')} <span className="text-xs font-bold">د.أ / ر.س</span>
            </span>
          </div>
        </div>
      </div>

      {/* المزايا الجوهرية الأربعة */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:border-emerald-300 transition">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2.5">
            <DollarSign className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-bold text-slate-900 mb-1">كاشف فروقات الأسعار الفوري</h3>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            فرق بسيط في سعر العلبة يصنع آلافاً في نهاية الشهر. التطبيق يكشف لك فوراً المستودع الأرخص ومقدار التوفير.
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:border-emerald-300 transition">
          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center mb-2.5">
            <Layers className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-bold text-slate-900 mb-1">السلة الموزعة الذكية</h3>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            أضف نواقصك إلى سلة واحدة، وسيقوم النظام بتقسيمها تلقائياً على أرخص مستودع لكل صنف مع إنشاء رسائل واتساب جاهزة.
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:border-emerald-300 transition">
          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-2.5">
            <Pill className="w-5 h-5 rotate-45" />
          </div>
          <h3 className="text-xs font-bold text-slate-900 mb-1">بدائل المواد الفعالة الحية</h3>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            الدواء مقطوع أو غير متوفر؟ اعثر على كافة البدائل المسجلة بنفس التركيبة العلمية وقارن أسعارها وربحيتها فوراً.
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:border-emerald-300 transition">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-2.5">
            <Zap className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-bold text-slate-900 mb-1">طلبيات واتساب خلال 30 ثانية</h3>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            توليد مسودة الطلبية بصيغة رسمية واضحة بدون أخطاء إملائية مع اسم صيدليتك وعنوانك بضغطة زر واحدة لمندوب المستودع.
          </p>
        </div>
      </div>

      {/* معاينة حية للمقارنة بين المستودعات */}
      <div className="mt-5 p-4 rounded-2xl bg-slate-900 text-white shadow-md border border-slate-800">
        <div className="flex items-center justify-between text-xs mb-3 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-bold text-slate-200">مثال حي من داخل المنصة:</span>
          </div>
          <span className="text-[10px] text-slate-400">تحديث أسعار اليوم</span>
        </div>

        <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60 mb-2.5">
          <div className="flex justify-between items-start">
            <div>
              <span className="font-bold text-xs text-white block">Augmentin 1g Tab (14s)</span>
              <span className="text-[10px] text-slate-400">المادة الفعالة: Amoxicillin + Clavulanic acid</span>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-black text-xs">
              أفضل سعر: 4.10 د.أ
            </span>
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="p-1.5 rounded-lg bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 font-bold">
              <span>مستودع الشرق</span>
              <div className="text-white text-xs mt-0.5">4.10 د.أ (10+2)</div>
            </div>
            <div className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-700 text-slate-400">
              <span>مستودع الشفاء</span>
              <div className="text-slate-300 text-xs mt-0.5">4.85 د.أ (صافي)</div>
            </div>
            <div className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-700 text-slate-400">
              <span>مستودع الرواد</span>
              <div className="text-slate-300 text-xs mt-0.5">5.20 د.أ (12+1)</div>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-emerald-300/90 font-medium flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>وفرت الصيدلية 1.10 د.أ للعلبة الواحدة مع بونص إضافي باختيار المستودع الأفضل!</span>
        </p>
      </div>

      {/* شهادة صيدلي */}
      <div className="mt-4 p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
        <ThumbsUp className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold">«كنت أضيع ساعتين يومياً في الاتصال بالمستودعات ومقارنة فواتيرهم. الآن بضغطة زر أعرف الأرخص وأرسل الطلبيات في دقائق مع توفير مالي ملموس.»</span>
          <span className="block text-[10px] text-amber-700 font-semibold mt-1">— د. أنس، صيدلية الرعاية الحديثة</span>
        </div>
      </div>

      {/* زر المتابعة السريع بحساب Google إن طُلب */}
      {!hideActionButtons && handleAction && (
        <div className="mt-6">
          <button
            type="button"
            onClick={handleAction}
            className="w-full sm:w-auto py-3.5 px-6 rounded-2xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs sm:text-sm font-bold shadow-md transition flex items-center justify-center gap-3 active:scale-98"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>المتابعة السريعة والمباشرة بحساب Google</span>
          </button>
        </div>
      )}
    </div>
  );
};
