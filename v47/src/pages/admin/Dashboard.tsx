// src/pages/admin/Dashboard.tsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getProducts,
  getSuppliers,
  getUsers,
  getOrders,
  getImportBatches,
  getSystemSettings,
  updateSystemSettings,
} from '../../services/dataStorage';
import { Product, Supplier, UserProfile, Order, ImportBatch } from '../../types';
import { formatCurrency, setSystemCurrency, getSystemCurrency } from '../../utils/formatPrice';
import { formatGregorianDate } from '../../utils/formatDate';
import { isValidPhone, cleanPhone, createWhatsAppLink } from '../../utils/phone';
import { useToastStore } from '../../store/useToastStore';
import { useAuthStore } from '../../store/useAuthStore';
import {
  Pill,
  Truck,
  Building2,
  ClipboardList,
  UploadCloud,
  Database,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  Save,
  AlertTriangle,
  Flame,
  CheckCheck,
  Coins,
  Phone,
  MessageCircle,
} from 'lucide-react';
import { Spinner } from '../../components/Loader';
import { getWarehouseLinkRequests } from '../../services/representatives';
import { WarehouseLinkRequest } from '../../types';

export const AdminDashboard: React.FC = () => {
  const { success, error } = useToastStore();
  const { defaultTrialDays, setDefaultTrialDays } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [linkRequests, setLinkRequests] = useState<WarehouseLinkRequest[]>([]);

  const [editingTrialDays, setEditingTrialDays] = useState<number>(defaultTrialDays || 7);
  const [savingTrialDays, setSavingTrialDays] = useState(false);
  const [systemCurrency, setLocalCurrency] = useState<string>(getSystemCurrency() || '₪');
  const [savingCurrency, setSavingCurrency] = useState(false);

  // إعدادا الدعم وترتيب العروض
  const [supportWhatsApp, setSupportWhatsApp] = useState<string>('966501234567');
  const [savingSupportWhatsApp, setSavingSupportWhatsApp] = useState(false);
  const [priceSortMode, setPriceSortMode] = useState<'cheapest' | 'latest' | 'random'>('cheapest');
  const [savingPriceSortMode, setSavingPriceSortMode] = useState(false);


  useEffect(() => {
    let active = true;
    void getSystemSettings().then((settings) => {
      if (!active) return;
      if (settings.defaultTrialDays) { setEditingTrialDays(settings.defaultTrialDays); setDefaultTrialDays(settings.defaultTrialDays); }
      if (settings.currency) { setLocalCurrency(settings.currency); setSystemCurrency(settings.currency); }
      if (settings.supportWhatsApp) setSupportWhatsApp(settings.supportWhatsApp);
      setPriceSortMode(settings.warehousePriceSortMode || 'cheapest');
    }).catch(() => undefined);
    return () => { active = false; };
  }, [setDefaultTrialDays]);

  // ملخص القراءة الكبيرة يحمّل فقط بعد طلب المدير، ولا يتضمن سجل الأحداث أو مجموعة الأسعار.
  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [p, s, u, o, b] = await Promise.all([getProducts(), getSuppliers(), getUsers(), getOrders(), getImportBatches()]);
      setProducts(p); setSuppliers(s); setUsers(u); setOrders(o); setBatches(b);
      const [requests] = await Promise.allSettled([getWarehouseLinkRequests()]);
      if (requests.status === 'fulfilled') setLinkRequests(requests.value);
      setSummaryLoaded(true);
    } catch (e) { console.error(e); error('تعذر تحميل ملخص الإدارة.'); }
    finally { setLoading(false); }
  };

  const handleSaveSupportWhatsApp = async () => {
    if (!isValidPhone(supportWhatsApp)) {
      error('يرجى إدخال رقم واتساب صحيح بالصيغة الدولية (8-15 رقماً بدون +).');
      return;
    }
    setSavingSupportWhatsApp(true);
    try {
      const cleaned = cleanPhone(supportWhatsApp);
      await updateSystemSettings({ supportWhatsApp: cleaned });
      setSupportWhatsApp(cleaned);
      success(`تم حفظ رقم دعم مدير المنصة (+${cleaned}).`);
    } catch (err: any) {
      error('تعذر حفظ رقم واتساب الدعم: ' + err.message);
    } finally {
      setSavingSupportWhatsApp(false);
    }
  };

  const handleSaveTrialDays = async () => {
    if (!editingTrialDays || editingTrialDays < 1 || editingTrialDays > 365) {
      error('يرجى إدخال عدد أيام صالح بين 1 و 365 يوماً.');
      return;
    }
    setSavingTrialDays(true);
    try {
      await updateSystemSettings({ defaultTrialDays: editingTrialDays });
      setDefaultTrialDays(editingTrialDays);
      success(`تم حفظ أيام التجربة الافتراضية بنجاح إلى (${editingTrialDays}) يوماً.`);
    } catch (err: any) {
      error('تعذر حفظ أيام التجربة: ' + err.message);
    } finally {
      setSavingTrialDays(false);
    }
  };

  const handleSaveCurrency = async (curr: string) => {
    setSavingCurrency(true);
    try {
      await updateSystemSettings({ currency: curr });
      setLocalCurrency(curr);
      setSystemCurrency(curr);
      success(`تم تحديث العملة الافتراضية للنظام إلى (${curr}) بنجاح.`);
    } catch (err: any) {
      error('تعذر حفظ العملة: ' + err.message);
    } finally {
      setSavingCurrency(false);
    }
  };

  const handleSavePriceSortMode = async () => {
    setSavingPriceSortMode(true);
    try { await updateSystemSettings({ warehousePriceSortMode: priceSortMode }); success('تم حفظ ترتيب عروض المستودعات.'); }
    catch (err: any) { error('تعذر حفظ ترتيب الأسعار: ' + err.message); }
    finally { setSavingPriceSortMode(false); }
  };

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const suppliersNotUpdated7Days = suppliers.filter((s) => {
    if (!s.lastPriceUpdate) return true;
    return new Date(s.lastPriceUpdate).getTime() < sevenDaysAgo;
  });

  // 3) أكثر الأصناف طلباً وبحثاً
  const productDemandMap = new Map<string, { count: number; name: string }>();
  orders.forEach((o) => {
    o.items.forEach((item) => {
      const current = productDemandMap.get(item.productId) || { count: 0, name: item.name };
      current.count += item.qty;
      productDemandMap.set(item.productId, current);
    });
  });
  const topDemandedProducts = Array.from(productDemandMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 4) نسبة الاستيراد الناجح
  const successfulImportRate = batches.length > 0
    ? Math.round((batches.reduce((sum, b) => sum + (b.rowsCount > 0 ? 1 : 0), 0) / batches.length) * 100)
    : 100;

  const activePharmacies = users.filter((u) => u.role === 'pharmacy' && u.status === 'active');
  const pendingPharmacies = users.filter((u) => u.role === 'pharmacy' && u.status === 'pending');
  const totalOrdersAmount = orders.reduce((sum, o) => sum + o.total, 0);
  const pendingOrders = orders.filter((order) => order.status === 'sent');
  const pendingRepresentativeLinks = linkRequests.filter((request) => request.status === 'pending');
  const scheduleAlerts = suppliers.filter((supplier) => {
    const hasSchedule = Object.values(supplier.deliveryDaysByArea || {}).some((days) => Array.isArray(days) && days.length > 0);
    const updatedAt = supplier.deliveryScheduleUpdatedAt ? new Date(supplier.deliveryScheduleUpdatedAt).getTime() : 0;
    return !hasSchedule || !updatedAt || updatedAt < Date.now() - 30 * 24 * 60 * 60 * 1000;
  });
  const urgentTasks = [
    { title: 'طلبات الصيدليات', count: pendingPharmacies.length, note: 'حسابات بانتظار المراجعة', to: '/admin/pharmacies' },
    { title: 'ربط المندوبين', count: pendingRepresentativeLinks.length, note: 'طلبات مستودع معلقة', to: '/admin/representatives' },
    { title: 'الطلبيات الواردة', count: pendingOrders.length, note: 'لم يبدأ تأكيدها', to: '/admin/orders' },
    { title: 'تحديث الأسعار', count: suppliersNotUpdated7Days.length, note: 'مستودعات أسعارها أقدم من 7 أيام', to: '/admin/import' },
    { title: 'جداول التوصيل', count: scheduleAlerts.length, note: 'غير محدّثة منذ 30 يومًا أو غير مهيأة', to: '/admin/suppliers' },
  ];

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <Spinner text="جاري تحميل لوحة التحكم..." />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* رأس الصفحة مع أزرار التحكم بالبيانات التجريبية */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            لوحة الإدارة الرئيسية
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            نظرة شاملة على قاعدة الأصناف، المستودعات، الصيدليات، وأحدث عمليات الاستيراد
          </p>
        </div>

        <div className="flex items-center gap-2">

          <button onClick={() => void loadDashboard()} disabled={loading} className="px-3.5 py-2 rounded-xl bg-white text-[#0f9d7a] border border-emerald-200 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50">
            {loading ? 'تحميل...' : summaryLoaded ? 'تحديث المؤشرات' : 'تحميل المؤشرات'}
          </button>
        </div>
      </div>

      {!summaryLoaded && !loading && <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-6 text-blue-900"><b className="block text-sm">لوحة خفيفة عند الفتح</b>لم تُحمّل بيانات المستخدمين والطلبات والكتالوج تلقائياً. اضغط «تحميل المؤشرات» عند الحاجة إلى الأرقام؛ أما إعدادات الدعم وترتيب العروض فتعمل دون قراءة مجموعات الأسعار.</section>}

      {/* تنبيه الصيدليات المعلقة إن وُجدت */}
      {summaryLoaded && pendingPharmacies.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800 font-semibold">
              يوجد <strong className="text-amber-900 font-bold">{pendingPharmacies.length}</strong> صيدليات مسجلة جديدة بانتظار المراجعة والتفعيل.
            </p>
          </div>
          <Link
            to="/admin/pharmacies"
            className="px-3 py-1.5 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition shrink-0"
          >
            مراجعة الطلبات
          </Link>
        </div>
      )}

      {summaryLoaded && (
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-base font-black text-slate-900">مركز المهام العاجلة</h2><p className="mt-1 text-xs text-slate-500">افتح المهمة مباشرةً من البطاقة، وراجع مصدر الرقم في الصفحة المرتبطة.</p></div>
          <Link to="/admin/audit-log" className="text-xs font-bold text-teal-700">سجل التدقيق والتصدير ←</Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {urgentTasks.map((task) => <Link key={task.title} to={task.to} className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${task.count ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-slate-50/70'}`}>
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-slate-800">{task.title}</span><strong className={`text-xl ${task.count ? 'text-amber-700' : 'text-slate-400'}`}>{task.count}</strong></div>
            <p className="mt-2 text-[11px] text-slate-600">{task.note}</p>
          </Link>)}
        </div>
      </section>

      )}

      {/* بطاقة إعدادات الفترة التجريبية والعملة */}
      <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-white p-5 rounded-3xl border border-blue-200/90 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-black text-slate-900 text-sm sm:text-base">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Clock className="w-4 h-4" />
              </div>
              <span>أيام الفترة التجريبية للصيدليات الجديدة:</span>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-black">
                {defaultTrialDays || 7} أيام
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
              تحديد عدد الأيام الممنوحة مجاناً وتلقائياً لكل صيدلية جديدة عند تسجيل الدخول الأول بالمنصة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
              {[3, 7, 14, 21, 30, 60].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setEditingTrialDays(d)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                    editingTrialDays === d
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {d} يوماً
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                max="365"
                value={editingTrialDays}
                onChange={(e) => setEditingTrialDays(Math.max(1, Number(e.target.value)))}
                className="w-20 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-black text-center focus:outline-hidden focus:border-blue-500 font-mono"
              />
              <span className="text-xs font-bold text-slate-600">يوماً</span>
            </div>

            <button
              type="button"
              onClick={handleSaveTrialDays}
              disabled={savingTrialDays || editingTrialDays === defaultTrialDays}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingTrialDays ? 'جاري الحفظ...' : 'حفظ التعديل'}</span>
            </button>
          </div>
        </div>

        {/* إعداد العملة الافتراضية للنظام */}
        <div className="mt-4 pt-4 border-t border-blue-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold text-slate-800">العملة الافتراضية لعرض الأسعار بالنظام:</span>
            <span className="text-xs text-slate-500 font-mono font-bold">({systemCurrency})</span>
          </div>

          <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            {[
              { code: 'ILS', symbol: '₪', label: 'الشيكل ₪' },
              { code: 'USD', symbol: '$', label: 'الدولار $' },
              { code: 'ILS', symbol: '₪', label: 'الشيكل ₪' },
            ].map((c) => (
              <button
                key={c.symbol}
                type="button"
                onClick={() => handleSaveCurrency(c.symbol)}
                disabled={savingCurrency}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                  systemCurrency === c.symbol
                    ? 'bg-[#0f9d7a] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* رقم دعم مدير المنصة */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><MessageCircle className="h-5 w-5" /></span><div><h2 className="text-sm font-black text-slate-900">رقم دعم مدير المنصة</h2><p className="mt-1 text-[11px] text-slate-500">يظهر للصيدليات في بطاقة الدعم، ويمكن تغييره من هنا.</p></div></div>
          <div className="mt-4 flex flex-wrap gap-2"><input type="tel" value={supportWhatsApp} onChange={(event) => setSupportWhatsApp(event.target.value)} placeholder="970599999999" dir="ltr" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono" /><a href={createWhatsAppLink(supportWhatsApp, 'مرحباً، هذه رسالة لفحص رقم دعم مدير المنصة')} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-emerald-700" aria-label="اختبار رقم الدعم"><Phone className="h-4 w-4" /></a><button onClick={handleSaveSupportWhatsApp} disabled={savingSupportWhatsApp} className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Save className="ml-1 inline h-4 w-4" />{savingSupportWhatsApp ? 'حفظ...' : 'حفظ الرقم'}</button></div>
          <p className="mt-2 text-[10px] text-slate-400">صيغة دولية من 8 إلى 15 رقماً دون مسافات أو علامة +.</p>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Truck className="h-5 w-5" /></span><div><h2 className="text-sm font-black text-slate-900">ترتيب عروض المستودعات للصنف</h2><p className="mt-1 text-[11px] text-slate-500">الإعداد يحدد ترتيب العروض دون إضافة أي قراءات للأسعار.</p></div></div>
          <div className="mt-4 flex flex-wrap gap-2"><select value={priceSortMode} onChange={(event) => setPriceSortMode(event.target.value as 'cheapest' | 'latest' | 'random')} className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"><option value="cheapest">الأرخص أولاً</option><option value="latest">الأحدث تحديثاً</option><option value="random">عشوائي</option></select><button onClick={() => void handleSavePriceSortMode()} disabled={savingPriceSortMode} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{savingPriceSortMode ? 'حفظ...' : 'حفظ الترتيب'}</button></div>
        </section>
      </div>

      {/* قسم مؤشرات الجودة والرقابة (KPI Analytics) */}
      {summaryLoaded && (
      <div className="space-y-3">
        <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <span>مؤشرات الجودة والرقابة على الأسعار والمستودعات</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* مستودعات لم تحدث منذ 7 أيام */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">مستودعات راكدة (&gt; 7 أيام)</span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-rose-600 font-mono">
                {suppliersNotUpdated7Days.length}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                من إجمالي {suppliers.length} مستودع
              </span>
            </div>
          </div>

          {/* نسبة الاستيراد الناجح */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">نسبة الاستيراد الناجح</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#0f9d7a] flex items-center justify-center">
                <CheckCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-emerald-600 font-mono">
                {successfulImportRate}%
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                عبر {batches.length} دفعات استيراد
              </span>
            </div>
          </div>

          {/* أكثر الأصناف طلباً */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">أكثر الأصناف طلباً</span>
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <Flame className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              {topDemandedProducts.length > 0 ? (
                <div className="text-xs font-bold text-slate-800 truncate">
                  {topDemandedProducts[0].name} ({topDemandedProducts[0].count} وحدة)
                </div>
              ) : (
                <span className="text-xs text-slate-400">لا توجد طلبيات بعد</span>
              )}
              <span className="text-[11px] text-slate-400 block mt-0.5">
                بناءً على طلبات الصيدليات
              </span>
            </div>
          </div>
        </div>
      </div>

      )}

      {/* بطاقات الإحصاءات الأربع */}
      {summaryLoaded && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* الأصناف الدوائية */}
        <Link
          to="/admin/products"
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-[#0f9d7a]/50 transition group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">إجمالي الأصناف التجارية</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#0f9d7a] flex items-center justify-center group-hover:scale-105 transition">
              <Pill className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{products.length}</span>
            <span className="text-[11px] text-[#0f9d7a] font-bold flex items-center gap-0.5">
              <span>عرض الأصناف</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </Link>

        {/* الموردون */}
        <Link
          to="/admin/suppliers"
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-[#0f9d7a]/50 transition group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">الموردون والمستودعات</span>
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center group-hover:scale-105 transition">
              <Truck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{suppliers.length}</span>
            <span className="text-[11px] text-teal-600 font-bold flex items-center gap-0.5">
              <span>إدارة الموردين</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </Link>

        {/* الصيدليات النشطة */}
        <Link
          to="/admin/pharmacies"
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-[#0f9d7a]/50 transition group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">الصيدليات المفعلة</span>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-105 transition">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{activePharmacies.length}</span>
            <span className="text-[11px] text-purple-600 font-bold flex items-center gap-0.5">
              <span>إدارة المشتركين</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </Link>

        {/* الطلبيات */}
        <Link
          to="/admin/orders"
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-[#0f9d7a]/50 transition group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">الطلبيات هذا الشهر</span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition">
              <ClipboardList className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{orders.length}</span>
            <span className="text-[11px] text-amber-600 font-bold flex items-center gap-0.5">
              <span>{formatCurrency(totalOrdersAmount)}</span>
            </span>
          </div>
        </Link>
      </div>

      )}

      {/* اختصار سريع لأهم عملية: رفع أسعار مورد */}
      <div className="p-6 bg-linear-to-l from-[#0f9d7a]/10 via-emerald-50/50 to-white rounded-3xl border border-emerald-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#0f9d7a] text-white flex items-center justify-center shadow-sm">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              رفع وتحديث أسعار المستودعات (Excel / صور / نص)
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              مطابقة تقريبية بالذكاء الاصطناعي و Fuse.js، مع ربط الأعمدة والتراجع عن الدفعات
            </p>
          </div>
        </div>

        <Link
          to="/admin/import"
          className="px-5 py-2.5 bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 flex items-center gap-2"
        >
          <UploadCloud className="w-4 h-4" />
          <span>بدء استيراد جديد</span>
        </Link>
      </div>

      {/* قسمان متجاوران: أحدث الاستيرادات وآخر الطلبيات */}
      {summaryLoaded && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* أحدث الاستيرادات */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-[#0f9d7a]" />
              <span>آخر دفعات استيراد الأسعار</span>
            </h3>
            <Link to="/admin/import" className="text-xs text-[#0f9d7a] hover:underline font-bold">
              سجل الاستيراد
            </Link>
          </div>

          {batches.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              لا توجد دفعات استيراد سابقة مسجلة
            </div>
          ) : (
            <div className="space-y-3">
              {batches.slice(0, 5).map((batch) => {
                const sup = suppliers.find((s) => s.id === batch.supplierId);
                return (
                  <div
                    key={batch.id}
                    className="p-3 bg-slate-50/80 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-800">{sup?.name || 'مستودع غير معروف'}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>الملف: {batch.fileName}</span>
                        <span>•</span>
                        <span>{batch.rowsCount} صنفاً</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {formatGregorianDate(batch.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* آخر الطلبيات الواردة */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-amber-500" />
              <span>أحدث الطلبيات المستلمة</span>
            </h3>
            <Link to="/admin/orders" className="text-xs text-[#0f9d7a] hover:underline font-bold">
              عرض كل الطلبات
            </Link>
          </div>

          {orders.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              لا توجد طلبيات مسجلة حتى الآن
            </div>
          ) : (
            <div className="space-y-3">
              {orders.slice(0, 5).map((order) => (
                <div
                  key={order.id}
                  className="p-3 bg-slate-50/80 rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-800">{order.pharmacyName}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>إلى: {order.supplierName}</span>
                      <span>•</span>
                      <span>{order.items.length} بنود</span>
                    </div>
                  </div>
                  <div className="text-left">
                    <span className="font-black text-slate-900 block">
                      {formatCurrency(order.total)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatGregorianDate(order.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      )}
    </div>
  );
};
