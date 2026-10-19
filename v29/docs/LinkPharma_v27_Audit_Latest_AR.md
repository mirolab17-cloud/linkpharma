# تقرير التدقيق الساكن المحدث — LinkPharma v27

**تاريخ المراجعة:** 2026-10-19، وفق التاريخ الظاهر في سجل المستودع
**المسار المراجع:** `/home/ubuntu/work/linkpharma/repo/v27`
**الفرع:** `main`
**آخر commit ظاهر في دليل المسار:** `a48564bc5866841e1fff125d223cef8e33ac0c2a` (`a48564b`) — `fix(v28): recover stale admin dashboard chunks`

> **تنبيه النطاق:** العنوان/المسار يحددان نسخة `v27`، لكن رسالة الـcommit الظاهرة تشير إلى إصلاح v28. لا أستنتج من الرسالة وحدها أن الإصلاح يخص وظائف v27، وأقيّم فقط الملفات الموجودة فعلياً تحت `repo/v27`.

## 1. الملخص التنفيذي

هذا **تدقيق ساكن (source-only)** محدث، مبني على النتائج المنظمة المقدمة، وعلى مقارنة التقرير السابق `LinkPharma_v27_Audit_and_50_Recommendations_AR.md` بالمصدر الحالي. لم أعدّل ملفات المشروع، ولم أكتب إلى Firebase، ولم أشغّل التطبيق أو Emulator أو اختبارات صلاحيات أو اختبار اختراق.

أعلى المخاطر المثبتة حالياً هي:

1. **ثقة زائدة في العميل والتخزين المحلي:** ملف المستخدم المؤقت، السلة العامة، fallback الأسعار، والأسعار/الإجماليات في الطلبات يمكن أن تؤثر في الواجهة أو payload قبل تحقق سلطوي كافٍ.
2. **فشل القراءة يتحول أحياناً إلى نجاح أو جلسة نشطة:** fallback الجلسة يضع `pharmacy/active/trial`، وفشل عمليات Firestore في عدة خدمات يتحول إلى localStorage ونجاح ظاهري.
3. **سباقات وتوقيتات غير محمية:** callbacks القديمة بعد تبديل الحساب، وtimeout ملف المستخدم الذي يُلغى عند أول snapshot قبل اكتمال المعالجة.
4. **قواعد Firestore لا تفرض بعض invariants الحساسة:** التسجيل الذاتي يستطيع اختيار `active` وتاريخ مستقبلي، والطلبات لا تفرض schema أو supplier scoping أو إعادة احتساب `total`، وفصل الموافقة الثنائية غير مفروض في القاعدة.
5. **سلامة سجل التدقيق غير كافية:** `platform_activity` و`priceHistory` يقبلان حقولاً دلالية من العميل؛ يستطيع المستخدم المصادق تزوير `actorRole/type/timestamp`، ولا يصبح السجل دليلاً append-only موثوقاً.
6. **استيراد الأسعار والتراجع غير ذريين:** الدفعات تكتب عبر عدة batches، و`rollbackImportBatch` محلي فقط، وقد تبقى كتابة جزئية أو رسالة نجاح كاذبة.

لا يعني ذلك أن كل أثر سيحدث في كل بيئة. كل أثر مشروط مذكور بشرطه، ولا أستنتج إنفاذاً فعلياً على الخادم أو نتيجة شبكة من دون تشغيل وقواعد منشورة.

## 2. حدود المراجعة ومنهجيتها

### ما شمله الفحص

شملت المراجعة المصدر الحالي الظاهر في النتائج المنظمة، ومنه:

- `v27/src/store/useAuthStore.ts`, `v27/src/pages/auth/Login.tsx`, `v27/src/firebase.ts`, `v27/src/App.tsx`، مع بحث نصي عن `setPersistence` داخل `v27/src`.
- `v27/firestore.rules`, `v27/firestore.indexes.json`, `v27/test/firestore-v25.rules.test.ts`.
- صفحات الصيدلية والإدارة والممثل، و`src/services/dataStorage.ts`، وخدمات الاعتمادات والإعلانات والميزات، و`utils/formatPrice.ts`، ومكونات React ذات الصلة.
- مسارات الاستيراد والكتالوج والتراجع، `package.json`, `server.ts`, lockfiles، وسياق CI/Pages الظاهر في التقرير السابق والنتائج المنظمة.

### ما لم يشمله الفحص

