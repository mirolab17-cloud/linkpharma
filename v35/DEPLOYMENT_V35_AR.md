# نشر V35

## رابط التطبيق

بعد اكتمال GitHub Action باسم **Deploy to GitHub Pages** سيكون تطبيق المنصة على:

`https://mirolab17-cloud.github.io/linkpharma/v35/platform.html`

والصفحة التعريفية لهذا الإصدار على:

`https://mirolab17-cloud.github.io/linkpharma/v35/`

## ما الذي ينشره GitHub Actions؟

عند الدفع إلى `main`، يجري مسار العمل تثبيت الحزم، وفحص TypeScript، وتشغيل اختبارات قواعد Firestore على Emulator، ثم بناء V35 ونسخه إلى `dist/v35`. بعد نجاح مرحلة النشر يظهر رابط Pages في سجل تشغيل GitHub Actions.

## قواعد Firebase مطلوبة قبل استخدام العروض

نشر GitHub Pages لا يحدّث إعداد Firebase ولا قواعد Firestore. تمت إضافة `supplier_offers` إلى `firestore.rules` في مجلد V35. قبل استخدام صفحة العروض على قاعدة الإنتاج:

1. قارن قواعد V35 بقواعد المشروع الحالية ولا تستبدل قواعد الإنتاج بملف V35 كاملًا دون مراجعة.
2. ادمج مقطع `supplier_offers` وتحديث دالة `representativeCanManagePromotions` في القواعد الفعلية.
3. اختبر الأدوار في Firebase Emulator أو مشروع مرحلي؛ تشمل الاختبارات المضافة مندوبًا لديه صلاحية العروض فقط، ومحاولة الوصول إلى مستودع آخر.
4. انشر القواعد والفهارس من Firebase Console أو من مجلد Firebase المرتبط رسميًا بالمشروع بعد التحقق من المشروع الصحيح.

لم يتم الاتصال بمشروع Firebase الإنتاجي أو تغيير قواعده في هذه المهمة. صفحة العروض ستظهر بعد نشر الموقع، لكن القراءة أو الكتابة إلى Firestore قد ترفضها القواعد الإنتاجية القديمة إلى أن تُدمج التغييرات.
