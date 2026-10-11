// src/pages/admin/Dashboard.tsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  getProducts, 
  getSuppliers, 
  getUsers, 
  getOrders, 
  getImportBatches,
  seedDatabase,
  clearDatabase,
  getSystemSettings,
  updateSystemSettings
} from '../../services/dataStorage';
import { Product, Supplier, UserProfile, Order, ImportBatch } from '../../types';
import { formatCurrency } from '../../utils/formatPrice';
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
  Save
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

  const [editingTrialDays, setEditingTrialDays] = useState<number>(defaultTrialDays || 7);
  const [savingTrialDays, setSavingTrialDays] = useState(false);

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [p, s, u, o, b, settings] = await Promise.all([
        getProducts(),
        getSuppliers(),
        getUsers(),
        getOrders(),
        getImportBatches(),
        getSystemSettings(),
      ]);
      setProducts(p);
      setSuppliers(s);
      setUsers(u);
      setOrders(o);
      setBatches(b);
      if (settings?.defaultTrialDays) {
        setEditingTrialDays(settings.defaultTrialDays);
        setDefaultTrialDays(settings.defaultTrialDays);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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

      {/* بطاقة إعدادات الفترة التجريبية الافتراضية */}
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
                className="w-20 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-black text-center focus:outline-hidden focus:border-blue-500"
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
                      {new Date(batch.createdAt).toLocaleDateString('ar-SA')}
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
                      {new Date(order.createdAt).toLocaleDateString('ar-SA')}
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
