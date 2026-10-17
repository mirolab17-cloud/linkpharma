// src/pages/admin/Dashboard.tsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getProducts,
  getSuppliers,
  getUsers,
  getOrders,
  getImportBatches,
  getPrices,
  seedDatabase,
  clearDatabase,
  getSystemSettings,
  updateSystemSettings,
  saveSupplier
} from '../../services/dataStorage';
import { Product, Supplier, UserProfile, Order, ImportBatch, PriceRecord } from '../../types';
import { formatCurrency, setSystemCurrency, getSystemCurrency } from '../../utils/formatPrice';
import { formatGregorianDate } from '../../utils/formatDate';
import { isValidPhone, cleanPhone, createWhatsAppLink, formatPhoneNumber } from '../../utils/phone';
import { useToastStore } from '../../store/useToastStore';
import { useAuthStore } from '../../store/useAuthStore';
import {
  Pill,
  Truck,
  Building2,
  ClipboardList,
  UploadCloud,
  Database,
  Sparkles,
  Trash2,
  ArrowUpRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  Megaphone,
  Save,
  AlertTriangle,
  Flame,
  CheckCheck,
  Coins,
  Phone,
  MessageCircle,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Spinner } from '../../components/Loader';
import { SendAnnouncementModal } from '../../components/SendAnnouncementModal';

