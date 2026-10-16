import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('v21');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, value) => fs.writeFileSync(path.join(root, p), value, 'utf8');
const replaceOnce = (source, before, after, label) => {
  if (!source.includes(before)) throw new Error('V21 patch could not find: ' + label);
  return source.replace(before, after);
};

// Brand and PWA metadata are isolated to V21.
let html = read('index.html');
html = html.replaceAll('فارما لينك v15 | منصة الصيدليات والموردين', 'LinkPharma | حلقة الوصل الذكية بين الصيدليات والمستودعات')
  .replaceAll('منصة مقارنة أسعار الأدوية بين المستودعات وإرسال طلبيات الصيدليات عبر واتساب', 'منصة رقمية تجمع عروض التوريد ومعلومات الأصناف للصيدليات والمستودعات في تجربة أكثر وضوحًا وشفافية')
  .replaceAll('مقارنة أسعار الأدوية', 'LinkPharma | الصيدليات والمستودعات')
  .replaceAll('أسعار الأدوية', 'LinkPharma');
write('index.html', html);

let vite = read('vite.config.ts');
vite = vite.replaceAll('/linkpharma/v19/', '/linkpharma/v21/')
  .replace('description: \'منصة فارما لينك بين المستودعات وإرسال طلبيات الصيدليات عبر واتساب\'', 'description: \'حلقة الوصل الذكية بين الصيدليات والمستودعات\'');
write('vite.config.ts', vite);

let hero = read('src/components/SplashHero.tsx');
hero = replaceOnce(hero, '<span>منصة توريد وفارما لينك الأولى للصيدليات</span>', '<span>حلقة الوصل الذكية بين الصيدليات والمستودعات</span>', 'hero brand label');
hero = replaceOnce(hero, 'وفّر آلاف الدنانير شهرياً في مشتريات صيدليتك بضغطة زر واحدة', 'صيدلية أقرب لاحتياجاتها. ومستودع أقرب لعملائه.', 'hero headline');
hero = replaceOnce(hero, 'منظومة سحابية متقدمة تفحص أسعار وبونص كافة مستودعات الأدوية لحظياً، تكشف الفروقات السعرية، وتولد طلبيات الشراء المقسمة على الأرخص فوراً.', 'منصة رقمية تجمع عروض التوريد ومعلومات الأصناف في تجربة أكثر وضوحًا وشفافية. تساعد الصيدليات على مقارنة الخيارات المتاحة، وتمنح المستودعات مساحة لعرض عروضها والوصول إلى عملاء محتملين.', 'hero description');
hero = hero.replaceAll('محاكاة مباشرة لمنظومة المقارنة الفورية', 'عرض توضيحي لطريقة عمل المنصة — البيانات المعروضة تجريبية')
  .replaceAll('رادار كشف الأسعار بين المستودعات', 'استكشاف عروض التوريد المتاحة')
  .replaceAll('مسح فوري لأكثر من 50 مستودع أدوية معتمد لتحديد السعر الأقل بدقة سنتيمترية.', 'استعرض معلومات الأصناف والعروض المتاحة، وقارن الخيارات المتوفرة حسب احتياجاتك.')
  .replaceAll('السلة الموزعة الذكية تلقائياً', 'تنظيم احتياجات التوريد')
  .replaceAll('تجميع نواقص الصيدلية بضغطة زر واحدة وتوزيع كل دواء على مستودعه الأرخص.', 'يساعد التنظيم الواضح للأصناف على تسهيل مراجعة الاحتياجات وعروض المستودعات.')
  .replaceAll('وفرت الصيدلية 24% في هذا الصنف', 'مثال توضيحي للمقارنة بين عرضين')
  .replaceAll('حاسبة توفير الصيدلية', 'مؤشر احتياجات التوريد');
write('src/components/SplashHero.tsx', hero);

let login = read('src/pages/auth/Login.tsx');
login = login.replaceAll('بوابة الصيدلية الموحدة', 'بوابة LinkPharma')
  .replaceAll('فارما لينك لتوريد الأدوية بين كافة المستودعات المعتمدة', 'حلقة الوصل الذكية بين الصيدليات والمستودعات')
  .replaceAll('قارن الأسعار فوراً واكشف أفضل بونص', 'خيارات أوضح للصيدليات وفرص وصول أوسع للمستودعات')
  .replaceAll('وصول مباشر وفوري لكافة عروض مستودعات الأدوية المعتمدة، مقارنة حية لأرخص الأسعار، وتوليد طلبياتك المجمعة عبر واتساب بضغطة زر واحدة.', 'منصة تجمع معلومات الأصناف وعروض التوريد في تجربة أكثر وضوحًا وشفافية. الصيدلية تقارن الخيارات المتاحة، والمستودع يعرض عروضه، وقرار الاختيار يبقى للطرف الذي يشتري.')
  .replaceAll('هوك القيمة المضافة لصيدليتك', 'رسالة القيمة المشتركة');
