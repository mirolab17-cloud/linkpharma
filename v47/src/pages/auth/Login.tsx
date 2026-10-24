// src/pages/auth/Login.tsx — v47: واجهة دخول فاتحة ثلاثية الأبعاد (صيدلية | مستودع)
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import {
  AlertCircle,
  Lock,
  MessageCircle,
  WifiOff,
  Pill,
  Store,
  ArrowLeftRight,
  Handshake,
  BadgeCheck,
  RefreshCw,
} from 'lucide-react';
import { PharmacyBrandLoader } from '../../components/Loader';
import { BrandMark } from '../../components/BrandLogo';
import { getPublicLoginSettings } from '../../services/dataStorage';
import { auth } from '../../firebase';
import './login-redesign.css';

type Audience = 'pharmacy' | 'warehouse';

const AUD = {
  pharmacy: {
    label: 'صيدلية',
    Icon: Pill,
    welcome: 'مرحباً بصيدليتك',
    headline: 'أسعار أدويتك من كل المستودعات في مكان واحد',
    hook: 'سجّل دخولك وابدأ بمقارنة الأسعار الآن',
  },
  warehouse: {
    label: 'مستودع',
    Icon: Store,
    welcome: 'مرحباً بمستودعك',
    headline: 'صيدليات تبحث عن بضاعتك الآن',
    hook: 'سجّل دخولك واعرض أسعارك أمام الصيدليات',
  },
} as const;