- لا مراجعة لـ`firestore.rules` المنشورة فعلياً أو Firebase Emulator أو بيانات الإنتاج.
- لا مراجعة لـCloud Functions/triggers أو backend خارجي أو Claims/Auth configuration أو App Check أو إعدادات Authorized Domains.
- لا اختبار متصفح/أجهزة/قارئ شاشة، ولا اختبار شبكة، ولا اختبار اختراق، ولا إثبات لسلوك runtime.
- لم تُعدّل ملفات ولم تُنفذ كتابة إلى Firebase.
- لا أتعامل مع fallback المحلي على أنه يمنح صلاحية Firestore عن بُعد؛ أثره المثبت هو أثر على العميل/الذاكرة/الواجهة، ما لم تثبت القواعد أو التشغيل خلاف ذلك.

### ملاحظة على التكرار

تكرر بعض النتائج في أكثر من مجال لأنها تثبت المسار من زاويتين مختلفتين؛ لا أعدّ التكرار دليلاً مستقلاً ولا أرفع الخطورة لمجرد ظهوره مرتين.

## 3. أهم النتائج الحالية

### 3.1 الجلسة، refresh، redirect، cache وتبديل الحساب

- **اعتماد قرارات المسار على cache قابل للتعديل:** `pharma_profile_cache_v7` يُقرأ ويُطبق قبل وصول Firestore، و`App.tsx` يستخدم `role/status/isExpired` للحراسة. `logout` لا يستدعي `clearCachedProfile`. هذا يثبت تجاوز حاجز العميل/خلطاً زمنياً، لا تجاوز قواعد Firestore.
- **Fail-open عند فشل ملف المستخدم:** `profileFallback` يضع `role=pharmacy`, `status=active`, `subscriptionStatus=trial` بلا `subscriptionExpiresAtMillis`، ويُستخدم عند timeout أو خطأ snapshot. `isExpired` يعيد false عند غياب تاريخ الانتهاء.
- **سباق تبديل الحساب:** `handleUserSnap` async ويبدأ من callback غير منتظر، ولا توجد generation token أو تحقق من `auth.currentUser?.uid` قبل كل `set`. unsubscribe لا يلغي callback قيد التنفيذ، وlogout لا يلغي العمليات المعلقة.
- **timeout غير فعلي:** مؤقت 10 ثوانٍ يُلغى عند أول snapshot قبل اكتمال `getDocFromServer`/`setDoc`، وقد يبقى `loading=true` بلا مهلة تغطي العملية كاملة.
- **خيار «تذكرني» غير موصول:** `Login.tsx` يقرأ/يكتب `pharma_remember_me` فقط؛ لا يوجد `setPersistence` في `v27/src`، و`browserLocalPersistence` المستورد غير مستخدم.
- **سباق redirect منخفض الخطورة:** `getRedirectResult` قد يُفسر نتيجة فارغة قبل وصول `onAuthStateChanged`، فيظهر فشل Google مبكراً.

### 3.2 Firestore والقواعد والاختبارات

- **التسجيل الذاتي:** القاعدة تسمح بإنشاء `users/{userId}` كـ`pharmacy/active` مع `active` أو `trial` وتاريخ مستقبلي حتى 366 يوماً، بلا اشتقاق من `settings/system` وبلا تحقق كافٍ من اتساق الحقول و`uid`.
- **الموافقات:** `admin_change_approvals` تسمح لـ`isAdmin()` بالتحديث/الحذف دون منع reviewer من مساواة requester أو تثبيت payload/انتقالات الحالة. منع الاعتماد الذاتي في الخدمة/الواجهة ليس بديلاً عن القاعدة.
- **الطلبات:** إنشاء order يثبت الملكية والحالة والاشتراك فقط، والتحديث يثبت بعض الأنواع العامة؛ لا يوجد schema كامل للعناصر أو supplier/product ownership أو اتساق `total` مع العناصر.
- **التدقيق:** `platform_activity` يثبت `actorId` فقط تقريباً؛ يمكن للعميل اختيار `actorRole`, `type`, `createdAt`, `actorName`, `message`, `metadata`.
- **التغطية:** الملف الموجود `firestore-v25.rules.test.ts` يستخدم مشروع/تسمية v25 ولا يغطي المسارات الحرجة المذكورة في النتائج الحالية، كما أن الفهارس لا تثبت صلاحيات أو صحة schema.

### 3.3 الأسعار والموردون والصيدلية