write('src/pages/auth/Login.tsx', login);

// Admin-managed subscription plans. The settings document is shared through the existing Firebase data layer.
let control = read('src/pages/admin/ControlCenter.tsx');
control = replaceOnce(control,
  "  const [showDeliveryDays, setShowDeliveryDays] = useState(true);",
  "  const [showDeliveryDays, setShowDeliveryDays] = useState(true);\n  const [subscriptionPlans, setSubscriptionPlans] = useState<any[]>([]);\n  const [savingPlans, setSavingPlans] = useState(false);",
  'admin plan state');
control = replaceOnce(control,
  "setShowDeliveryDays(st.showDeliveryDays !== false);",
  "setShowDeliveryDays(st.showDeliveryDays !== false); setSubscriptionPlans(Array.isArray(st.subscriptionPlans) ? st.subscriptionPlans : []);",
  'admin plan loading');
control = replaceOnce(control,
  "  const backup = () => {",
  "  const addPlan = () => setSubscriptionPlans(prev => [...prev, { id: 'plan_' + Date.now(), name: 'باقة جديدة', period: 'شهريًا', price: '', active: true, features: [] }]);\n  const updatePlan = (id: string, patch: Record<string, any>) => setSubscriptionPlans(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));\n  const removePlan = (id: string) => setSubscriptionPlans(prev => prev.filter(p => p.id !== id));\n  const savePlans = async () => { if (subscriptionPlans.some(p => !String(p.name || '').trim() || !String(p.price || '').trim())) { error('أكمل اسم كل باقة وسعرها قبل الحفظ'); return; } setSavingPlans(true); try { const normalized = subscriptionPlans.map(p => ({ ...p, id: String(p.id || ('plan_' + Date.now())), name: String(p.name).trim(), period: String(p.period || 'حسب الباقة'), price: String(p.price).trim(), active: p.active !== false, features: Array.isArray(p.features) ? p.features : String(p.features || '').split(/[،,\\\\n]/).map((x: string) => x.trim()).filter(Boolean) })); const next = await updateSystemSettings({ subscriptionPlans: normalized }); setSettings(next); setSubscriptionPlans(normalized); success('تم حفظ الباقات التي ستظهر بعد انتهاء التجربة'); } catch (e: any) { error('تعذر حفظ الباقات: ' + (e?.message || 'خطأ غير معروف')); } finally { setSavingPlans(false); } };\n  const backup = () => {",
  'admin plan handlers');
control = replaceOnce(control,
  "const tabs = [['overview','نظرة عامة'],['pharmacies','الصيدليات'],['products','الأسعار والمنتجات'],['suppliers','الموردون والمندوبون'],['settings','المواقع والنسخ']];",
  "const tabs = [['overview','نظرة عامة'],['pharmacies','الصيدليات'],['products','الأسعار والمنتجات'],['suppliers','الموردون والمندوبون'],['plans','الباقات والتجربة'],['settings','المواقع والنسخ']];",
  'admin plan tab');
