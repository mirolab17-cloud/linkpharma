// src/components/SplashHero.tsx
import React, { useState, useEffect } from 'react';
import { 
  Pill, 
  TrendingDown, 
  Zap, 
  Sparkles, 
  CheckCircle2, 
  Layers, 
  Play, 
  Pause,
  RotateCcw,
  Building,
  Check,
  Shield,
  MessageSquare,
  ArrowRight,
  TrendingUp,
  Cpu
} from 'lucide-react';
import { PharmacyBrandLoader } from './Loader';

interface SplashHeroProps {
  onGoogleSignIn?: () => void;
  onSelectRegister?: () => void;
  onSelectLogin?: () => void;
  hideActionButtons?: boolean;
}

export const SplashHero: React.FC<SplashHeroProps> = ({ 
  onGoogleSignIn,
  onSelectRegister, 
  onSelectLogin,
  hideActionButtons = true,
}) => {
  const [activeTab, setActiveTab] = useState<'motion' | 'calc'>('motion');
  const [monthlySpend, setMonthlySpend] = useState<number>(6500);
  const estimatedSavings = Math.round(monthlySpend * 0.19);

  // سيناريو العرض السينمائي المتحرك (Simulated Motion Video Showcase)
  const [motionStep, setMotionStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  const steps = [
    {
      title: 'رادار كشف الأسعار بين المستودعات',
      subtitle: 'مسح فوري لأكثر من 50 مستودع أدوية معتمد لتحديد السعر الأقل بدقة سنتيمترية.',
      tag: '01. كشف الأسعار',
      drug: 'Panadol Extra 500mg (24s)',
      warehouseA: { name: 'مستودع الأمل', price: '1.45 د.أ', badge: 'الأرخص (10+2 بونص)', best: true },
      warehouseB: { name: 'مستودع المتحدة', price: '1.80 د.أ', badge: 'صافي بدون بونص', best: false },
      saving: 'وفرت الصيدلية 24% في هذا الصنف',
    },
    {
      title: 'السلة الموزعة الذكية تلقائياً',
      subtitle: 'تجميع نواقص الصيدلية بضغطة زر واحدة وتوزيع كل دواء على مستودعه الأرخص.',
      tag: '02. الذكاء اللوجستي',
      drug: 'Augmentin 1g Tab (14s)',
      warehouseA: { name: 'مستودع الشرق', price: '4.10 د.أ', badge: 'خصم توريد 15%', best: true },
      warehouseB: { name: 'مستودع الرواد', price: '5.20 د.أ', badge: 'السعر الرسمي', best: false },
      saving: 'توزيع تلقائي لفاتورة الشراء',
    },
    {
      title: 'توليد طلبيات واتساب خلال 10 ثوانٍ',
      subtitle: 'تنسيق الطلبية الرسمية مع بيانات صيدليتك وإرسالها فوراً لمندوب المستودع.',
      tag: '03. الإرسال الفوري',
      drug: 'Nexium 40mg Tab (28s)',
      warehouseA: { name: 'مستودع الشفاء', price: '7.85 د.أ', badge: 'جاهز للإرسال واتساب', best: true },
      warehouseB: { name: 'مستودع النخبة', price: '8.90 د.أ', badge: 'متوفر', best: false },
      saving: 'إرسال مباشر لمندوب المبيعات',
    },
  ];

  // تشغيل الحركة السينمائية تلقائياً
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setMotionStep((prev) => (prev + 1) % steps.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isPlaying, steps.length]);

  const currentStepData = steps[motionStep];

  return (
    <div className="w-full text-right" dir="rtl">
      {/* الشارة الترحيبية الاحترافية مع أيقونة المنصة */}
      <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 text-xs font-bold mb-4">
        <PharmacyBrandLoader size="xs" glow={false} />
        <span>منصة توريد ومقارنة أسعار الأدوية الأولى للصيدليات</span>
      </div>

      {/* العنوان الرئيسي الجذاب والواضح */}
      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight leading-snug">
        وفّر آلاف الدنانير شهرياً في مشتريات صيدليتك بضغطة زر واحدة
      </h1>

      <p className="mt-3 text-sm sm:text-base text-slate-600 font-medium leading-relaxed max-w-2xl">
        منظومة سحابية متقدمة تفحص أسعار وبونص كافة مستودعات الأدوية لحظياً، تكشف الفروقات السعرية، وتولد طلبيات الشراء المقسمة على الأرخص فوراً.
      </p>

      {/* شريط التبديل بين العرض السينمائي المتحرك وحاسبة التوفير */}
      <div className="mt-6 flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('motion')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === 'motion'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>عرض متحرك حي (Live Demo)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('calc')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === 'calc'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5 text-teal-600" />
            <span>حاسبة توفير الصيدلية</span>
          </button>
        </div>

        {activeTab === 'motion' && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs flex items-center gap-1 transition"
              title={isPlaying ? 'إيقاف مؤقت' : 'تشغيل العرض'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span className="text-[11px] font-semibold hidden sm:inline">
                {isPlaying ? 'إيقاف' : 'تشغيل'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMotionStep((prev) => (prev + 1) % steps.length)}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs transition"
              title="المشهد التالي"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* التبويب 1: العرض السينمائي المتحرك (Interactive Animated Splash Video Screen) */}
      {activeTab === 'motion' && (
        <div className="mt-4 rounded-3xl bg-slate-900 text-white p-5 sm:p-6 shadow-xl border border-slate-800 relative overflow-hidden">
          {/* خلفية جمالية شبكية مع تدرج زمردي خفيف */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

          {/* شريط الإطار العلوي للعرض التفاعلي */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-bold text-slate-200">
                محاكاة مباشرة لمنظومة المقارنة الفورية
              </span>
            </div>

            {/* مؤشرات الشرائح السينمائية */}
            <div className="flex items-center gap-1.5">
              {steps.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setMotionStep(idx)}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === motionStep ? 'w-6 bg-emerald-400' : 'w-2 bg-slate-700 hover:bg-slate-600'
                  }`}
                  aria-label={`المشهد ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          {/* محتوى المشهد الحالي */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-emerald-400 block mb-0.5">
                  {currentStepData.tag}
                </span>
                <h3 className="text-base sm:text-lg font-black text-white">
                  {currentStepData.title}
                </h3>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-[11px] text-emerald-300 font-bold">
                تحديث حي
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {currentStepData.subtitle}
            </p>

            {/* بطاقة محاكاة فحص السعر التفاعلية الحية */}
            <div className="bg-slate-800/90 rounded-2xl p-4 border border-slate-700/80 shadow-md">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700/60">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center">
                    <Pill className="w-4 h-4 rotate-45" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-white block">
                      {currentStepData.drug}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      مقارنة الأسعار اللحظية عبر المستودعات
                    </span>
                  </div>
                </div>
                <span className="text-xs font-black text-emerald-400">
                  {currentStepData.saving}
                </span>
              </div>

              {/* مقارنة المستودعين */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/60 text-right">
                  <div className="flex items-center justify-between text-[11px] text-emerald-200 font-bold mb-1">
                    <span>{currentStepData.warehouseA.name}</span>
                    <span className="text-[10px] bg-emerald-500/30 text-emerald-200 px-1.5 py-0.5 rounded">
                      الأفضل
                    </span>
                  </div>
                  <div className="text-sm sm:text-base font-black text-white">
                    {currentStepData.warehouseA.price}
                  </div>
                  <div className="text-[10px] text-emerald-300 mt-0.5">
                    {currentStepData.warehouseA.badge}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-700 text-right opacity-70">
                  <div className="text-[11px] text-slate-400 font-bold mb-1">
                    {currentStepData.warehouseB.name}
                  </div>
                  <div className="text-sm sm:text-base font-black text-slate-300">
                    {currentStepData.warehouseB.price}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {currentStepData.warehouseB.badge}
                  </div>
                </div>
              </div>
            </div>

            {/* شريط الإنجاز السفلي للمشهد */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span className="flex items-center gap-1 text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>معاينة حية للمنصة الفعلية بدون إدخال بيانات</span>
              </span>
              <span>المشهد {motionStep + 1} من {steps.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* التبويب 2: حاسبة التوفير التفاعلية السريعة للصيدلي */}
      {activeTab === 'calc' && (
        <div className="mt-4 p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-emerald-50 via-teal-50/50 to-white border border-emerald-200/90 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-950">
              <TrendingDown className="w-4 h-4 text-emerald-600" />
              <span>احسب مقدار التوفير المالي الشهري لصيدليتك:</span>
            </div>
            <span className="text-xs text-emerald-800 font-black">نسبة توفير تصل لـ 25%</span>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-slate-700 font-bold mb-1.5">
                <span>حجم مشتريات صيدليتك الشهري من المستودعات:</span>
                <span className="text-emerald-800 font-black text-sm">
                  {monthlySpend.toLocaleString('ar-EG')} د.أ / ر.س
                </span>
              </div>
              <input 
                type="range" 
                min={1000} 
                max={30000} 
                step={500}
                value={monthlySpend} 
                onChange={(e) => setMonthlySpend(Number(e.target.value))}
                className="w-full accent-[#0f9d7a] cursor-pointer h-2 bg-slate-200 rounded-lg"
              />
              <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                <span>1,000 د.أ</span>
                <span>15,000 د.أ</span>
                <span>30,000 د.أ</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-right">
              <div>
                <span className="block text-xs font-bold text-slate-500">التوفير المالي الصافي شهرياً:</span>
                <span className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight">
                  +{estimatedSavings.toLocaleString('ar-EG')} <span className="text-xs font-bold">د.أ / ر.س</span>
                </span>
              </div>
              <div className="text-[11px] text-slate-500 max-w-xs leading-relaxed text-right">
                يعادل توفير ما يزيد عن <strong className="text-emerald-800 font-bold">{(estimatedSavings * 12).toLocaleString('ar-EG')} د.أ</strong> سنوياً يمكن استثمارها في توسيع مخزونك.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نقاط القوة الثلاثة المختصرة */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <div className="text-xs font-black text-slate-900 mb-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>مقارنة 50+ مستودع</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            كشف فوري لأرخص مستودع وعروض البونص لآلاف الأصناف.
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <div className="text-xs font-black text-slate-900 mb-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
            <span>سلة موزعة ذكية</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            تقسيم النواقص تلقائياً على الأرخص بدون تكرار أو مجهود.
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <div className="text-xs font-black text-slate-900 mb-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
            <span>طلبيات واتساب سريعة</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            توليد رسائل رسمية جاهزة للمندوبين بضغطة زر واحدة.
          </p>
        </div>
      </div>
    </div>
  );
};