const DOTS = [6, 14, 22, 31, 39, 47, 55, 63, 71, 79, 87, 94];

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
  const [aud, setAud] = useState<Audience>('pharmacy');
  const justSignedIn = useRef(false);
  const pageRef = useRef<HTMLDivElement>(null);

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

  // ميلان المشهد والبطاقة مع الماوس أو ميلان الجهاز (خفيف، عبر متغيرات CSS بدون إعادة رسم React)
  useEffect(() => {
    const el = pageRef.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0, nx = 0, ny = 0;
    const apply = () => { raf = 0; el.style.setProperty('--px', nx.toFixed(3)); el.style.setProperty('--py', ny.toFixed(3)); };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const onMove = (e: PointerEvent) => { nx = (e.clientX / window.innerWidth - 0.5) * 2; ny = (e.clientY / window.innerHeight - 0.5) * 2; schedule(); };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      nx = Math.max(-1, Math.min(1, e.gamma / 30));
      ny = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
      schedule();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('deviceorientation', onTilt, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('deviceorientation', onTilt);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [showBootLoader]);

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

  const cur = AUD[aud];
  const busy = loading || isSubmitting;

  return (
    <>
      {!isOnline && <div className="lpx-offline"><WifiOff className="w-4 h-4" /> لا يوجد اتصال بالإنترنت</div>}

      <div ref={pageRef} className="lpx-page" data-aud={aud} dir="rtl">
        <div className="lpx-blob lpx-blob-1" aria-hidden="true" />
        <div className="lpx-blob lpx-blob-2" aria-hidden="true" />
        <div className="lpx-blob lpx-blob-3" aria-hidden="true" />
        <div className="lpx-floor" aria-hidden="true" />
        {DOTS.map((left, i) => (
          <span key={left} className="lpx-dot" aria-hidden="true" style={{ left: `${left}%`, animationDelay: `${-i * 1.3}s`, animationDuration: `${10 + (i % 4) * 2}s` }} />
        ))}

        <main className="lpx-shell">
          {/* المشهد: صيدلية ↔ منصة ↔ مستودع */}
          <section className="lpx-stage" aria-label="حلقة الوصل بين الصيدليات والمستودعات">
            <div className="lpx-scene" aria-hidden="true">
              <div className="lpx-obj">
                <div className="lpx-capsule" />
                <span className="lpx-obj-label">الصيدليات</span>
              </div>
              <div className="lpx-link" />
              <div className="lpx-orb">
                <div className="lpx-orb-glow" />
                <div className="lpx-orb-disc" />
                <div className="lpx-orb-ring" />
                <div className="lpx-orb-ring lpx-orb-ring-2" />
                <BrandMark size={72} />
              </div>
              <div className="lpx-link lpx-link-2" />
              <div className="lpx-obj">
                <div className="lpx-cube">
                  <i className="lpx-face" /><i className="lpx-face" /><i className="lpx-face" />
                  <i className="lpx-face" /><i className="lpx-face" /><i className="lpx-face" />
                </div>
                <span className="lpx-obj-label">المستودعات</span>
              </div>
            </div>

            <div className="lpx-copy">
              <span className="lpx-eyebrow"><ArrowLeftRight size={14} /> شبكة واحدة، فرص متوازنة</span>
              <h1>هنا تلتقي <span>الصيدلية بالمستودع</span></h1>
              <p>أسعار واضحة، تواصل مباشر، وصفقات أسرع، بدون وسطاء.</p>
            </div>
          </section>

          {/* بطاقة الدخول */}
          <section className="lpx-card-wrap">
            <div className="lpx-card">
              <div className="lpx-card-head">
                <div className="flex justify-center"><BrandMark size={56} /></div>
                <h2>بوابة LinkPharma</h2>
                <p>حلقة الوصل الذكية بين الصيدليات والمستودعات</p>
              </div>

              <div className="lpx-seg" data-aud={aud} role="group" aria-label="نوع الحساب">
                <span className="lpx-seg-thumb" aria-hidden="true" />
                {(Object.keys(AUD) as Audience[]).map(k => {
                  const I = AUD[k].Icon;
                  return (
                    <button key={k} type="button" aria-pressed={aud === k} onClick={() => setAud(k)}>
                      <I className="w-4 h-4" /> {AUD[k].label}
                    </button>
                  );
                })}
              </div>

              <div key={aud} className="lpx-pop">
                <p className="lpx-welcome">{cur.welcome}</p>
                <div className="lpx-hook">
                  <h3>{cur.headline}</h3>
                  <p>{cur.hook}</p>
                </div>
              </div>

              {errorMessage && (
                <div className="lpx-error">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button type="button" className="lpx-btn" onClick={handleGoogleAuth} disabled={busy}>
                {busy ? (
                  <>
                    <PharmacyBrandLoader size="xs" glow={false} />
                    <span>جاري تسجيل الدخول عبر Google...</span>
                  </>
                ) : (
                  <>
                    <span className="lpx-g">
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                    </span>
                    <span>ادخل إلى لينك فارما بحساب Google</span>
                  </>
                )}
              </button>

              <label className="lpx-remember">
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                تذكرني على هذا الجهاز
              </label>
              <p className="lpx-note">نستخدم بيانات الحساب لتجهيز الطلبات فقط ونحافظ على خصوصيتك.</p>
              <p className="lpx-join">حساب جديد؟ ادخل بحساب Google وأكمل بياناتك كصيدلية أو مستودع.</p>

              <div className="lpx-trust">
                <div><i><Handshake size={16} /></i><span>تواصل مباشر بين الطرفين</span></div>
                <div><i><BadgeCheck size={16} /></i><span>الاتفاق والدفع بينكما مباشرة</span></div>
                <div><i><RefreshCw size={16} /></i><span>أسعار محدّثة باستمرار</span></div>
              </div>
            </div>

            <p className="lpx-foot">
              <Lock className="w-3.5 h-3.5" />
              <span>منصة مهنية مخصصة للصيادلة والمستودعات الطبية المعتمدة</span>
            </p>
          </section>
        </main>
      </div>

      {loginWhatsAppEnabled && (
        <a href={`https://wa.me/${loginWhatsApp.replace(/\D/g, '')}?text=مرحباً، أحتاج مساعدة في تسجيل الدخول`} target="_blank" rel="noreferrer" className="lpx-help">
          <MessageCircle className="w-4 h-4" /> مساعدة واتساب
        </a>
      )}
    </>
  );
};