- **Fallback أسعار غير مقيد:** `Suppliers.tsx` و`Cart.tsx` يستدعيان `getPrices()` بلا `allowedSupplierIds`؛ وعند الخطأ قد يعيد fallback كل `allLocal`، رغم أن القاعدة تقيد القراءة الشبكية.
- **خلط السعر الاسمي والفعلي:** الفرز والشارة والتوفير والمقارنة في عدة صفحات تستخدم `p.price`، بينما `calculateEffectiveUnitPrice` يحسب البونص في مسار منفصل.
- **محلل البونص ضيق:** regex يدعم `رقم+رقم` ASCII فقط، مع أن `bonus` نص حر؛ عرض bonus لا يضمن احتسابه.
- **التكرار والمقارنة:** إزالة سجلات لاحقة قد تتجاهل bonus/available/updatedAt/id، و`Suppliers.tsx` تستخدم `find` لأول سجل مطابق، ما يجعل النتيجة معتمدة على ترتيب البيانات.
- **الصفحات اللاحقة:** إذا كانت الدفعة الأولى فارغة بعد الفلترة مع وجود `hasMoreServer`, يظهر EmptyState قبل رابط التحميل.
- **اتجاه السعر:** `Prices.tsx` يضبط `priceHistory=[]` ولا يجلب التاريخ في المسار المذكور؛ و`ProductDetails` يقص التاريخ إلى أول 100 دون pagination.

### 3.4 الإدارة، الممثلون، الطلبات والاستيراد

- حماية المدير الرئيسي بالبريد في React فقط؛ الخدمة والقواعد لا تمنع مديراً آخر من خفض الدور أو حذف marker.
- عمليات الحذف/تغيير الاشتراك وبعض عمليات الحفظ تبتلع فشل Firestore ثم تعدل localStorage؛ الواجهة قد تعرض success مع بقاء السحابة كما هي.
- حذف المنتجات/الموردين لا ينظف prices/priceHistory/importBatches التابعة.
- الاستعادة تدمج سجلات خاماً دون schema/domain validation كافٍ.
- دفعة أسعار كبيرة يمكن تمريرها إلى `commitImportBatch` مباشرة؛ `approvalId` اختياري والقواعد لا تشترط حالة اعتماد.
- `commitImportBatch` يكتب على عدة `writeBatch` متتابعة؛ فشل جزء لاحق يترك أسعاراً/تاريخاً جزئياً بلا rollback عابر للأجزاء.
- rollback الأسعار يعدل localStorage فقط ولا يكتب `prices`, `priceHistory`, `importBatches` في Firestore.
- parsing ملفات الجداول كامل في الذاكرة بلا حد file size/rows/columns/sheets؛ التكرارات الداخلية في بعض مسارات الكتالوج/الأسعار لا تُراجع قبل الاعتماد.

### 3.5 السلة والطلبات

- `pharma_comparison_cart_v1` مفتاح localStorage ثابت لا يرتبط بـuid ولا يمسحه logout؛ قد تنتقل السلة لحساب آخر على نفس origin.
- `createOrder` يمرر الأسعار والعناصر والإجمالي المحسوب من السلة؛ القاعدة لا تعيد احتساب `total` ولا تتحقق من item schema أو المورد المسموح أو العرض الحالي.
- supplier name/WhatsApp تأتي من السلة ولا يعاد اشتقاقها من `suppliers/{supplierId}`.
- لا توجد idempotency حقيقية للإرسال المكرر؛ `Date.now()` ليس مفتاح deduplication كافياً.
- مسار تعديل الطلب لا يثبت أن المجموعة المرسلة ما زالت تخص supplier الأصلي.
- reorder/templates قد تستخدم السعر التاريخي أو عرضاً غير متاح/مخفي، لأن fallback لا يتحقق من `available` وsupplier status وallowed scope.

### 3.6 الإعلان، التدقيق، React والنشر

- نطاق الإعلان (`recipientUids`, `audience`, `targetCount`) يأتي من العميل ولا يعاد اشتقاقه خادمياً.
- `createNotification` وبعض activity تسجل محلياً بعد فشل Firestore؛ و`priceHistory` قد يعود من local fallback غير موثوق.
- `handleFirestoreError` يضم uid/email/provider/path وغيرها في Error وconsole، وقد يصل `err.message` إلى toast؛ وErrorBoundary يعرض الرسالة الخام ويتيح نسخ stack.
- عناصر NotificationBell القابلة للنقر ليست أزراراً دلالية ولا تملك keyboard handling/aria مناسباً في المواضع المذكورة.
- `start: node server.ts` لا يطابق تشغيل TypeScript المباشر، وCI يستخدم `npm install` لا `npm ci`، واختبارات v27 غير بوابة نشر وفق الأدلة الحالية.

