// src/pages/auth/Login.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Zap,
  TrendingDown,
  Building,
  Lock,
  Sparkles,
  MessageCircle,
  WifiOff,
  Pill, Store, TrendingUp, PackageCheck, ArrowLeftRight
} from 'lucide-react';
import { SplashHero } from '../../components/SplashHero';
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

  useEffect(() => { const on=()=>setIsOnline(true), off=()=>setIsOnline(false); window.addEventListener('online',on); window.addEventListener('offline',off); return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)}; }, []);
  useEffect(() => { localStorage.setItem('pharma_remember_me', rememberMe ? 'on' : 'off'); getPublicLoginSettings().then(s => { setLoginWhatsApp(s.loginWhatsApp); setLoginWhatsAppEnabled(s.loginWhatsAppEnabled); }).catch(() => {}); }, [rememberMe]);

  // الحساب موجود في Firebase لكن الملف الشخصي لم يصل بعد => شاشة تحميل بدل صفحة الدخول
  const waitingForProfile = Boolean(auth.currentUser) && !user && !gaveUpWaiting;
  const showBootLoader = !initialized || waitingForProfile;

  useEffect(() => {
    if (!waitingForProfile) return;
    const t = setTimeout(() => setGaveUpWaiting(true), 20000);
    return () => clearTimeout(t);
  }, [waitingForProfile]);

  // التوجيه التلقائي فور جاهزية المستخدم (بعد تسجيل الدخول أو عند إعادة التحميل)
  useEffect(() => {
    if (initialized && user) {
      if (justSignedIn.current) {
        justSignedIn.current = false;
        useToastStore.getState().success(user.role === 'admin' ? 'مرحباً بك في لوحة الإدارة' : 'مرحباً بك في منصة الصيدلية');
      }
      navigate(user.role === 'admin' ? '/admin' : '/app/home', { replace: true });
    }
  }, [initialized, user, navigate]);

  // تسجيل الدخول المباشر والحصري عبر Google
  const handleGoogleAuth = async () => {
    if (isSubmitting || loading) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      justSignedIn.current = true;
      const ok = await loginWithGoogle();
      if (!ok) {
        justSignedIn.current = false;
      } else {
        setGaveUpWaiting(false);
      }
    } catch (err: any) {
      justSignedIn.current = false;
      setErrorMessage('حدث خطأ أثناء الاتصال بخدمة Google: ' + (err.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showBootLoader) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <PharmacyBrandLoader size="lg" text="جاري فتح حسابك..." subtext="لحظات ونكون جاهزين" />
      </div>
    );
  }

  return (
    <>
      {!isOnline && <div className="lp50-offline" role="status"><WifiOff size={16}/> لا يوجد اتصال بالإنترنت</div>}
      <main className="lp50-page" dir="rtl">
        <div className="lp50-topline">
          <a className="lp50-brand" href="#" aria-label="LinkPharma">
            <span className="lp50-brand-mark"><BrandMark size={35}/></span>
            <span><strong>LinkPharma</strong><small>حلقة الوصل الذكية بين الصيدليات والمستودعات</small></span>
          </a>
          <span className="lp50-secure"><ShieldCheck size={15}/> دخول آمن للمنصة</span>
        </div>

        <div className="lp50-layout">
          <section className="lp50-visual" aria-label="منصة تربط الصيدليات بالمستودعات">
            <div className="lp50-visual-glow"/>
            <div className="lp50-orbit lp50-orbit-a"/>
            <div className="lp50-orbit lp50-orbit-b"/>
            <div className="lp50-particles"><i/><i/><i/><i/><i/><i/></div>
            <div className="lp50-scene">
              <div className="lp50-platform"><span/><span/><span/></div>
              <div className="lp50-core">
                <div className="lp50-core-halo"/>
                <div className="lp50-capsule"><span/><i/></div>
                <div className="lp50-core-brand"><BrandMark size={40}/></div>
              </div>
              <div className="lp50-link-path lp50-path-one"><span/></div>
              <div className="lp50-link-path lp50-path-two"><span/></div>
              <div className="lp50-float lp50-pharmacy">
                <div className="lp50-float-icon"><Store size={25}/></div>
                <div><strong>الصيدليات</strong><small>خيارات أوضح لاحتياجاتك</small></div>
                <span className="lp50-status-dot"/>
              </div>
              <div className="lp50-float lp50-warehouse">
                <div className="lp50-float-icon"><Building size={25}/></div>
                <div><strong>المستودعات</strong><small>فرص أكبر للوصول لعملائك</small></div>
                <span className="lp50-status-dot"/>
              </div>
              <div className="lp50-mini-chip lp50-chip-a"><TrendingUp size={15}/> عروض أكثر وضوحًا</div>
              <div className="lp50-mini-chip lp50-chip-b"><ArrowLeftRight size={15}/> تواصل في حلقة واحدة</div>
            </div>
            <div className="lp50-story">
              <span className="lp50-eyebrow"><Sparkles size={15}/> منظومة دوائية أكثر ترابطًا</span>
              <h1>كل احتياج يلتقي<br/><em>بفرصته المناسبة.</em></h1>
              <p>مساحة واحدة تجمع الصيدليات والمستودعات، لتصبح عروض التوريد ومعلومات الأصناف أقرب إلى قرارات أوضح وتعاون أفضل.</p>
              <div className="lp50-benefits">
                <span><CheckCircle2 size={16}/> للصيدليات: خيارات ومقارنة أوضح</span>
                <span><CheckCircle2 size={16}/> للمستودعات: وصول أوسع للعملاء</span>
              </div>
            </div>
          </section>

          <section className="lp50-login-column" aria-labelledby="lp50-login-title">
            <div className="lp50-login-card">
              <div className="lp50-card-top-orb"/>
              <div className="lp50-card-heading">
                <span className="lp50-card-mark"><BrandMark size={48}/></span>
                <span className="lp50-card-kicker">أهلًا بك في LinkPharma</span>
                <h2 id="lp50-login-title">بوابتك إلى شبكة دوائية مترابطة</h2>
                <p>سجّل الدخول لمتابعة رحلتك مع الصيدليات والمستودعات.</p>
              </div>

              {errorMessage && <div className="lp50-error" role="alert"><AlertCircle size={18}/><span>{errorMessage}</span></div>}

              <div className="lp50-welcome-note">
                <span className="lp50-note-icon"><Zap size={18}/></span>
                <div><strong>ابدأ من حيث تلتقي الفرص</strong><p>استكشف معلومات الأصناف وعروض التوريد ضمن تجربة مصممة لتخدم طرفي سلسلة الإمداد.</p></div>
              </div>

              <button type="button" onClick={handleGoogleAuth} disabled={loading || isSubmitting} className="lp50-google-button">
                {loading || isSubmitting ? <><PharmacyBrandLoader size="xs" glow={false}/><span>جارٍ تأمين الدخول إلى حسابك...</span></> : <>
                  <svg className="lp50-google-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                  <span>المتابعة الآمنة باستخدام Google</span><ArrowLeftRight size={17} className="lp50-button-arrow"/>
                </>}
              </button>

              <label className="lp50-remember"><input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)}/> <span>تذكرني على هذا الجهاز</span></label>
              <div className="lp50-trust-row"><ShieldCheck size={17}/><span>تُستخدم بيانات حسابك لتجهيز تجربة الدخول، مع الحفاظ على خصوصيتك.</span></div>
              <div className="lp50-card-divider"><span>مساحة واحدة · طرفان · فرص أوضح</span></div>
              <div className="lp50-audience">
                <div><span className="lp50-audience-icon"><Pill size={17}/></span><span><b>للصيدليات</b><small>معلومات تساعدك على الاختيار</small></span></div>
                <div><span className="lp50-audience-icon"><PackageCheck size={17}/></span><span><b>للمستودعات</b><small>عرض أوضح للأصناف والعملاء</small></span></div>
              </div>
            </div>
            <p className="lp50-privacy"><Lock size={14}/> دخول آمن إلى منصة مهنية للصيدليات والمستودعات</p>
          </section>
        </div>
        <footer className="lp50-footer"><span>LinkPharma</span><span>حلقة الوصل الذكية بين الصيدليات والمستودعات</span></footer>
      </main>
      {loginWhatsAppEnabled && <a href={`https://wa.me/${loginWhatsApp.replace(/\D/g, '')}?text=مرحباً، أحتاج مساعدة في تسجيل الدخول`} target="_blank" rel="noreferrer" className="lp50-help"><MessageCircle size={18}/><span>تحتاج مساعدة؟</span></a>}
    </>
  );
};
