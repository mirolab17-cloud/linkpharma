# LinkPharma v28

إصدار مستقل بُني بنسخ مشروع `v25` كاملًا إلى هذا المجلد، مع دمج صفحة الهبوط العربية المتجاوبة المقدمة في `LinkPharma_V25_Responsive_Landing.zip`. احتُفظ بمسارات التطبيق وصفحات الصيدليات والمستودعات والإدارة، وخدمات Firebase/Firestore، وFirebase Authentication وتسجيل الدخول عبر Google واستعادة الجلسات.

## الواجهة والمسارات

- تعرض الصفحة العامة أقسام الرئيسية وآلية العمل والمزايا والشراكة والتذييل بتخطيط RTL متجاوب يبدأ من الهاتف.
- زرا «تسجيل الدخول» ينتقلان إلى مسار المصادقة الحقيقي في التطبيق (`#/login` عبر `HashRouter`).
- مسار النشر على GitHub Pages هو `https://mirolab17-cloud.github.io/linkpharma/v28/`؛ تم ضبط أصول Vite وبيانات PWA على `/linkpharma/v28/`.

## البناء محليًا

```bash
npm ci --legacy-peer-deps
npm run lint
npm run build
```

تنشر GitHub Actions محتويات `dist/` إلى `dist/v28/` مع الاحتفاظ ببقية مسارات النشر الحالية. لا يرفع GitHub Pages قواعد Firestore إلى Firebase؛ راجع `DEPLOYMENT_AR.md` قبل نشر أي قواعد أو فهارس على Firebase.
