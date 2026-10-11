// src/pages/pharmacy/Cart.tsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useCartStore } from '../../store/useCartStore';
import { useToastStore } from '../../store/useToastStore';
import { createOrder } from '../../services/dataStorage';
import { buildOrderWhatsAppMessage, openWhatsAppOrder } from '../../services/whatsapp';
import { formatCurrency } from '../../utils/formatPrice';
import { 
  ShoppingCart, 
  Trash2, 
  Send, 
  Building, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight,
  Plus,
  Minus
} from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';

export const PharmacyCart: React.FC = () => {
  const { user } = useAuthStore();
  const { 
    items, 
    updateQty, 
    removeItem, 
    clearSupplierItems, 
    clearCart, 
    getSupplierGroups, 
    getTotalAmount, 
    getTotalItemsCount 
  } = useCartStore();
  const { success, error, warning } = useToastStore();
  const navigate = useNavigate();

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [sendingSupplierId, setSendingSupplierId] = useState<string | null>(null);

  const supplierGroups = getSupplierGroups();
  const supplierKeys = Object.keys(supplierGroups);

  // إرسال طلبية مورد واحد
  const handleSendSupplierOrder = async (supplierId: string) => {
    if (!user) return;

    if (!user.profileComplete || !user.pharmacyName || !user.phone || !user.address) {
      warning('يرجى استكمال بيانات ملف الصيدلية أولاً قبل إرسال الطلبية.');
      navigate('/app/profile');
      return;
    }

    const group = supplierGroups[supplierId];
    if (!group || group.items.length === 0) return;

    setSendingSupplierId(supplierId);

    try {
      // 1) إنشاء وحفظ الطلبية في Firestore بحالة sent
      await createOrder({
        pharmacyId: user.uid,
        pharmacyName: user.pharmacyName,
        pharmacyAddress: user.address,
        pharmacyPhone: user.phone,
        supplierId: group.supplierId,
        supplierName: group.supplierName,
        items: group.items.map((i) => ({
          productId: i.productId,
          name: i.tradeName,
          qty: i.qty,
          price: i.price,
        })),
        total: group.subtotal,
        status: 'sent',
      });

      // 2) إنشاء نص رسالة واتساب وفتح المحادثة
      const message = buildOrderWhatsAppMessage({
        pharmacy: user,
        items: group.items,
        subtotal: group.subtotal,
      });

      openWhatsAppOrder(group.supplierWhatsapp, message);

      // 3) تفريغ بنود المورد من السلة بعد الإرسال
      clearSupplierItems(supplierId);
      success(`تم تسجيل طلبية (${group.supplierName}) وفتح محادثة واتساب لإرسالها.`);
    } catch (err: any) {
      console.error('Failed to send order', err);
      error('حدث خطأ أثناء حفظ الطلبية: ' + err.message);
    } finally {
      setSendingSupplierId(null);
    }
  };

  // إرسال لجميع الموردين واحداً تلو الآخر
  const handleSendAllOrders = async () => {
    if (!user?.profileComplete) {
      warning('يرجى استكمال بيانات ملف الصيدلية أولاً.');
      navigate('/app/profile');
      return;
    }

    for (const supId of supplierKeys) {
      await handleSendSupplierOrder(supId);
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <EmptyState
          icon={<ShoppingCart className="w-8 h-8" />}
          title="سلة الطلبات فارغة"
          description="لم تقم بإضافة أي أصناف دوائية إلى سلتك بعد. تصفح مقارنة الأسعار واختر أفضل العروض."
          actionText="تصفح مقارنة الأسعار"
          onAction={() => navigate('/app/prices')}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 md:pb-12">
      {/* رأس الصفحة */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>سلة الطلبيات</span>
            <span className="text-sm font-bold bg-emerald-100 text-[#0f9d7a] px-2.5 py-0.5 rounded-full">
              {getTotalItemsCount()} صنف
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            يتم تجميع طلبيات كل مورد بشكل منفصل لإرسال رسالة واتساب مخصصة لكل مستودع
          </p>
        </div>

        <div className="flex items-center gap-2">
          {supplierKeys.length > 1 && (
            <button
              onClick={handleSendAllOrders}
              className="px-4 py-2 bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>إرسال الطلبات للجميع</span>
            </button>
          )}

          <button
            onClick={() => setConfirmClearOpen(true)}
            className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition border border-rose-200"
            title="تفريغ السلة بالكامل"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* تنبيه الملف الشخصي إن كان ناقصاً */}
      {(!user?.profileComplete || !user.pharmacyName || !user.phone || !user.address) && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800 font-semibold">
              يجب إكمال بيانات الصيدلية (الاسم، العنوان، والجوال) لتضمينها في رسائل واتساب عند الإرسال.
            </p>
          </div>
          <Link
            to="/app/profile"
            className="px-3 py-1.5 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition shrink-0"
          >
            إكمال الملف
          </Link>
        </div>
      )}

      {/* قائمة مجموعات الموردين */}
      <div className="space-y-6">
        {supplierKeys.map((supplierId) => {
          const group = supplierGroups[supplierId];
          const isSending = sendingSupplierId === supplierId;

          return (
            <div
              key={supplierId}
              className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
            >
              {/* ترويسة بطاقة المورد */}
              <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-[#0f9d7a] flex items-center justify-center shadow-2xs">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-800">
                      {group.supplierName}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium" dir="ltr">
                      واتساب: +{group.supplierWhatsapp}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60">
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block font-semibold">
                      إجمالي المورد ({group.items.length} صنف)
                    </span>
                    <span className="text-base font-black text-[#0f9d7a]">
                      {formatCurrency(group.subtotal)}
                    </span>
                  </div>

                  <button
                    onClick={() => handleSendSupplierOrder(supplierId)}
                    disabled={isSending}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-2 active:scale-95 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>{isSending ? 'جاري الإرسال...' : 'إرسال الطلبية عبر واتساب'}</span>
                  </button>
                </div>
              </div>

              {/* بنود طلبيات هذا المورد */}
              <div className="divide-y divide-slate-100">
                {group.items.map((item) => (
                  <div
                    key={item.productId}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition"
                  >
                    <div className="flex-1">
                      <h4 className="font-bold text-sm text-slate-800">{item.tradeName}</h4>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        {item.form && <span>{item.form}</span>}
                        {item.strength && <span>{item.strength}</span>}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-5">
                      {/* التحكم بالكمية */}
                      <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            updateQty(item.productId, item.supplierId, item.qty - 1)
                          }
                          className="p-1.5 text-slate-600 hover:bg-slate-200 transition"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-10 text-center text-xs font-bold text-slate-800">
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateQty(item.productId, item.supplierId, item.qty + 1)
                          }
                          className="p-1.5 text-slate-600 hover:bg-slate-200 transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* السعر الفرعي */}
                      <div className="text-left min-w-24">
                        <span className="text-xs text-slate-400 block font-normal">
                          {formatCurrency(item.price)} × {item.qty}
                        </span>
                        <span className="text-sm font-black text-slate-900">
                          {formatCurrency(item.price * item.qty)}
                        </span>
                      </div>

                      {/* زر حذف بند */}
                      <button
                        onClick={() => removeItem(item.productId, item.supplierId)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                        title="حذف البند"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ملخص الإجمالي الكلي للشاشة الكبيرة */}
      <div className="mt-8 p-5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <span className="text-xs text-slate-500 font-semibold block">الإجمالي الكلي لجميع الموردين:</span>
          <span className="text-2xl font-black text-slate-900">
            {formatCurrency(getTotalAmount())}
          </span>
        </div>

        <Link
          to="/app/prices"
          className="text-xs font-bold text-[#0f9d7a] hover:underline flex items-center gap-1"
        >
          <span>متابعة التسوق ومقارنة المزيد من الأصناف</span>
          <ArrowRight className="w-4 h-4 rotate-180" />
        </Link>
      </div>

      {/* تأكيد تفريغ السلة */}
      <ConfirmDialog
        isOpen={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          clearCart();
          setConfirmClearOpen(false);
          success('تم تفريغ السلة بالكامل.');
        }}
        title="تفريغ سلة الطلبات"
        message="هل أنت متأكد من رغبتك في حذف جميع الأصناف والطلبيات من السلة؟"
        confirmText="نعم، إفراغ السلة"
      />
    </div>
  );
};
