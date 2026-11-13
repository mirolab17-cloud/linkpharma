// LinkPharma V61 — responsive premium authentication screen
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import { ShieldCheck, CheckCircle2, AlertCircle, Zap, TrendingDown, Building2, Lock, MessageCircle, WifiOff, Pill, Store, TrendingUp, PackageCheck, ArrowLeftRight } from 'lucide-react';
import { PharmacyBrandLoader } from '../../components/Loader';
import { BrandMark } from '../../components/BrandLogo';
import { getPublicLoginSettings } from '../../services/dataStorage';
import { auth } from '../../firebase';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { loginWithGoogle, user, initialized, loading } = useAuthStore();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('pharma_remember_me') !== 'off');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [loginWhatsApp, setLoginWhatsApp] = useState('970599999999');
  const [loginWhatsAppEnabled, setLoginWhatsAppEnabled] = useState(true);
  const [gaveUpWaiting, setGaveUpWaiting] = useState(false);
  const justSignedIn = useRef(false);

  useEffect(() => {
    const on = () => setIsOnline(true), off = () => setIsOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    localStorage.setItem('pharma_remember_me', rememberMe ? 'on' : 'off');
    getPublicLoginSettings().then(s => { setLoginWhatsApp(s.loginWhatsApp); setLoginWhatsAppEnabled(s.loginWhatsAppEnabled); }).catch(() => {});
  }, [rememberMe]);

  const waitingForProfile = Boolean(auth.currentUser) && !user && !gaveUpWaiting;
  const showBootLoader = !initialized || waitingForProfile;
  useEffect(() => {
    if (!waitingForProfile) return;
    const t = setTimeout(() => setGaveUpWaiting(true), 20000);
    return () => clearTimeout(t);
  }, [waitingForProfile]);

  useEffect(() => {
    if (initialized && user) {
      if (justSignedIn.current) {
        justSignedIn.current = false;
        useToastStore.getState().success(user.role === 'admin' ? 'مرحباً بك في لوحة الإدارة' : 'مرحباً بك في منصة الصيدلية');
      }
      navigate(user.role === 'admin' ? '/admin' : '/app/home', { replace: true });
    }
  }, [initialized, user, navigate]);

  const handleGoogleAuth = async () => {
    if (isSubmitting || loading) return;
    setErrorMessage(null); setIsSubmitting(true);
    try {
      justSignedIn.current = true;
      const ok = await loginWithGoogle();
      if (!ok) justSignedIn.current = false;
      else setGaveUpWaiting(false);
    } catch (err: any) {
      justSignedIn.current = false;
      setErrorMessage('تعذّر الاتصال بخدمة Google. تحقق من اتصالك ثم حاول مجددًا.');
    } finally { setIsSubmitting(false); }
  };

  if (showBootLoader) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
      <PharmacyBrandLoader size="lg" text="جاري فتح حسابك..." subtext="لحظات ونكون جاهزين" />
    </div>
  );

  const whatsappUrl = `https://wa.me/${loginWhatsApp.replace(/\\D/g, '')}?text=${encodeURIComponent('مرحباً، أحتاج مساعدة في الدخول إلى منصة LinkPharma')}`;

  return (
    <main dir="rtl" className="lp-auth-page min-h-screen relative overflow-hidden bg-[#f4f8f8] text-slate-900 flex items-center justify-center px-3 py-4 sm:px-6 sm:py-8">
      <style>{`
        .lp-auth-page{font-family:'Cairo',sans-serif;background:radial-gradient(ellipse at 12% 10%,rgba(15,157,122,.10),transparent 35%),#f4f8f8}
        .lp-auth-shell{width:100%;max-width:1160px;min-height:min(720px,calc(100vh - 48px));display:grid;grid-template-columns:minmax(0,1.08fr) minmax(380px,.92fr);border-radius:30px;overflow:hidden;background:#fff;box-shadow:0 28px 90px rgba(10,48,53,.16);border:1px solid rgba(255,255,255,.85)}
        .lp-auth-visual{position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;padding:clamp(26px,4vw,54px);color:white;background:radial-gradient(ellipse at 50% 70%,rgba(0,208,173,.20),transparent 42%),linear-gradient(145deg,#062c35 0%,#064b4c 55%,#071f2d 100%)}
        .lp-auth-visual:before{content:"";position:absolute;inset:0;z-index:-1;opacity:.18;background-image:linear-gradient(rgba(113,245,220,.22) 1px,transparent 1px),linear-gradient(90deg,rgba(113,245,220,.22) 1px,transparent 1px);background-size:38px 38px;mask-image:linear-gradient(to bottom,black,transparent 85%)}
        .lp-auth-visual:after{content:"";position:absolute;z-index:-1;width:360px;height:360px;left:-130px;bottom:-160px;border:1px solid rgba(62,235,203,.24);border-radius:50%;box-shadow:0 0 0 35px rgba(62,235,203,.04),0 0 0 75px rgba(62,235,203,.035),0 0 90px rgba(0,255,200,.12)}
        .lp-auth-form{display:flex;align-items:center;justify-content:center;padding:clamp(24px,4vw,56px);background:linear-gradient(155deg,#fff 0%,#f9fcfc 100%)}
        .lp-auth-pill{display:flex;align-items:center;gap:10px;width:max-content;max-width:100%;padding:10px 14px;border:1px solid rgba(123,226,208,.24);border-radius:16px;background:rgba(255,255,255,.07);font-size:12px;color:#d8fff5}
        .lp-auth-button{min-height:58px;width:100%;display:flex;align-items:center;justify-content:center;gap:12px;border-radius:17px;font-weight:800;font-size:15px;transition:transform .2s,box-shadow .2s,background .2s}
        .lp-auth-button:hover{transform:translateY(-2px)}
        .lp-auth-google{background:#fff;border:1px solid #d8e3e6;color:#12384a;box-shadow:0 5px 16px rgba(15,45,55,.05)}
        .lp-auth-google:hover{box-shadow:0 10px 24px rgba(15,45,55,.11);border-color:#a9c8ce}
        .lp-auth-whatsapp{background:#0f9d7a;color:white;box-shadow:0 9px 22px rgba(15,157,122,.22)}
        .lp-auth-whatsapp:hover{background:#0b896b;box-shadow:0 12px 28px rgba(15,157,122,.28)}
        @media(max-width:760px){.lp-auth-page{padding:0;background:#f5f9f9}.lp-auth-shell{display:flex;flex-direction:column;min-height:100dvh;border-radius:0;border:0;box-shadow:none}.lp-auth-visual{padding:25px 23px 20px;min-height:300px;flex:0 0 auto}.lp-auth-form{padding:25px 22px 30px;flex:1;align-items:flex-start}.lp-auth-visual:after{width:240px;height:240px;left:-95px;bottom:-125px}.lp-auth-button{min-height:56px}.lp-auth-mobile-art{display:block!important}.lp-auth-desktop-art{display:none!important}}
        @media(min-width:761px){.lp-auth-mobile-art{display:none!important}.lp-auth-desktop-art{display:block!important}}
        @media(max-width:380px){.lp-auth-visual{padding:20px 18px 18px;min-height:270px}.lp-auth-form{padding:22px 18px 26px}.lp-auth-title{font-size:27px!important}.lp-auth-pill{font-size:11px;padding:8px 10px}}
        @media(prefers-reduced-motion:reduce){.lp-auth-button{transition:none}}
      `}</style>

      {!isOnline && <div className="fixed top-3 left-3 right-3 z-50 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-xs font-bold flex items-center gap-2"><WifiOff className="w-4 h-4"/> لا يوجد اتصال بالإنترنت</div>}

      <div className="lp-auth-shell">
        <section className="lp-auth-visual" aria-label="LinkPharma">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 border border-white/15 p-2.5 shadow-lg"><BrandMark size={42}/></div>
              <div>
                <div className="text-2xl sm:text-3xl font-black tracking-tight leading-none">Link<span className="text-[#27d9b2]">Pharma</span></div>
                <div className="text-[11px] mt-2 text-teal-100/90 font-semibold">حلقة الوصل بين الصيدليات والمستودعات</div>
              </div>
            </div>
            <div className="hidden sm:flex rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[11px] text-teal-50 items-center gap-1.5"><ShieldCheck size={15}/> شبكة مهنية موثوقة</div>
          </div>

          <div className="relative z-10 py-7">
            <div className="lp-auth-pill mb-6"><ArrowLeftRight size={16}/><span>منصة واحدة، خيارات أذكى</span></div>
            <h1 className="lp-auth-title text-4xl lg:text-[42px] leading-[1.35] font-black tracking-tight">ارتقِ بصيدليتك<br/><span className="text-[#30e0bd]">إلى مستوى جديد</span></h1>
            <p className="mt-4 max-w-lg text-sm sm:text-base leading-8 text-teal-50/85">قارن الأسعار والبونص، اكتشف العروض، وتواصل مباشرة مع المستودعات — كل ما تحتاجه لقرارات توريد أوضح في مكان واحد.</p>

            <div className="lp-auth-desktop-art mt-9">
              <div className="relative mx-auto max-w-[440px] h-[190px]">
                <div className="absolute inset-x-12 top-5 bottom-0 rounded-[50%] border border-teal-300/30 rotate-[-8deg]"/>
                <div className="absolute inset-x-20 top-1 bottom-4 rounded-[50%] border border-emerald-300/25 rotate-[12deg]"/>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-[30px] rotate-[-8deg] bg-gradient-to-br from-[#20d8b1] via-[#0f9d7a] to-[#075c58] shadow-[0_0_55px_rgba(25,220,178,.25)] flex items-center justify-center border border-teal-100/40"><BrandMark size={56}/></div>
                <div className="absolute top-5 right-8 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-md p-3 flex items-center gap-2 text-xs"><Store size={17} className="text-[#4ee7c5]"/> مستودعات متعددة</div>
                <div className="absolute bottom-4 left-3 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-md p-3 flex items-center gap-2 text-xs"><TrendingUp size={17} className="text-[#4ee7c5]"/> مقارنة أوضح للأسعار</div>
                <div className="absolute bottom-0 right-12 rounded-xl bg-[#0c7167]/80 border border-teal-300/20 px-3 py-2 flex items-center gap-2 text-[11px]"><PackageCheck size={15} className="text-teal-200"/> طلبات أكثر تنظيمًا</div>
              </div>
            </div>
            <div className="lp-auth-mobile-art mt-5 hidden">
              <div className="flex items-center justify-center gap-3">
                <div className="h-px flex-1 bg-gradient-to-l from-teal-300/50 to-transparent"/>
                <div className="rounded-2xl bg-white/10 border border-white/15 p-3"><Pill size={26} className="text-[#43e6c3]"/></div>
                <div className="rounded-2xl bg-white/10 border border-white/15 p-3"><Building2 size={26} className="text-[#43e6c3]"/></div>
                <div className="rounded-2xl bg-white/10 border border-white/15 p-3"><TrendingDown size={26} className="text-[#43e6c3]"/></div>
                <div className="h-px flex-1 bg-gradient-to-r from-teal-300/50 to-transparent"/>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t border-white/15 pt-5">
            <div className="text-center"><TrendingDown className="mx-auto mb-2 text-[#39e2bd]" size={21}/><div className="text-xs font-extrabold">أسعار تنافسية</div><div className="mt-1 text-[10px] text-teal-100/65">قارن واختر</div></div>
            <div className="text-center"><Store className="mx-auto mb-2 text-[#39e2bd]" size={21}/><div className="text-xs font-extrabold">عروض متنوعة</div><div className="mt-1 text-[10px] text-teal-100/65">من المصدر</div></div>
            <div className="text-center"><ShieldCheck className="mx-auto mb-2 text-[#39e2bd]" size={21}/><div className="text-xs font-extrabold">خصوصية وموثوقية</div><div className="mt-1 text-[10px] text-teal-100/65">تجربة آمنة</div></div>
          </div>
        </section>

        <section className="lp-auth-form">
          <div className="w-full max-w-[410px] mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-100 p-3 mb-4"><BrandMark size={45}/></div>
              <p className="text-xs font-extrabold tracking-wide text-[#0f9d7a] mb-2">أهلاً بك في LinkPharma</p>
              <h2 className="text-3xl sm:text-[34px] font-black tracking-tight text-[#102f35]">ابدأ رحلتك الآن</h2>
              <p className="mt-3 text-sm leading-7 text-slate-500">ادخل بسهولة للوصول إلى العروض والأسعار وخدمات المنصة.</p>
            </div>

            {errorMessage && <div role="alert" className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/><span className="leading-relaxed">{errorMessage}</span></div>}

            <div className="space-y-3.5">
              <button type="button" onClick={handleGoogleAuth} disabled={loading || isSubmitting} className="lp-auth-button lp-auth-google disabled:opacity-60 disabled:cursor-wait">
                {loading || isSubmitting ? <><PharmacyBrandLoader size="xs" glow={false}/><span className="text-sm">جارٍ تسجيل الدخول...</span></> : <>
                  <svg aria-hidden="true" className="w-6 h-6 shrink-0" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                  <span>المتابعة بحساب Google</span>
                </>}
              </button>

              {loginWhatsAppEnabled && <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="lp-auth-button lp-auth-whatsapp"><MessageCircle size={22}/><span>المتابعة عبر WhatsApp</span></a>}

              <div className="pt-4 flex items-center justify-center gap-2 text-[11px] text-slate-400"><span className="h-px flex-1 bg-slate-200"/><Lock size={13}/><span>دخول آمن إلى منصتك</span><span className="h-px flex-1 bg-slate-200"/></div>
            </div>

            <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <div className="flex items-start gap-3"><div className="rounded-xl bg-white p-2 text-[#0f9d7a] shadow-sm"><ShieldCheck size={19}/></div><div><div className="text-xs font-extrabold text-[#12483f]">تجربة موثوقة ومصممة لعملك</div><p className="mt-1 text-[11px] leading-6 text-slate-600">قارن العروض، اكتشف خيارات التوريد، واتخذ قراراتك بثقة من واجهة واحدة.</p></div></div>
            </div>

            <label className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 cursor-pointer"><input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="h-4 w-4 accent-emerald-600 rounded"/> تذكرني على هذا الجهاز</label>
            <p className="mt-5 text-center text-[10px] leading-5 text-slate-400">LinkPharma · حلقة الوصل بين الصيدليات والمستودعات</p>
          </div>
        </section>
      </div>

      {loginWhatsAppEnabled && <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="التواصل مع دعم WhatsApp" className="fixed bottom-4 left-4 z-40 inline-flex items-center justify-center rounded-full bg-[#25D366] text-white p-3 shadow-lg hover:scale-105 transition-transform sm:hidden"><MessageCircle size={21}/></a>}
    </main>
  );
};