## 4. تغييرات ثبت أنها حسّنت الوضع — لكنها لا تغلق النتائج المرتبطة

هذه ضوابط إيجابية ظهرت فعلاً في المصدر الحالي، ولذلك لا أعرضها كـfindings مفتوحة مستقلة:

- تركيب `onAuthStateChanged` قبل `getRedirectResult`، ووجود `activeGoogleSignInPromise` وfallback popup→redirect و`prompt=select_account`.
- cache profile مربوط بـuid عند القراءة، ويوجد `getDocFromServer` قبل إنشاء ملف جديد في فرع snapshot غير الموجود.
- الحراس ينتظرون `initialized/loading` ويفحصون role/status/subscription/profileComplete، مع إعادة تحقق قبل تغيير كلمة المرور.
- `updateUserProfile` يحذف الحقول الحساسة role/status/subscription/allowedSuppliers قبل الكتابة العميلية، و`signOut` يستدعي Firebase signOut قبل تصفير user.
- default-deny في قواعد Firestore، وتقييد عدة مسارات بالملكية/الدور، وتقييد صلاحيات الممثل بمورد نشط وصلاحيات منفصلة.
- قراءة orders مربوطة بملكية pharmacy أو admin، وقواعد templates مربوطة بUID المالك، والـprices الطبيعية تستخدم allowed suppliers في بعض الصفحات.
- واجهة الاستيراد تفرض مسار موافقة للدفعات الكبيرة، وتتحقق محلياً من actor وصلاحيات الممثل وحجم طلب الاعتماد، و`reviewAdminChangeApproval` يستخدم transaction ويمنع reviewer العميل من الاعتماد الذاتي داخل ذلك المسار؛ **لكن قواعد Firestore ومسار commit المباشر لا تفرض ذلك**.
- `parseSpreadsheetFile` يحتفظ بأرقام الصفوف ويعطي أسباباً للصفوف غير الصالحة، و`commitImportBatch` يرفض السعر غير الموجب/غير finite ويكتب price history في المسار المعتاد؛ **لكن الحدود والذرية والربط الخادمي ما زالت ناقصة**.
- لا تظهر sinks DOM الخطرة مثل `dangerouslySetInnerHTML` أو `eval` في المصدر المفحوص، وRTL/responsive وHashRouter وروابط WhatsApp المرمّزة موجودة.
- مفاتيح cache الخاصة باستعلام `getPrices` تميز قائمة الموردين و`includeHidden`، لكن هذا لا يعالج الاستدعاءات التي لا تمرر النطاق ولا namespacing الكامل حسب uid.

## 5. تقييم التوصيات الخمسين من التقرير السابق

**مفتوح:** التوصية ما زالت مناسبة ومثبتة مباشرة من الأدلة الحالية.
**جزئي:** يوجد ضابط حقيقي في v27، لكنه لا يغطي كامل التوصية.
**غير محسوم من النطاق الحالي:** لا توجد أدلة كافية في المادة الحالية لإعلان التنفيذ أو فتح finding جديد؛ لا أعرضه كخطر مثبت.

### 5.1 لوحة الإدارة — 18 اقتراحاً

