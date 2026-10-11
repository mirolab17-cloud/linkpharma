// src/pages/pharmacy/MyOrders.tsx
import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useCartStore } from '../../store/useCartStore';
import { useToastStore } from '../../store/useToastStore';
import { getOrders, getPrices, getSuppliers } from '../../services/dataStorage';
import { Order, PriceRecord, Supplier } from '../../types';
import { formatCurrency } from '../../utils/formatPrice';
import { 
  ClipboardList, 
  RotateCw, 
  Calendar, 
  Building, 
  CheckCircle2, 
  Clock, 
  XCircle,
  Eye,
  ChevronDown
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { Spinner } from '../../components/Loader';
import { useNavigate } from 'react-router-dom';

export const MyOrders: React.FC = () => {
  const { user } = useAuthStore();
  const { addItem } = useCartStore();
  const { success } = useToastStore();
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    loadOrders();
  }, [user]);

  const loadOrders = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const allOrders = await getOrders();
      // فلترة طلبات هذه الصيدلية فقط
      const myOrders = allOrders.filter((o) => o.pharmacyId === user.uid);
      setOrders(myOrders);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
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
        // البحث عن أحدث سعر لهذا الصنف من نفس المورد
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

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>مؤكدة</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" />
            <span>ملغاة</span>
          </span>
        );
      case 'sent':
      default:
        return (
          <span className="px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold rounded-lg flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>تم الإرسال</span>
          </span>
        );
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 md:pb-12">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>سجل طلبياتي</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            متابعة الطلبيات السابقة المرسلة للمستودعات وإمكانية إعادة طلبها بنقرة واحدة
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner text="جاري جلب الطلبيات..." />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="w-8 h-8" />}
          title="لا توجد طلبات سابقة"
          description="لم تقم بإرسال أي طلبات بعد. ابدأ بمقارنة الأسعار وأرسل طلبيتك الأولى للموردين."
          actionText="مقارنة الأسعار الآن"
          onAction={() => navigate('/app/prices')}
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-300 transition"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                    <Building className="w-4 h-4 text-[#0f9d7a]" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                      {order.supplierName}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{new Date(order.createdAt).toLocaleDateString('ar-SA')}</span>
                      </span>
                      <span>•</span>
                      <span>{order.items.length} أصناف</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <div className="text-right">
                  <span className="text-xs text-slate-400 block font-medium">الإجمالي</span>
                  <span className="text-base font-black text-slate-900">
                    {formatCurrency(order.total)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {getStatusBadge(order.status)}

                  <button
                    onClick={() => setSelectedOrder(order)}
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
                    title="عرض التفاصيل"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleReorder(order)}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-[#0f9d7a] rounded-xl text-xs font-bold transition flex items-center gap-1 active:scale-95"
                    title="إضافة كل بنود الطلبية للسلة"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>إعادة الطلب</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* نافذة تفاصيل الطلبية */}
      <Modal
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        title={`تفاصيل الطلبية #${selectedOrder?.id}`}
        maxWidth="lg"
        footer={
          <button
            onClick={() => setSelectedOrder(null)}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            إغلاق
          </button>
        }
      >
        {selectedOrder && (
          <div className="space-y-4 text-right">
            <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400 block">المورد:</span>
                <span className="font-bold text-slate-800">{selectedOrder.supplierName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">التاريخ:</span>
                <span className="font-bold text-slate-800">
                  {new Date(selectedOrder.createdAt).toLocaleString('ar-SA')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">الحالة:</span>
                <div>{getStatusBadge(selectedOrder.status)}</div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-500 mb-2">الأصناف المطلوبة:</h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {selectedOrder.items.map((item, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800 block">{item.name}</span>
                      <span className="text-slate-400">
                        {formatCurrency(item.price)} × {item.qty}
                      </span>
                    </div>
                    <span className="font-black text-slate-800">
                      {formatCurrency(item.price * item.qty)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-600">المجموع النهائي:</span>
              <span className="text-lg font-black text-[#0f9d7a]">
                {formatCurrency(selectedOrder.total)}
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
