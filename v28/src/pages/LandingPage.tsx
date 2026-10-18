import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  FileText,
  Link2,
  Menu,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Store,
  X,
} from 'lucide-react';
import './LandingPage.css';

const LogoMark: React.FC<{ className?: string }> = ({ className }) => (
  <span className={`lp-brand-mark ${className || ''}`} aria-hidden="true">
    <Link2 />
  </span>
);

const PharmacyIcon: React.FC = () => (
  <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path d="M8 35V12h24v23M4 12h32L31 5H9L4 12Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M20 16v11M14.5 21.5h11" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    <path d="M13 35V29h5v6M23 35V29h5v6" stroke="currentColor" strokeWidth="2.5" />
  </svg>
);

const WarehouseIcon: React.FC = () => (
  <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path d="m4 15 16-9 16 9v20H4V15Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M4 15h32M13 35V20h14v15M17 24h6M17 28h6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const steps = [
  { number: '01', title: 'الصيدليات والمستودعات', text: 'لكل طرف احتياجاته ومعلوماته ضمن بيئة عمل واضحة.' },
  { number: '02', title: 'حلقة وصل رقمية', text: 'تجمع المنصة التجربة في واجهة موحدة وسهلة الفهم.' },
  { number: '03', title: 'تواصل أكثر وضوحًا', text: 'تجربة منظمة تساعد على الوصول إلى المعلومات والتواصل بكفاءة.' },
];

const features = [
  { Icon: Smartphone, title: 'تصميم متوافق', text: 'تجربة مرنة على الهاتف واللوحي والحاسوب.' },
  { Icon: MessageCircle, title: 'تواصل أكثر كفاءة', text: 'تنظيم أفضل للتواصل بين مختلف الأطراف.' },
  { Icon: FileText, title: 'معلومات منظمة', text: 'عرض واضح يساعد على فهم المعلومات بسهولة.' },
  { Icon: ShieldCheck, title: 'تجربة واضحة', text: 'واجهة بسيطة تُبرز المهم دون ازدحام بصري.' },
];