export const AdminDashboard: React.FC = () => {
  const { success, error } = useToastStore();
  const { defaultTrialDays, setDefaultTrialDays } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [prices, setPrices] = useState<PriceRecord[]>([]);

  const [editingTrialDays, setEditingTrialDays] = useState<number>(defaultTrialDays || 7);
  const [savingTrialDays, setSavingTrialDays] = useState(false);
  const [systemCurrency, setLocalCurrency] = useState<string>(getSystemCurrency() || '₪');
  const [savingCurrency, setSavingCurrency] = useState(false);

  // أرقام واتساب الدعم الفني والمستودعات
  const [supportWhatsApp, setSupportWhatsApp] = useState<string>('966501234567');
  const [savingSupportWhatsApp, setSavingSupportWhatsApp] = useState(false);
  const [warehouseSupportWhatsApp, setWarehouseSupportWhatsApp] = useState<string>('966552223344');
  const [savingWarehouseSupportWhatsApp, setSavingWarehouseSupportWhatsApp] = useState(false);
  const [supplierPhones, setSupplierPhones] = useState<Record<string, string>>({});
  const [savingSupplierId, setSavingSupplierId] = useState<string | null>(null);

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [p, s, u, o, b, prs, settings] = await Promise.all([
        getProducts(),
        getSuppliers(),
        getUsers(),
        getOrders(),
        getImportBatches(),
        getPrices(),
        getSystemSettings(),
      ]);
      setProducts(p);
      setSuppliers(s);
      setUsers(u);
      setOrders(o);
      setBatches(b);
      setPrices(prs);
      if (settings?.defaultTrialDays) {
        setEditingTrialDays(settings.defaultTrialDays);
        setDefaultTrialDays(settings.defaultTrialDays);
      }
      if (settings?.currency) {
        setLocalCurrency(settings.currency);
        setSystemCurrency(settings.currency);
      }
      if (settings?.supportWhatsApp) {
        setSupportWhatsApp(settings.supportWhatsApp);
      }
      if (settings?.warehouseSupportWhatsApp) {
        setWarehouseSupportWhatsApp(settings.warehouseSupportWhatsApp);
      }
      const sMap: Record<string, string> = {};
      s.forEach((sup) => {
        sMap[sup.id] = sup.whatsapp;
      });
      setSupplierPhones(sMap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
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
      success(`تم حفظ رقم واتساب الدعم الفني ومدير المنصة بنجاح (+${cleaned}).`);
    } catch (err: any) {
      error('تعذر حفظ رقم واتساب الدعم: ' + err.message);
    } finally {
      setSavingSupportWhatsApp(false);
    }
  };

  const handleSaveWarehouseSupportWhatsApp = async () => {
    if (!isValidPhone(warehouseSupportWhatsApp)) {
      error('يرجى إدخال رقم واتساب صحيح بالصيغة الدولية (8-15 رقماً بدون +).');
      return;
    }
    setSavingWarehouseSupportWhatsApp(true);
    try {
      const cleaned = cleanPhone(warehouseSupportWhatsApp);
      await updateSystemSettings({ warehouseSupportWhatsApp: cleaned });
      setWarehouseSupportWhatsApp(cleaned);
      success(`تم حفظ رقم واتساب دعم المستودعات وتنسيق الطلبيات بنجاح (+${cleaned}).`);
    } catch (err: any) {
      error('تعذر حفظ رقم واتساب دعم المستودعات: ' + err.message);
    } finally {
      setSavingWarehouseSupportWhatsApp(false);
    }
  };

  const handleSaveSupplierWhatsApp = async (supplierId: string) => {
    const rawPhone = supplierPhones[supplierId];
    if (!rawPhone || !isValidPhone(rawPhone)) {
      error('يرجى إدخال رقم واتساب صالح للمستودع (8-15 رقماً بالصيغة الدولية).');
      return;
    }
    const targetSup = suppliers.find((s) => s.id === supplierId);
    if (!targetSup) return;

    setSavingSupplierId(supplierId);
    try {
      const cleaned = cleanPhone(rawPhone);
      await saveSupplier({
        ...targetSup,
        whatsapp: cleaned,
      });
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supplierId ? { ...s, whatsapp: cleaned } : s))
      );
      success(`تم تحديث رقم واتساب مستودع (${targetSup.name}) إلى (+${cleaned}) بنجاح.`);
    } catch (err: any) {
      error('تعذر تحديث رقم المستودع: ' + err.message);
    } finally {
      setSavingSupplierId(null);
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

  const handleSeed = async () => {
    setActionLoading(true);
    try {
      await seedDatabase();
      success('تمت إضافة البيانات التجريبية بنجاح (10 مواد فعالة، 30 صنفاً، 3 موردين، وأسعار متعددة).');
      await loadDashboard();
    } catch (e: any) {
      error('فشل إدخال البيانات التجريبية: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClear = async () => {
    setActionLoading(true);
    try {
      await clearDatabase();
      setConfirmClearOpen(false);
      success('تم مسح البيانات التجريبية بنجاح.');
      await loadDashboard();
    } catch (e: any) {
      error('فشل المسح: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ======================= حساب الإحصاءات والتحليلات المطلوبة =======================
  // 1) أصناف بلا أسعار
  const pricedProductIds = new Set(prices.map((p) => p.productId));
  const productsWithoutPrices = products.filter((p) => !pricedProductIds.has(p.id));

  // 2) مستودعات لم تُحدَّث منذ 7 أيام
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
          <button
            onClick={() => setAnnouncementModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-[#0f9d7a] border border-slate-200 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs active:scale-95"
            title="إرسال تعميم فوري أو تحديث هام لجميع الصيدليات"
          >
            <Megaphone className="w-4 h-4" />
            <span>إرسال تعميم للصيدليات</span>
          </button>

          <button
            onClick={handleSeed}
            disabled={actionLoading}
            className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100/80 text-[#0f9d7a] border border-emerald-200 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs active:scale-95 disabled:opacity-50"
            title="إضافة 10 مواد فعالة و30 صنفاً و3 موردين مع أسعارها للمعاينة الفورية"
          >
            <Sparkles className="w-4 h-4" />
            <span>إضافة بيانات تجريبية (Seed)</span>
          </button>

          <button
            onClick={() => setConfirmClearOpen(true)}
            disabled={actionLoading}
            className="p-2 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-200 text-xs font-bold transition shadow-2xs active:scale-95 disabled:opacity-50"
            title="مسح كل البيانات"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* تنبيه الصيدليات المعلقة إن وُجدت */}
      {pendingPharmacies.length > 0 && (
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

      {/* بطاقة مخصصة: إدارة أرقام واتساب الدعم الفني والمستودعات */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-emerald-200/90 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shadow-xs">
              <MessageCircle className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span>أرقام واتساب الدعم الفني والمستودعات</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                  إعدادات حية
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تعديل رقم واتساب المدير لتلقي طلبات الاشتراك والتفعيل، وتحديث أرقام كل مستودع
              </p>
            </div>
          </div>

          <Link
            to="/admin/suppliers"
            className="self-start sm:self-auto text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 border border-emerald-200"
          >
            <span>دليل المستودعات الكامل</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* قسم رقمي الدعم الفني: المدير والمستودعات */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 1. رقم واتساب مدير المنصة والدعم الفني */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>رقم واتساب المدير والدعم الفني المعتمد</span>
                </span>
                <span className="text-[11px] font-mono text-emerald-700 font-bold" dir="ltr">
                  +{supportWhatsApp}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                يظهر للصيدليات في شاشة انتهاء الاشتراك لتجديد الباقات، وعند انتظار تفعيل الحساب، وفي بطاقة الدعم بالملف الشخصي.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="tel"
                    value={supportWhatsApp}
                    onChange={(e) => setSupportWhatsApp(e.target.value)}
                    placeholder="966501234567"
                    dir="ltr"
                    className="w-full px-3 py-2 text-xs font-bold font-mono bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:border-emerald-600"
                  />
                </div>

                <a
                  href={createWhatsAppLink(supportWhatsApp, 'مرحباً، هذه رسالة تجريبية لفحص رقم دعم المدير والمنصة')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition"
                  title="فتح محادثة تجريبية على واتساب"
                >
                  <MessageCircle className="w-4 h-4" />
                </a>

                <button
                  type="button"
                  onClick={handleSaveSupportWhatsApp}
                  disabled={savingSupportWhatsApp}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50 active:scale-95 shadow-2xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingSupportWhatsApp ? 'حفظ...' : 'حفظ الرقم'}</span>
                </button>
              </div>
              <div className="text-[10px] text-slate-400">
                الصيغة الدولية للأرقام بدون مسافات أو علامة + (مثال: 966501234567 أو 972591234567)
              </div>
            </div>
          </div>

        </div>

        {/* قسم أرقام واتساب المستودعات المسجلة مع تعديل فوري */}
        <div className="pt-2 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#0f9d7a]" />
              <span>أرقام واتساب المستودعات المسجلة (تعديل وحفظ فوري)</span>
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              إجمالي {suppliers.length} مستودع
            </span>
          </div>

          {suppliers.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl">
              لا توجد مستودعات مسجلة حالياً
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {suppliers.map((sup) => {
                const currentVal = supplierPhones[sup.id] ?? sup.whatsapp;
                const hasChanged = currentVal !== sup.whatsapp;
                const isSavingThis = savingSupplierId === sup.id;

                return (
                  <div
                    key={sup.id}
                    className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 flex flex-col justify-between hover:border-slate-300 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-extrabold text-xs text-slate-800 truncate" title={sup.name}>
                        {sup.name}
                      </div>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          sup.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {sup.status === 'active' ? 'نشط' : 'متوقف'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="tel"
                        value={currentVal}
                        onChange={(e) =>
                          setSupplierPhones((prev) => ({ ...prev, [sup.id]: e.target.value }))
                        }
                        placeholder="966501234567"
                        dir="ltr"
                        className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:border-[#0f9d7a]"
                      />

                      <a
                        href={createWhatsAppLink(currentVal, `السلام عليكم مستودع ${sup.name}، رسالة تجريبية من إدارة المنصة.`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition shrink-0"
                        title="تجربة الرقم على واتساب"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </a>

                      <button
                        type="button"
                        onClick={() => handleSaveSupplierWhatsApp(sup.id)}
                        disabled={isSavingThis || !hasChanged}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 ${
                          hasChanged
                            ? 'bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white shadow-2xs'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                        title="حفظ رقم الواتساب"
                      >
                        <Save className="w-3 h-3" />
                        <span>{isSavingThis ? '...' : 'حفظ'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* قسم مؤشرات الجودة والرقابة (KPI Analytics) */}
      <div className="space-y-3">
        <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <span>مؤشرات الجودة والرقابة على الأسعار والمستودعات</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1) أصناف بلا أسعار */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">أصناف بدون أي أسعار</span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-slate-900 font-mono">
                {productsWithoutPrices.length}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                من إجمالي {products.length} صنف مسجل
              </span>
            </div>
          </div>

          {/* 2) مستودعات لم تحدث منذ 7 أيام */}
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

          {/* 3) نسبة الاستيراد الناجح */}
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

          {/* 4) أكثر الأصناف طلباً وبحثاً */}
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

      {/* بطاقات الإحصاءات الأربع */}
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

      {/* نافذة إرسال التعميم للصيدليات */}
      <SendAnnouncementModal
        isOpen={announcementModalOpen}
        onClose={() => setAnnouncementModalOpen(false)}
        defaultRecipientId="all"
        pharmacies={users}
      />

      {/* نافذة تأكيد مسح البيانات */}
      <ConfirmDialog
        isOpen={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={handleClear}
        title="مسح كل البيانات"
        message="هل أنت متأكد من رغبتك في تفريغ قاعدة البيانات بالكامل؟ يمكنك استعادة البيانات التجريبية لاحقاً بضغطة زر."
        confirmText="نعم، مسح الكل"
      />
    </div>
  );
};
