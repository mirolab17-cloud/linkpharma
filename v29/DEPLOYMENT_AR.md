# النشر والتشغيل — LinkPharma v29

## المصدر والنشر

نسخة مستقلة مبنية على أحدث `v27/` في المستودع عند إنشاء الإصدار، وتُبنى وتنشر إلى `/linkpharma/v29/` عبر GitHub Actions. رابط الإنتاج المقصود: `https://mirolab17-cloud.github.io/linkpharma/v29/`.

## الفحص محليًا

```bash
npm ci --legacy-peer-deps
npm run lint
npm run test:unit
npm run test:rules:emulator
npm run build
npm run preview -- --host 0.0.0.0
```

اختبر واجهة الهبوط على الهاتف والحاسوب، والقائمة وروابطها، ومسار `platform.html#/login`، وزر Google، وموارد Vite وPWA تحت مسار الإصدار.

## Firebase Authentication وFirestore

يحافظ v29 على Firebase Authentication ومزوّد Google الموجودين في المصدر. عند استعادة الجلسة تبقى الواجهة على شاشة تحميل حتى استقرار Auth وقراءة ملف المستخدم المؤكد؛ لا يتحول خطأ القراءة إلى ملف افتراضي أو صلاحية فعالة. عند استمرار الخطأ تظهر رسالة ووسيلة لإعادة المحاولة.

لا ينشر GitHub Pages قواعد أو فهارس Firestore. شغّل اختبارات القواعد على Emulator، وراجع القواعد الفعلية في Firebase/بيئة مرحلية بشكل مستقل. تقرير المراجعة المرفق هو تدقيق ساكن وليس اختبار اختراق أو شهادة خلو من الثغرات.