control = replaceOnce(control,
  "    {tab === 'settings' && <div className=\"grid lg:grid-cols-2 gap-4\">",
  "    {tab === 'plans' && <section className={box}><div className=\"flex flex-col sm:flex-row sm:items-center justify-between gap-3\"><div><h2 className=\"font-black text-lg\">الباقات وفترة التجربة</h2><p className=\"text-xs text-slate-500 mt-1\">أضف باقة أو عدّلها أو عطّلها. الباقات النشطة فقط تظهر للمستخدم بعد انتهاء الفترة التجريبية.</p></div><button onClick={addPlan} className=\"px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-bold\">+ إضافة باقة</button></div><div className=\"mt-4 space-y-3\">{subscriptionPlans.length === 0 && <div className=\"rounded-xl border border-dashed p-5 text-sm text-slate-500 text-center\">لا توجد باقات مخصصة بعد. أضف الباقة الأولى وحدد السعر والمدة والمزايا.</div>}{subscriptionPlans.map((plan, index) => <div key={plan.id || index} className=\"rounded-2xl border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-2 gap-3\"><div><label className=\"block text-xs font-bold mb-1\">اسم الباقة</label><input value={plan.name || ''} onChange={e=>updatePlan(plan.id, {name:e.target.value})} placeholder=\"مثال: الباقة الشهرية\" className=\"w-full rounded-xl border px-3 py-2 text-sm\"/></div><div><label className=\"block text-xs font-bold mb-1\">السعر والعملة</label><input value={plan.price || ''} onChange={e=>updatePlan(plan.id, {price:e.target.value})} placeholder=\"مثال: 100 ₪ أو مجاني\" className=\"w-full rounded-xl border px-3 py-2 text-sm\"/></div><div><label className=\"block text-xs font-bold mb-1\">مدة الباقة</label><input value={plan.period || ''} onChange={e=>updatePlan(plan.id, {period:e.target.value})} placeholder=\"شهريًا / 3 أشهر / سنويًا\" className=\"w-full rounded-xl border px-3 py-2 text-sm\"/></div><div><label className=\"block text-xs font-bold mb-1\">المزايا (افصل بينها بفاصلة)</label><input value={Array.isArray(plan.features) ? plan.features.join('، ') : (plan.features || '')} onChange={e=>updatePlan(plan.id, {features:e.target.value.split(/[،,]/).map((x:string)=>x.trim()).filter(Boolean)})} placeholder=\"مقارنة العروض، دعم فني...\" className=\"w-full rounded-xl border px-3 py-2 text-sm\"/></div><div className=\"flex items-center justify-between md:col-span-2\"><label className=\"flex items-center gap-2 text-xs font-bold\"><input type=\"checkbox\" checked={plan.active !== false} onChange={e=>updatePlan(plan.id, {active:e.target.checked})}/> باقة منشورة للمستخدمين</label><button onClick={()=>removePlan(plan.id)} className=\"px-3 py-2 rounded-lg border border-rose-200 text-rose-700 text-xs font-bold\">حذف الباقة</button></div></div>)}</div><div className=\"mt-4 flex flex-col sm:flex-row gap-3\"><button disabled={savingPlans} onClick={savePlans} className=\"px-5 py-3 rounded-xl bg-emerald-700 text-white text-sm font-bold disabled:opacity-50\">{savingPlans ? 'جارٍ الحفظ...' : 'حفظ الباقات'}</button><p className=\"text-xs text-slate-500 self-center\">الحفظ يحدّث إعدادات المنصة السحابية ولا يحتاج تعديل الكود.</p></div></section>}\n    {tab === 'settings' && <div className=\"grid lg:grid-cols-2 gap-4\">",
  'admin plan UI');
write('src/pages/admin/ControlCenter.tsx', control);

// The expiry screen reads plans configured by the administrator, retaining existing defaults until plans are saved.
let expired = read('src/components/SubscriptionExpiredScreen.tsx');
expired = replaceOnce(expired,
  "  const [selectedPlanId, setSelectedPlanId] = useState<string>('quarterly');",
  "  const [selectedPlanId, setSelectedPlanId] = useState<string>('quarterly');\n  const [managedPlans, setManagedPlans] = useState<Plan[] | null>(null);",
  'expiry managed plans state');
expired = replaceOnce(expired,
  "        if (sysSettings?.supportWhatsApp) {",
  "        if (Array.isArray(sysSettings?.subscriptionPlans)) setManagedPlans(sysSettings.subscriptionPlans.filter((p: any) => p && p.active !== false && p.name && p.price).map((p: any) => ({ ...p, features: Array.isArray(p.features) ? p.features : [] })) as Plan[]);\n        if (sysSettings?.supportWhatsApp) {",
  'expiry load plans');
expired = replaceOnce(expired,
  "  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[1];",
  "  const visiblePlans = managedPlans === null ? plans : managedPlans;\n  const selectedPlan = visiblePlans.find((p) => p.id === selectedPlanId) || visiblePlans[0] || plans[1];",
  'expiry selected plan');
expired = expired.replace("{plans.map((plan) => (", "{visiblePlans.map((plan) => (");
expired = expired.replaceAll('خطط الاشتراك', 'الباقات المتاحة');
expired = expired.replace('const plans: Plan[] = [', 'const plans: Plan[] = [');
write('src/components/SubscriptionExpiredScreen.tsx', expired);

console.log('Prepared V21 branding and admin-managed subscription plans.');