| ID | الحالة في v27 | الاقتراح التنفيذي المحدد | سبب الحالة/الدليل الحالي |
|---|---|---|---|
| A01 | **مفتوح** | اجعل `approvalId` وحالة `approved` شرطاً خادمياً للدفعات الحساسة، واربطهما بالطالب والمورد والحمولة. | الواجهة تمرر الدفعة الكبيرة إلى approval، لكن `commitImportBatch` يجعل الحقل اختيارياً والقواعد لا تفرضه. |
| A02 | **مفتوح** | نفّذ استيراداً ذرياً ضمن حد Firestore أو staging بـ`batchId` وحالة `pending/finalized` وتعويض idempotent. | عدة `writeBatch` متتابعة؛ فشل جزء لاحق يترك أسعاراً وتاريخاً جزئيين. |
| A03 | **مفتوح** | اجعل rollback مشروطاً بأن القيمة الحالية تساوي `history.next`، وبمعاملة تستعيد كل الحقول وتسجل rollback. | rollback الحالي محلي فقط ولا يفحص نسخة أحدث أو يعيد جميع الحقول. |
| A04 | **مفتوح** | أنشئ Audit log خادمياً append-only لكل mutation إداري، مع actor مشتق وbefore/after و`correlationId`. | activity وpriceHistory يقبلان حقولاً دلالية من العميل، وتغييرات الإدارة لا تملك أثراً مركزياً موثوقاً كاملاً. |
| A05 | **جزئي** | اعرض قبل الاعتماد تقريراً بعدد المقبول/المرفوض وأرقام الصفوف والأسباب، واطلب تأكيداً صريحاً للاعتماد الجزئي. | parser يحتفظ بأرقام الصفوف وأسباب invalid وتوجد معاينة، لكن لا يثبت المصدر تقريراً شاملاً موحداً لكل مسار. |
| A06 | **مفتوح** | اكشف تكرار `productId`/المفتاح المركب داخل ملف الأسعار وارفضه أو اعرض سياسة الحسم قبل الاعتماد. | `Map` يحسم بتفضيل آخر صف بصمت، وقد لا يطابق count/approval السجلات الفعلية. |
| A07 | **مفتوح** | تحقق خادمياً من وجود المنتج ونشاطه قبل إنشاء `price`، واربطه بـsupplier/product canonical. | القواعد والخدمة تتحقق من الشكل والسعر، لا من وجود product مرجعي في evidence الحالي. |
| A08 | **مفتوح** | اعزل parsing في Worker/خدمة، وافرض حدود bytes/rows/columns/sheets ومهلة، ولا تعرض كل الصفوف دفعة واحدة. | `arrayBuffer` و`sheet_to_json` كاملان بلا حدود ظاهرة. |
| A09 | **مفتوح** | استبدل `cleanPrice` بتطبيع صارم: رقم واحد فقط، رفض الأحرف/الإشارات الزائدة، `finite` وحدود منطقية. | `formatPrice.ts:45-64` يحذف كل ما ليس رقماً/نقطة؛ قد يحول مدخلات مشوهة مثل `-10` أو `12abc34` إلى قيمة موجبة. |
| A10 | **غير محسوم من النطاق الحالي** | عرّف `priceOfferSortMode` كـenum عام ومقيد، ووحّد سياسة cheapest/effective/updated/alphabetical. | لا توجد في النتائج المنظمة أدلة تنفيذ سياسة إدارية عامة؛ التوصية مناسبة تصميمياً، لكن لا أعدّها finding مستقلاً هنا. |
| A11 | **مفتوح** | أنشئ comparator مركزي يحدد availability وeffective price وbonus وupdatedAt وكاسرات التعادل لكل الصفحات. | Prices وProductDetails وSuppliers تستخدم معايير مختلفة؛ البونص لا يدخل كل المقارنات. |
| A12 | **مفتوح** | أضف حالة `pending-sync/error/retry` ولا تعرض success بعد fallback محلي لعملية إدارية. | عدة خدمات تبتلع فشل Firestore ثم تكتب localStorage أو تعيد نجاحاً ظاهرياً. |
| A13 | **غير محسوم من النطاق الحالي** | ضع Gemini خلف Function مصادق عليها، بحصة ومهلة وسجل استخدام، ولا تعرض المفتاح للمتصفح. | لا يثبت سجل النتائج الحالي مفتاحاً سرياً مكشوفاً؛ لا أعيد فتح finding Gemini السابق بلا دليل حالي مباشر. |
| A14 | **مفتوح** | أعد للواجهة رسالة عامة مع correlation ID، وانقل uid/email/path/stack إلى قناة منقحة محمية. | `handleFirestoreError` وErrorBoundary قد يعيدان PII ورسائل ومسارات داخلية إلى console/toast/واجهة الإدارة. |
| A15 | **مفتوح** | استخدم `operationId` ثابتاً وlease/recovery لحالة `processing`، وامنع إعادة الاعتماد أو الإرسال المكرر. | طلب الاعتماد قد يبقى pending بعد فشل activity، والاستيراد/الإشعارات بلا idempotency عابر للخطوات. |
| A16 | **غير محسوم من النطاق الحالي** | اطلب إعادة مصادقة وتأكيداً منفصلاً لتغيير المديرين أو حذف المستخدمين أو rollback. | توجد أزرار تأكيد في الواجهة، لكن لا تكفي الأدلة الحالية لإثبات تطبيق إعادة مصادقة؛ لا أعدّ غيابها finding مستقلاً هنا. |
| A17 | **مفتوح** | أضف Emulator suite خاصة بـv27 للدفعات والاعتماد والrollback والحقول الزائدة، واجعلها gate قبل النشر. | الاختبار الموجود موسوم v25، وCI الظاهر لـv27 يبني ويفحص lint دون تشغيل suite القواعد. |
| A18 | **مفتوح** | استخدم `npm ci` وlockfile واحداً وSCA/audit، وثبّت نسخ actions قبل إنتاج artifact. | يوجد `package-lock.json` و`bun.lock`، وCI يستخدم `npm install --legacy-peer-deps`؛ لا تثبت الأدلة reproducible install. |