export const LandingPage: React.FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollTo = (sectionId: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setMenuOpen(false);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="lp-landing" dir="rtl">
      <header className="lp-topbar">
        <div className="lp-wrap lp-nav">
          <a className="lp-brand" href="#home" onClick={scrollTo('home')} aria-label="LinkPharma الرئيسية">
            <LogoMark />
            <span>LinkPharma<small>حلقة الوصل بين الصيدليات والمستودعات</small></span>
          </a>
          <nav className={`lp-links${menuOpen ? ' is-open' : ''}`} id="lp-site-links" aria-label="التنقل الرئيسي">
            <a href="#home" onClick={scrollTo('home')}>الرئيسية</a>
            <a href="#how" onClick={scrollTo('how')}>كيف تعمل المنصة</a>
            <a href="#features" onClick={scrollTo('features')}>المزايا</a>
            <a href="#partnership" onClick={scrollTo('partnership')}>الشراكة</a>
          </nav>
          <Link className="lp-btn lp-btn-primary lp-login-top" to="/login" onClick={closeMenu}>تسجيل الدخول <span aria-hidden="true">↗</span></Link>
          <button
            className="lp-menu-btn"
            type="button"
            aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
            aria-expanded={menuOpen}
            aria-controls="lp-site-links"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main>
        <section className="lp-hero" id="home">
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy-wrap">
              <div className="lp-eyebrow"><i aria-hidden="true" />منصة رقمية تربط القطاع الدوائي</div>
              <h1>حلقة الوصل الذكية بين <span>الصيدليات والمستودعات</span></h1>
              <p className="lp-hero-copy">منصة رقمية تجمع عروض التوريد ومعلومات الأصناف في تجربة أكثر وضوحًا وشفافية.</p>
              <div className="lp-actions">
                <Link className="lp-btn lp-btn-primary" to="/login">تسجيل الدخول <span aria-hidden="true">↗</span></Link>
                <a className="lp-btn lp-btn-outline" href="#how" onClick={scrollTo('how')}>تعرّف على آلية العمل <span aria-hidden="true">↓</span></a>
              </div>
              <div className="lp-trust" aria-label="مميزات LinkPharma">
                <span><b className="lp-check"><Check /></b> تجربة واضحة</span>
                <span><b className="lp-check"><Check /></b> تواصل أكثر كفاءة</span>
                <span><b className="lp-check"><Check /></b> للطرفين</span>
              </div>
            </div>
            <div className="lp-visual" role="img" aria-label="رسم رمزي للترابط بين الصيدلية والمستودع">
              <div className="lp-visual-glow" />
              <div className="lp-scene">
                <div className="lp-scene-line" />
                <div className="lp-float-chip lp-chip-one">ترابط رقمي ذكي</div>
                <div className="lp-float-chip lp-chip-two">شراكة متوازنة</div>
                <div className="lp-node lp-node-pharmacy">
                  <div className="lp-node-icon"><PharmacyIcon /></div>
                  <strong>الصيدليات</strong><small>احتياجات وتجربة استخدام</small>
                </div>
                <div className="lp-node lp-node-warehouse">
                  <div className="lp-node-icon"><WarehouseIcon /></div>
                  <strong>المستودعات</strong><small>معلومات وتواصل منظم</small>
                </div>
                <div className="lp-scene-core"><LogoMark /></div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section" id="how">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-section-kicker">كيف تعمل المنصة؟</span>
              <h2>من الصيدلية إلى المستودع.. عبر منصة واحدة</h2>
              <p>تساعد LinkPharma على تنظيم التواصل وتبادل المعلومات ضمن تجربة رقمية واضحة للطرفين.</p>
            </div>
            <div className="lp-steps">
              {steps.map((step) => (
                <article className="lp-step" key={step.number}>
                  <span className="lp-step-num">{step.number}</span>
                  <h3>{step.title}</h3><p>{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section lp-section-soft" id="features">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-section-kicker">مزايا المنصة</span>
              <h2>كل ما تحتاجه في تجربة واحدة</h2>
              <p>واجهة عملية تجمع بين البساطة والوضوح والتوافق مع مختلف الأجهزة.</p>
            </div>
            <div className="lp-features">
              {features.map(({ Icon, title, text }) => (
                <article className="lp-feature" key={title}>
                  <div className="lp-feature-icon"><Icon aria-hidden="true" /></div>
                  <h3>{title}</h3><p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="partnership">
          <div className="lp-wrap">
            <div className="lp-partnership">
              <div className="lp-partnership-copy">
                <span className="lp-section-kicker">شراكة متوازنة</span>
                <h2>نجاح المنصة يبدأ بنجاح الطرفين</h2>
                <p>تؤمن LinkPharma بأن الصيدليات والمستودعات شركاء في منظومة واحدة. لذلك صُممت التجربة لتكون واضحة ومتوازنة، وتدعم التواصل وتبادل المعلومات دون تفضيل طرف على آخر.</p>
              </div>
              <div className="lp-partners">
                <div className="lp-partner"><div className="lp-partner-icon"><PharmacyIcon /></div><b>الصيدليات</b><small>تجربة رقمية أوضح</small></div>
                <div className="lp-partner"><div className="lp-partner-icon"><WarehouseIcon /></div><b>المستودعات</b><small>تواصل منظم وواضح</small></div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer" id="contact">
        <div className="lp-wrap">
          <div className="lp-footer-main">
            <a className="lp-brand" href="#home" onClick={scrollTo('home')}>
              <LogoMark />
              <span>LinkPharma<small>حلقة الوصل بين الصيدليات والمستودعات</small></span>
            </a>
            <nav className="lp-footer-links" aria-label="روابط التذييل">
              <a href="#home" onClick={scrollTo('home')}>الرئيسية</a>
              <a href="#how" onClick={scrollTo('how')}>كيف تعمل المنصة</a>
              <a href="#features" onClick={scrollTo('features')}>المزايا</a>
              <a href="#partnership" onClick={scrollTo('partnership')}>الشراكة</a>
              <a href="#contact" onClick={scrollTo('contact')}>تواصل معنا</a>
            </nav>
          </div>
          <div className="lp-copyright"><span>© LinkPharma — جميع الحقوق محفوظة</span><span>معًا نحو تجربة رقمية أكثر وضوحًا وشفافية</span></div>
        </div>
      </footer>
    </div>
  );
};
