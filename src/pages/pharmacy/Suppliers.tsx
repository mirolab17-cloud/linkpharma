// src/pages/pharmacy/Suppliers.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSuppliers, getPrices } from '../../services/dataStorage';
import { Supplier, PriceRecord } from '../../types';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import { createWhatsAppLink, formatPhoneNumber } from '../../utils/phone';
import { 
  Truck, 
  Search, 
  MapPin, 
  MessageCircle, 
  ExternalLink, 
  Info, 
  CheckCircle2, 
  Clock, 
  Building2, 
  Copy, 
  Check, 
  ShoppingBag,
  PhoneCall,
  Sparkles
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Spinner, CardSkeleton } from '../../components/Loader';

export const PharmacySuppliers: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { info, success } = useToastStore();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allSuppliers, allPrices] = await Promise.all([
        getSuppliers(),
        getPrices().catch(() => [])
      ]);
      setSuppliers(allSuppliers);
      setPrices(allPrices);
    } catch (err: any) {
      console.error('Error loading suppliers for pharmacy:', err);
    } finally {
      setLoading(false);
    }
  };

  // فلترة المستودعات المسموح للصيدلية برؤيتها
  const visibleSuppliers = useMemo(() => {
    let list = suppliers.filter((s) => s.status === 'active');

    // إذا كانت هناك مستودعات مخصصة للصيدلية
    if (user?.allowedSuppliers && user.allowedSuppliers.length > 0) {
      list = list.filter((s) => user.allowedSuppliers?.includes(s.id));
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((s) => 
        s.name.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        (s.notes && s.notes.toLowerCase().includes(q)) ||
        s.whatsapp.includes(q)
      );
    }

    return list;
  }, [suppliers, user?.allowedSuppliers, searchTerm]);

  // إحصائية عدد الأصناف المتوفرة لكل مورد
  const supplierProductCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    prices.forEach((p) => {
      if (p.available) {
        counts[p.supplierId] = (counts[p.supplierId] || 0) + 1;
      }
    });
    return counts;
  }, [prices]);

  const handleOpenDetails = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setCopiedLink(false);
  };

  const handleCopyWhatsAppLink = (supplier: Supplier) => {
    const link = createWhatsAppLink(
      supplier.whatsapp,
      `السلام عليكم، أتواصل معكم من (${user?.pharmacyName || 'الصيدلية'}) بخصوص طلبيات الأدوية عبر المنصة.`
    );
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    success('تم نسخ رابط محادثة الواتساب إلى الحافظة.');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6" dir="rtl">
      {/* ترويسة الصفحة */}
      <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 left-0 w-80 h-80 bg-white/5 rounded-full -translate-x-20 -translate-y-20 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs font-bold">
              <Truck className="w-3.5 h-3.5" />
              <span>دليل المستودعات وموردي الأدوية</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              المستودعات والشركات المعتمدة
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              استعرض عناوين المستودعات المرتبطة بالنظام، تواصل مباشرة مع المبيعات عبر واتساب، أو تصفح قوائم الأدوية والأسعار الخاصة بكل مورد.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-4 text-center min-w-[120px]">
              <div className="text-2xl font-black text-emerald-300">
                {visibleSuppliers.length}
              </div>
              <div className="text-[11px] text-slate-300 font-medium">مستودع متاح</div>
            </div>
          </div>
        </div>
      </div>

      {/* شريط البحث السريع */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث باسم المستودع أو المدينة أو الملاحظات..."
            className="w-full pr-10 pl-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-hidden focus:border-[#0f9d7a] bg-slate-50/50"
          />
        </div>

        <div className="text-xs text-slate-500 font-medium self-start sm:self-auto">
          عرض <strong className="text-slate-800">{visibleSuppliers.length}</strong> من أصل {suppliers.length} مستودع
        </div>
      </div>

      {/* قائمة المستودعات كبطاقات تفاعلية */}
      {loading ? (
        <CardSkeleton count={6} />
      ) : visibleSuppliers.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Truck className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800">لا توجد مستودعات مطابقة للبحث</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            تأكد من كتابة اسم المستودع بشكل صحيح أو تواصل مع إدارة المنصة لتفعيل وصولك للمستودعات.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {visibleSuppliers.map((supplier) => {
            const productCount = supplierProductCounts[supplier.id] || 0;
            const whatsAppLink = createWhatsAppLink(
              supplier.whatsapp,
              `السلام عليكم، أتواصل معكم من (${user?.pharmacyName || 'الصيدلية'}) بخصوص طلبيات الأدوية عبر المنصة.`
            );

            return (
              <div
                key={supplier.id}
                onClick={() => handleOpenDetails(supplier)}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-emerald-500/50 transition-all p-5 flex flex-col justify-between group cursor-pointer relative overflow-hidden"
              >
                {/* شريط تمييز جانبي ملون */}
                <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-600 opacity-80 group-hover:opacity-100 transition" />

                <div className="space-y-4">
                  {/* الرأس: اسم المستودع وأيقونة الشاحنة */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/80 text-[#0f9d7a] flex items-center justify-center shrink-0 group-hover:scale-105 transition shadow-2xs">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-base text-slate-900 group-hover:text-[#0f9d7a] transition leading-tight">
                          {supplier.name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="line-clamp-1">{supplier.address}</span>
                        </div>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-black shrink-0 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>معتمد</span>
                    </span>
                  </div>

                  {/* نبذة عن المستودع */}
                  {supplier.notes ? (
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-slate-600 text-xs leading-relaxed line-clamp-2">
                      {supplier.notes}
                    </div>
                  ) : (
                    <div className="p-3 rounded-2xl bg-slate-50/60 border border-slate-100 text-slate-400 text-xs italic">
                      مستودع أدوية معتمد ومسجل لتوريد طلبيات الصيدليات.
                    </div>
                  )}

                  {/* معلومات إضافية سريعة */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                    <div className="bg-slate-50/70 p-2.5 rounded-xl">
                      <div className="text-[10px] font-medium text-slate-400">الأصناف المسجلة</div>
                      <div className="text-xs font-black text-slate-800 mt-0.5">
                        {productCount > 0 ? `${productCount} دواء متاح` : 'قيد التحديث'}
                      </div>
                    </div>
                    <div className="bg-slate-50/70 p-2.5 rounded-xl">
                      <div className="text-[10px] font-medium text-slate-400">آخر تحديث للأسعار</div>
                      <div className="text-[11px] font-bold text-slate-700 mt-0.5">
                        {supplier.lastPriceUpdate ? new Date(supplier.lastPriceUpdate).toLocaleDateString('ar-SA') : 'حديثاً'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* أزرار الإجراءات */}
                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center gap-2">
                  {/* زر واتساب مباشر */}
                  <a
                    href={whatsAppLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition flex items-center justify-center gap-1.5 shadow-2xs active:scale-95"
                  >
                    <MessageCircle className="w-4 h-4 fill-white text-emerald-600" />
                    <span>واتساب</span>
                  </a>

                  {/* زر التفاصيل الكاملة */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDetails(supplier);
                    }}
                    className="py-2.5 px-3 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition flex items-center justify-center gap-1"
                  >
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    <span>التفاصيل</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* نافذة المودال لعرض التفاصيل الكاملة للمورد */}
      {selectedSupplier && (
        <Modal
          isOpen={Boolean(selectedSupplier)}
          onClose={() => setSelectedSupplier(null)}
          title={`تفاصيل المستودع: ${selectedSupplier.name}`}
          maxWidth="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => setSelectedSupplier(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إغلاق
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyWhatsAppLink(selectedSupplier)}
                  className="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                  <span>{copiedLink ? 'تم النسخ' : 'نسخ رابط واتساب'}</span>
                </button>

                <a
                  href={createWhatsAppLink(
                    selectedSupplier.whatsapp,
                    `السلام عليكم، أتواصل معكم من (${user?.pharmacyName || 'الصيدلية'}) بخصوص طلبيات الأدوية عبر المنصة.`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4 fill-white text-emerald-600" />
                  <span>فتح محادثة واتساب الآن</span>
                </a>
              </div>
            </div>
          }
        >
          <div className="space-y-5 text-right" dir="rtl">
            {/* بطاقة تعريفية رئيسية */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/90 flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                <Building2 className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-slate-900">{selectedSupplier.name}</h3>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                    مستودع نشط
                  </span>
                </div>
                <div className="text-xs text-slate-600 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{selectedSupplier.address}</span>
                </div>
              </div>
            </div>

            {/* تفاصيل الاتصال والواتساب */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="text-xs font-black text-slate-800 flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-emerald-600" />
                <span>بيانات التواصل والطلبيات عبر واتساب</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-[11px] text-slate-400 font-medium">رقم هاتف الواتساب</div>
                  <div className="font-black text-slate-900 mt-1 flex items-center justify-between" dir="ltr">
                    <span className="font-mono text-sm">{formatPhoneNumber(selectedSupplier.whatsapp)}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold">واتساب معتمد</span>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-[11px] text-slate-400 font-medium">رابط الواتساب المباشر</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <a
                      href={createWhatsAppLink(selectedSupplier.whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-700 hover:text-emerald-800 font-mono text-[11px] truncate flex items-center gap-1"
                      dir="ltr"
                    >
                      <span>wa.me/{selectedSupplier.whatsapp}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopyWhatsAppLink(selectedSupplier)}
                      className="p-1 text-slate-400 hover:text-slate-700"
                      title="نسخ الرابط"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* نبذة عن المورد */}
            <div className="space-y-1.5">
              <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>نبذة عن المستودع وشروط التوريد</span>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-slate-200 text-xs sm:text-sm text-slate-700 leading-relaxed min-h-[80px]">
                {selectedSupplier.notes ? (
                  <p className="whitespace-pre-line">{selectedSupplier.notes}</p>
                ) : (
                  <p className="text-slate-400 italic">
                    مستودع أدوية ومستحضرات صيدلانية معتمد في المنصة. يقدم عروض أسعار دورية مع إمكانية إرسال طلبيات الصيدلية مباشرة عبر واتساب للمبيعات.
                  </p>
                )}
              </div>
            </div>

            {/* إحصائيات التوفر وزر استعراض الأدوية */}
            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 text-blue-700" />
                  <span>تصفح أدوية وأسعار هذا المورد</span>
                </div>
                <div className="text-[11px] text-slate-600">
                  يتوفر لدى هذا المستودع حالياً ({supplierProductCounts[selectedSupplier.id] || 0}) صنف دوائي مسجل بقوائم الأسعار.
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const supId = selectedSupplier.id;
                  setSelectedSupplier(null);
                  navigate(`/app/prices?supplier=${supId}`);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shrink-0 shadow-2xs"
              >
                انتقال لمقارنة أسعار المورد
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