### 5.2 لوحة المستودع — 16 اقتراحاً

| ID | الحالة في v27 | الاقتراح التنفيذي المحدد | سبب الحالة/الدليل الحالي |
|---|---|---|---|
| W01 | **غير محسوم من النطاق الحالي** | أضف صندوق وارد للمستودع يقرأ orders المقيدة بـ`supplierId` للممثل فقط. | RepresentativeWorkspace يعرض أدوات المورد؛ عدم وجود inbox لم يُقدّم هنا كـfinding مستقل ولا تثبته القواعد وحدها. |
| W02 | **غير محسوم من النطاق الحالي** | عرّف انتقالات `sent→confirmed→processing→delivered/rejected` خادمياً مع `statusHistory`. | سياسة انتقالات المورد/المشغل غير معرّفة بالكامل في النطاق؛ لا أرفع غيابها إلى ثغرة. |
| W03 | **مفتوح** | تحقق خادمياً من وجود المورد ونشاطه وربطه بالصيدلية و`allowedSuppliers` قبل إنشاء/تعديل order. | قواعد orders لا تتحقق من وجود supplier أو نشاطه أو دخوله في allowed list. |
| W04 | **مفتوح** | أنشئ الطلب عبر Function/مسار موثوق يعيد قراءة product/price/availability ويحسب `total`. | السلة و`createOrder` يرسلان items/prices/total من العميل، والقواعد لا تعيد الحساب. |
| W05 | **مفتوح** | مرّر `allowedSupplierIds` إلزامياً إلى Cart وSuppliers، وطبّقه قبل Firestore وقبل local fallback. | الاستدعاءات الحالية بلا نطاق؛ fallback قد يعيد `allLocal` رغم رفض الاستعلام المقيد. |
| W06 | **جزئي** | اجعل cache الأسعار namespaced بـuid والدور والنطاق، وامسحه عند logout/تبديل الحساب. | cache key يميز قائمة الموردين و`includeHidden`، لكن cart/global fallback وغياب uid ما زالت قائمة. |
| W07 | **غير محسوم من النطاق الحالي** | افصل DTO العام للمورد عن `importTemplate` وحقول التتبع الداخلية. | التوصية مناسبة لتقليل الإفشاء، لكن الأدلة الحالية لا تحسم وجود سر أو كشف جديد beyond ما سبق. |
| W08 | **غير محسوم من النطاق الحالي** | افحص enum الأيام وHH:MM والأرقام غير السالبة وحجم خرائط جدول التوصيل خادمياً. | النتائج الحالية تثبت أن الحد الأدنى/cutoff لا يفرضان عند الإرسال، لا مراجعة schema كاملة للجدول؛ التوصية تبقى hardening. |
| W09 | **مفتوح** | سجّل تغييرات السعر والجدول والقالب من الخادم وبقيم مشتقة من الهوية، لا من `actorName` العميل. | `platform_activity` و`priceHistory` يسمحان ببيانات actor/type وصفية من العميل. |
| W10 | **غير محسوم من النطاق الحالي** | استخدم version/precondition عند تعديل price أو delivery schedule وأظهر تعارضاً. | لا توجد في findings الحالية أدلة كافية على سباق محدد لهذه الكتابات؛ لا أعدّه finding مفتوحاً مستقلاً. |
| W11 | **مفتوح** | امنع كتابة `priceHistory` المباشرة؛ أنشئه ضمن معاملة تغيير price وبـbefore/next وbatch موثوق. | القاعدة تسمح create/update/delete في مسارات لا تثبت الارتباط بتغيير السعر، والمندوب يستطيع إدخال حقول history. |
| W12 | **مفتوح** | نفّذ supplier filtering قبل إدخال البيانات إلى الذاكرة/React، لا بعد جلب collection كاملة. | Prices بعض الصفحات تقيد العرض، لكن Suppliers/Cart وfallback يعيدان نطاقاً أوسع من اللازم. |
| W13 | **مفتوح** | وحّد إظهار `available`, `effectivePrice`, و`updatedAt` الصحيح، واعتبر التاريخ المفقود غير حديث. | المقارنة الحالية تتجاهل bonus/availability في مواضع، واتساق freshness غير مثبت. |
| W14 | **مفتوح** | لا تنفذ reorder إلا بعرض حالي مرئي ومتاح ولمورد مسموح؛ وإلا اطلب اختياراً جديداً. | MyOrders/templates تستخدم fallback إلى السعر القديم ولا تتحقق دائماً من available/status/scope. |
| W15 | **مفتوح** | اشتق جمهور إشعارات المستودع خادمياً من الدور والحالة وsupplierId، واربط كل notification بسبب الاستحقاق. | `recipientUids/audience/targetCount` تأتي من العميل؛ القواعد لا تعيد اشتقاق كل مستلم. |
| W16 | **مفتوح** | أضف Emulator tests لعزل supplier A عن B للممثل والصيدلية والأسعار والطلبات، مع SDK مباشر وfallback. | اختبارات v25 الحالية لا تغطي المسارات الحرجة أو supplier/order isolation المطلوبة في v27. |

