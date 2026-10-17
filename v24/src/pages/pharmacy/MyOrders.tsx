// src/pages/pharmacy/MyOrders.tsx
import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useCartStore } from '../../store/useCartStore';
import { useToastStore } from '../../store/useToastStore';
import { getOrders, getPrices, getSuppliers, getRecurringOrderTemplates, saveRecurringOrderTemplates } from '../../services/dataStorage';
import { Order, PriceRecord, Supplier, RecurringOrderTemplate } from '../../types';
import { formatCurrency } from '../../utils/formatPrice';
import { formatGregorianDate } from '../../utils/formatDate';
import {
  ClipboardList,
  RotateCw,
  Calendar,
  Building,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  Truck,
  PackageCheck,
  Printer,
  FileText,
  Bookmark,
  Share2,
  X,
  Plus,
  Pencil
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { CardSkeleton } from '../../components/Loader';
import { useNavigate } from 'react-router-dom';

export const MyOrders: React.FC = () => {
  const { user } = useAuthStore();
  const { addItem, clearCart } = useCartStore();
  const { success, info } = useToastStore();
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [printInvoiceOrder, setPrintInvoiceOrder] = useState<Order | null>(null);

  // Recurring templates (قوالب طلبيات متكررة)
  const [templates, setTemplates] = useState<RecurringOrderTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<'orders' | 'templates'>('orders');

  useEffect(() => {
    loadOrders();
    if (user?.uid) void loadTemplates(user.uid);
  }, [user?.uid]);

  const loadOrders = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const allOrders = await getOrders();
      const myOrders = allOrders.filter((o) => o.pharmacyId === user.uid);
      myOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setOrders(myOrders);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async (uid: string) => {
    try {
      setTemplates(await getRecurringOrderTemplates(uid));
    } catch (error) {
      console.warn('تعذر تحميل قوالب الصيدلية:', error);
      setTemplates([]);
    }
  };

  // حفظ الطلبية كقالب متكرر
  const handleSaveAsTemplate = async (order: Order) => {
    if (!user?.uid) return;
    const newTemplate: RecurringOrderTemplate = {
      id: 'template_' + Date.now(),
      name: `قالب ${order.supplierName} (${order.items.length} أصناف)`,
      schedule: 'weekly',
      items: order.items.map((i) => ({
        productId: i.productId,
        tradeName: i.name,
        supplierId: order.supplierId,
        supplierName: order.supplierName,
        supplierWhatsapp: '',
        price: i.price,
        qty: i.qty,
      })),
      createdAt: new Date().toISOString(),
    };

    const updated = [newTemplate, ...templates];
    setTemplates(updated);
    const synced = await saveRecurringOrderTemplates(user.uid, updated);
    success(synced ? 'تم حفظ القالب ومزامنته مع حساب الصيدلية.' : 'حُفظ القالب على هذا الجهاز فقط؛ تحقق من اتصال Firebase لمزامنته.');
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!user?.uid) return;
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    const synced = await saveRecurringOrderTemplates(user.uid, updated);
    info(synced ? 'تم حذف القالب من حساب الصيدلية.' : 'حُذف القالب من هذا الجهاز فقط؛ لم تتوفر مزامنة Firebase.');
  };

  // إعادة الطلب: إضافة بنود الطلبية السابقة للسلة بأحدث الأسعار
  const handleReorder = async (order: Order) => {
    try {
      const [currentPrices, currentSuppliers] = await Promise.all([
        getPrices(),
        getSuppliers(),
      ]);

      const supplier = currentSuppliers.find((s) => s.id === order.supplierId);
      if (!supplier) {
        throw new Error('المورد لم يعد متاحاً.');
      }

      order.items.forEach((item) => {
        const latestPriceRec = currentPrices.find(
          (p) => p.productId === item.productId && p.supplierId === order.supplierId
        );

        const priceToUse = latestPriceRec ? latestPriceRec.price : item.price;

        addItem(
          {
            productId: item.productId,
            tradeName: item.name,
            supplierId: order.supplierId,
            supplierName: order.supplierName,
            supplierWhatsapp: supplier.whatsapp,
            price: priceToUse,
          },
          item.qty
        );
      });

      success(`تمت إضافة بنود طلبية (${order.supplierName}) إلى سلتك بأحدث الأسعار.`);
      navigate('/app/cart');
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleEditOrder = async (order: Order) => {
    if (!user?.uid || order.pharmacyId !== user.uid) return;
    if (order.status !== 'sent') {
      info('يمكن تعديل الطلبية قبل أن يؤكد المستودع استلامها فقط.');
      return;
    }
    if (useCartStore.getState().items.length > 0 && !window.confirm('سيتم استبدال محتويات السلة الحالية ببنود هذه الطلبية. هل تريد المتابعة؟')) return;
    const supplier = (await getSuppliers()).find((item) => item.id === order.supplierId);
    if (!supplier) {
      info('المستودع غير متاح الآن، لذلك لا يمكن فتح الطلبية للتعديل.');
      return;
    }
    clearCart();
    order.items.forEach((item) => addItem({
      productId: item.productId,
      tradeName: item.name,
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      supplierWhatsapp: supplier.whatsapp,
      price: item.price,
      bonus: item.bonus,
    }, item.qty));
    localStorage.setItem(`pharma_edit_order_${user.uid}`, order.id);
    navigate('/app/cart');
  };

  const handleApplyTemplate = async (template: RecurringOrderTemplate) => {
    try {
      const [currentPrices, currentSuppliers] = await Promise.all([
        getPrices(),
        getSuppliers(),
      ]);

      template.items.forEach((item) => {
        const sup = currentSuppliers.find((s) => s.id === item.supplierId);
        const latestPriceRec = currentPrices.find(
          (p) => p.productId === item.productId && p.supplierId === item.supplierId
        );
        const priceToUse = latestPriceRec ? latestPriceRec.price : item.price;

        addItem({
          productId: item.productId,
          tradeName: item.tradeName,
          supplierId: item.supplierId,
          supplierName: item.supplierName,
          supplierWhatsapp: sup ? sup.whatsapp : '',
          price: priceToUse,
        }, item.qty);
      });

      success(`تم تطبيق القالب (${template.name}) وإضافة جميع الأصناف للسلة بنجاح!`);
      navigate('/app/cart');
    } catch (e: any) {
      console.error(e);
    }
  };

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'delivered':
        return (
          <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-xs font-bold rounded-lg flex items-center gap-1">
            <PackageCheck className="w-3.5 h-3.5" />
            <span>سُلّمت للصيدلية</span>
          </span>
        );
      case 'processing':
        return (
          <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold rounded-lg flex items-center gap-1">
            <Truck className="w-3.5 h-3.5" />
            <span>قيد التجهيز والشحن</span>
          </span>
        );
      case 'confirmed':
        return (
          <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-xs font-bold rounded-lg flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>أُكدت من المستودع</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-xs font-bold rounded-lg flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" />
            <span>ملغاة</span>
          </span>
        );
      case 'sent':
      default:
        return (
          <span className="px-2.5 py-1 bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-xs font-bold rounded-lg flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>أُرسلت عبر واتساب</span>
          </span>
        );
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 md:pb-12 text-slate-900 dark:text-slate-100 transition-colors duration-200" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>سجل طلبياتي وقوالب الشراء</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            تتبّع حالة الطلبيات (أُرسلت ← أُكدت ← سُلّمت)، طباعة الفواتير، وإعادة الطلب بنقرة واحدة
          </p>
        </div>

        {/* أزرار التبديل بين الطلبيات والقوالب */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'orders'
                ? 'bg-white dark:bg-slate-700 text-[#0f9d7a] shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            الطلبيات ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'templates'
                ? 'bg-white dark:bg-slate-700 text-[#0f9d7a] shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            القوالب المتكررة ({templates.length})
          </button>
        </div>
      </div>

      {loading ? (
        <CardSkeleton count={4} />
      ) : activeTab === 'templates' ? (
        /* تبويب القوالب المتكررة */
        templates.length === 0 ? (
          <EmptyState
            icon={<Bookmark className="w-8 h-8" />}
            title="لا توجد قوالب طلبيات متكررة بعد"
            description="يمكنك تحويل أي طلبية سابقة إلى قالب متكرر (أسبوعي/شهري) لإعادة شرائها بضغطة زر واحدة."
            actionText="عرض الطلبيات السابقة"
            onAction={() => setActiveTab('orders')}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                      {tpl.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/70 text-[#0f9d7a] text-[10px] font-bold">
                      {tpl.schedule === 'weekly' ? 'أسبوعي' : 'شهري'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    عدد الأصناف بالقالب: <strong className="text-slate-800 dark:text-slate-200">{tpl.items.length}</strong> صنف
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    أُنشئ في: {formatGregorianDate(tpl.createdAt, { includeTime: false })}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => handleDeleteTemplate(tpl.id)}
                    className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
                  >
                    حذف القالب
                  </button>

                  <button
                    onClick={() => handleApplyTemplate(tpl)}
                    className="px-4 py-2 rounded-xl bg-[#0f9d7a] hover:bg-[#0c8567] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs active:scale-95"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>إرسال الطلبية للسلة</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="w-8 h-8" />}
          title="لا توجد طلبات سابقة"
          description="لم تقم بإرسال أي طلبات بعد. ابدأ بالأسعار والعروض وأرسل طلبيتك الأولى للموردين."
          actionText="الأسعار والعروض الآن"
          onAction={() => navigate('/app/prices')}
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-300 dark:hover:border-slate-700 transition"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs">
                    <Building className="w-5 h-5 text-[#0f9d7a]" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                      {order.supplierName}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatGregorianDate(order.createdAt, { includeTime: false })}</span>
                      </span>
                      <span>•</span>
                      <span>{order.items.length} أصناف</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                <div className="text-right font-mono">
                  <span className="text-xs text-slate-400 dark:text-slate-500 block font-sans">الإجمالي</span>
                  <span className="text-base font-black text-slate-900 dark:text-white">
                    {formatCurrency(order.total)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {getStatusBadge(order.status)}

                  {order.status === 'sent' && <button
                    type="button"
                    onClick={() => void handleEditOrder(order)}
                    className="min-h-10 rounded-xl border border-emerald-200 px-3 text-xs font-bold text-[#0f9d7a] hover:bg-emerald-50"
                    title="تعديل الطلبية قبل تأكيد المستودع"
                  ><Pencil className="ml-1 inline h-3.5 w-3.5" />تعديل</button>}

                  {/* زر الفاتورة والطباعة */}
                  <button
                    onClick={() => setPrintInvoiceOrder(order)}
                    className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                    title="طباعة كفاتورة رسمية / PDF"
                  >
                    <Printer className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setSelectedOrder(order)}
                    className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                    title="عرض التفاصيل"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleSaveAsTemplate(order)}
                    className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-xl transition"
                    title="حفظ كقالب طلبيات متكررة"
                  >
                    <Bookmark className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleReorder(order)}
                    className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-[#0f9d7a] rounded-xl text-xs font-bold transition flex items-center gap-1 active:scale-95"
                    title="إضافة كل بنود الطلبية للسلة بأحدث الأسعار"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>تكرار الطلب</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* تفاصيل الطلبية Modal */}
      {selectedOrder && (
        <Modal
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          title={`تفاصيل الطلبية #${selectedOrder.id}`}
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">المستودع:</span>
                <span className="font-bold text-slate-900 dark:text-white">{selectedOrder.supplierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">تاريخ الطلب:</span>
                <span>{formatGregorianDate(selectedOrder.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الحالة:</span>
                <span>{getStatusBadge(selectedOrder.status)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs space-y-2">
              <h3 className="font-black text-slate-800">سجل الطلبية</h3>
              {(selectedOrder.statusHistory || []).map((event, index) => <div key={`status-${index}`} className="flex items-center justify-between gap-3 border-b border-emerald-100 pb-2 last:border-0">
                <span>الحالة: {getStatusBadge(event.status)}</span><span className="text-slate-500">{formatGregorianDate(event.changedAt, { includeTime: true })}</span>
              </div>)}
              {(selectedOrder.editHistory || []).map((event, index) => <div key={`edit-${index}`} className="border-t border-emerald-100 pt-2">
                <b>تعديل محفوظ · {formatGregorianDate(event.changedAt, { includeTime: true })}</b>
                <p className="mt-1">الإجمالي السابق {formatCurrency(event.previousTotal)} ← الجديد {formatCurrency(event.total)}</p>
                <p className="mt-1 text-slate-500">قبل التعديل: {event.previousItems.map((item) => `${item.name} × ${item.qty} (${formatCurrency(item.price)})`).join('، ')}</p>
              </div>)}
              {!selectedOrder.statusHistory?.length && !selectedOrder.editHistory?.length && <p className="text-slate-500">لا يوجد سجل تغييرات سابق.</p>}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3">الصنف</th>
                    <th className="p-3 text-center">الكمية</th>
                    <th className="p-3">السعر</th>
                    <th className="p-3">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedOrder.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{item.name}</td>
                      <td className="p-3 text-center font-bold font-mono">{item.qty}</td>
                      <td className="p-3 font-mono">{formatCurrency(item.price)}</td>
                      <td className="p-3 font-bold font-mono">{formatCurrency(item.price * item.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-sm font-black text-emerald-800 dark:text-emerald-300">
              <span>إجمالي الطلبية:</span>
              <span className="font-mono">{formatCurrency(selectedOrder.total)}</span>
            </div>
          </div>
        </Modal>
      )}

      {/* معاينة وطباعة الفاتورة PDF */}
      {printInvoiceOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" dir="rtl">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#0f9d7a]" />
                  <span>فاتورة طلبية رسمية #{printInvoiceOrder.id}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  تاريخ الطلبية: {formatGregorianDate(printInvoiceOrder.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setPrintInvoiceOrder(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-xs">
                <div>
                  <span className="font-bold text-slate-400 block mb-1">الجهة الطالبة:</span>
                  <div className="font-bold text-slate-900 dark:text-white">{printInvoiceOrder.pharmacyName}</div>
                  <div className="text-slate-600 dark:text-slate-300">{printInvoiceOrder.pharmacyAddress}</div>
                  <div className="text-slate-600 dark:text-slate-300 font-mono" dir="ltr">{printInvoiceOrder.pharmacyPhone}</div>
                </div>
                <div>
                  <span className="font-bold text-slate-400 block mb-1">المستودع المورد:</span>
                  <div className="font-bold text-slate-900 dark:text-white">{printInvoiceOrder.supplierName}</div>
                  <div className="mt-1">{getStatusBadge(printInvoiceOrder.status)}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">الصنف الدوائي</th>
                      <th className="p-3 text-center">الكمية</th>
                      <th className="p-3">السعر</th>
                      <th className="p-3">المجموع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {printInvoiceOrder.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{item.name}</td>
                        <td className="p-3 text-center font-bold font-mono">{item.qty}</td>
                        <td className="p-3 font-mono">{formatCurrency(item.price)}</td>
                        <td className="p-3 font-black font-mono">{formatCurrency(item.price * item.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex justify-between items-center text-sm">
                <span className="font-extrabold text-emerald-900 dark:text-emerald-200">إجمالي الطلبية:</span>
                <span className="text-lg font-black text-emerald-700 dark:text-emerald-300 font-mono">{formatCurrency(printInvoiceOrder.total)}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <button
                onClick={() => window.print()}
                className="px-5 py-2.5 rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold transition flex items-center gap-2 shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة أو حفظ كـ PDF</span>
              </button>

              <button
                onClick={() => setPrintInvoiceOrder(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