### 5.3 الصلاحيات والهوية — 16 اقتراحاً

| ID | الحالة في v27 | الاقتراح التنفيذي المحدد | سبب الحالة/الدليل الحالي |
|---|---|---|---|
| P01 | **مفتوح** | أضف auth-generation/UID token أو AbortController، وافحصه قبل كل `set`, redirect وcache write. | callbacks القديمة لا تتحقق من uid الحالي، وlogout لا يلغي pending async. |
| P02 | **مفتوح** | عند timeout/permission-denied أبقِ الحالة غير موثقة، واعرض retry، ولا تمنح role/status افتراضيين. | fallback النشط يجعل المسار fail-open وقد يبقي loading بلا timeout فعلي. |
| P03 | **جزئي** | لا تقبل cache كملف سلطوي؛ استخدم server snapshot حديثاً مع عمر/lease وربط uid والجيل. | cache مربوط بـuid ويوجد getDocFromServer في فرع missing، لكن cache يطبق فوراً وfallback يسمح بالدخول قبل authority. |
| P04 | **مفتوح** | انقل role/status/subscription/expiry إلى entitlement خادمي أو claims، واشتق مدة trial من إعداد موثوق. | التسجيل الذاتي يختار active/expiry، وfallback يضع trial بلا expiry موثوق. |
| P05 | **جزئي** | اجعل حذف/تعليق المستخدم عملية خادمية تعطل Auth أو تضع tombstone، ولا تعلن نجاحاً عند فشل Firestore. | فشل `deleteUser`/تغيير الاشتراك يُبتلع ويُحذف محلياً؛ وجود مسار Auth Admin فعلي لم يثبت في الملفات المفحوصة. |
| P06 | **غير محسوم من النطاق الحالي** | افصل super-admin/operator/auditor/read-only في claims وقواعد مستقلة. | وجود admin واحد في الحراسة ورد في التقرير السابق، لكن النتيجة المنظمة الحالية لا تثبت تغييراً أو bypass محدداً لهذه التوصية. |
| P07 | **مفتوح** | ثبّت UID/claim محمياً وامنع downgrade أو حذف marker من أي مدير عادي داخل القواعد/الخدمة. | حماية البريد الرئيسي في React فقط؛ `updateUserRole` وقواعد admins لا تفرض invariant مماثلاً. |
| P08 | **مفتوح** | اجعل إنشاء user self-registration محدوداً إلى حقول غير حساسة، واشتق role/status/subscription server-side. | القاعدة تسمح للمستخدم باختيار قيم entitlement فعالة وتاريخ مستقبلي. |
| P09 | **مفتوح** | طبّق `keys().hasOnly` وحقولاً مطلوبة وأنواعاً وحدوداً، وأعد احتساب order total من items الموثوقة. | قواعد orders الحالية لا تفرض schema أو supplier/product/price/qty/total invariants. |
| P10 | **مفتوح** | اجعل `platform_activity` و`priceHistory` server-only أو مشتقين من أحداث موثوقة مع server timestamp. | actorRole/type/timestamp وحقول history قابلة للحقن أو التعديل من العميل وفق القواعد الحالية. |
| P11 | **مفتوح** | ثبّت requester/payload، امنع self-review، حدّد transitions، وامنع delete العام لطلبات الاعتماد. | الحماية موجودة في الخدمة/الواجهة، لكن قواعد update/delete لا تفرضها. |
| P12 | **مفتوح** | لا تقبل recipientUids كما هي؛ استخرج المستلمين من profile الحالي وسجّل سبب الاستحقاق. | announcements service تنشئ audience/targetCount من مدخل العميل، والقواعد لا تطابق كل UID بالدور/الحالة. |
| P13 | **مفتوح** | استخدم UID في مفاتيح cart/prices/templates المحلية، وأعد hydration/clear عند logout/login. | cart key ثابت `pharma_comparison_cart_v1` ويستمر بعد logout؛ قد ينسب الطلب لحساب آخر. |
| P14 | **مفتوح** | امنع `error.message/stack` الخام في الإنتاج، واستخدم رمزاً عاماً وcorrelation ID مع redaction داخلي. | Firebase error يتضمن uid/email/provider/path، وErrorBoundary يعرض الرسالة والـstack وينسخهما. |
| P15 | **غير محسوم من النطاق الحالي** | عطّل debug overlay في production أو اربطه ببناء تطويري/feature flag مصادق عليه مع redaction. | لا توجد في النتائج المنظمة الحالية أدلة كافية لإثبات حالة الإنتاج الفعلية؛ لا أعرضه كخطر مفتوح هنا. |
| P16 | **مفتوح** | أنشئ suite v27 حقيقية تغطي inactive users, allowedSuppliers, orders, audit writes, approvals, fallback وsuper-admin، واربطها بالنشر. | test والـproject يحملان v25، وCI لا يجعل اختبارات القواعد الحالية gate لـv27 وفق الأدلة المنظمة. |

**المحصلة:** 50 اقتراحاً بالضبط: **18 للإدارة + 16 للمستودع + 16 للصلاحيات والهوية**. وسم «جزئي» أو «عولج/جزئي» لم يُستخدم إلا حيث ظهر ضابط فعلي في المصدر؛ أما «غير محسوم» فلا يعني أنه عولج، بل يعني أن النطاق الحالي لا يكفي لإعلان finding أو إصلاح.

## 6. ما ينبغي تنفيذه أولاً

1. **أولاً — إغلاق الثقة العميلية:** P01–P04 وP08–P10 وP13، ثم W03–W06 وW14، لأن الجلسة والـcache والطلب والأسعار تتداخل.
2. **ثانياً — جعل العمليات الذرية والنتائج صادقة:** A01–A04 وA12 وA15، مع rollback بعيد وidempotency ومنع success المحلي الكاذب.
3. **ثالثاً — فرض فصل الواجبات وسلامة التدقيق:** P07 وP11–P12 وW09/W11 وA04، عبر Function/مسار موثوق أو قواعد دقيقة قابلة للاختبار.
4. **رابعاً — بوابة اختبار وإعادة إنتاج:** A17/A18 وP16 وW16، مع suite باسم v27 لا v25، ثم تشغيلها في CI قبل Pages artifact.
5. **خامساً — اتساق الأسعار وتجربة الاستخدام:** A06/A09/A11 وW13/W14، ثم pagination واتجاهات التاريخ وإتاحة عناصر الإشعارات.

## 7. الخلاصة والحدود

التغييرات الحالية حسّنت الوضع في نقاط مهمة: default-deny، عزل عدة مسارات بالملكية، ضوابط الممثل، بعض تحقق الاستيراد، transaction داخل مسار مراجعة الاعتماد، ووجود حراس مسارات وUID checks. لكنها **لا تثبت إصلاح** النتائج الأعلى خطورة؛ خصوصاً fail-open للجلسة، سباق تبديل الحساب، الطلبات القابلة للتلاعب، fallback الأسعار، تجاوز الموافقة من SDK، تزوير سجل التدقيق، rollback المحلي، والكتابات الجزئية.

هذا التقرير لا يدّعي اختبار اختراق ولا يثبت صلاحيات أو نتائج شبكة فعلية. إثبات الإغلاق يتطلب تغييرات مصدرية قابلة للمراجعة، قواعد/Functions منشورة أو Emulator، اختبارات allow/deny وrace/timeout وoffline، ثم تشغيل CI فعلي على نسخة v27 المقصودة. حتى ذلك الحين، تعامل مع البنود الموسومة **مفتوح** على أنها توصيات تنفيذية قائمة، ومع **جزئي** على أنها ضوابط غير مكتملة، ومع **غير محسوم** على أنها خارج الإثبات الحالي لا كإغلاق مؤكد.
