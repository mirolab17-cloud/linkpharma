// src/pages/admin/Orders.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { getOrders, updateOrderStatus, getSuppliers, getUsers } from '../../services/dataStorage';
import { Order, Supplier, UserProfile } from '../../types';
import { formatCurrency } from '../../utils/formatPrice';
import { useToastStore } from '../../store/useToastStore';
import { 
  ClipboardList, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Eye, 
  Building, 
  Store, 
  Calendar 
} from 'lucide-react';
import { Table, Column } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/Loader';
import { EmptyState } from '../../components/EmptyState';

export const AdminOrders: React.FC = () => {
  const { success, error } = useToastStore();

  const [orders, setOrders] = useState<Order[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [selectedPharmacy, setSelectedPharmacy] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Selected Order Modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [o, s, u] = await Promise.all([getOrders(), getSuppliers(), getUsers()]);
      setOrders(o);
      setSuppliers(s);
      setUsers(u.filter((user) => user.role === 'pharmacy'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId: string, status: 'sent' | 'confirmed' | 'cancelled') => {
    try {
      await updateOrderStatus(orderId, status);
      success('تم تحديث حالة الطلبية بنجاح.');
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status });
      }
      await loadData();
    } catch (err: any) {
      error('فشل تحديث الحالة: ' + err.message);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (selectedSupplier !== 'all' && o.supplierId !== selectedSupplier) return false;
      if (selectedPharmacy !== 'all' && o.pharmacyId !== selectedPharmacy) return false;
      if (selectedStatus !== 'all' && o.status !== selectedStatus) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchPharma = o.pharmacyName.toLowerCase().includes(q);
        const matchSup = o.supplierName.toLowerCase().includes(q);
        if (!matchPharma && !matchSup) return false;
      }
      return true;
    });
  }, [orders, selectedSupplier, selectedPharmacy, selectedStatus, searchTerm]);

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg flex items-center gap-1 w-fit">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>مؤكدة</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg flex items-center gap-1 w-fit">
            <XCircle className="w-3.5 h-3.5" />
            <span>ملغاة</span>
          </span>
        );
      case 'sent':
      default:
        return (
          <span className="px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold rounded-lg flex items-center gap-1 w-fit">
            <Clock className="w-3.5 h-3.5" />
            <span>مرسلة</span>
          </span>
        );
    }
  };

  const columns: Column<Order>[] = [
    {
      key: 'pharmacyName',
      header: 'الصيدلية ومقدم الطلب',
      sortable: true,
      render: (item) => (
        <div>
          <span className="font-extrabold text-slate-800 block">{item.pharmacyName}</span>
          <span className="text-xs text-slate-400 font-mono mt-0.5 block" dir="ltr">
            {item.pharmacyPhone}
          </span>
        </div>
      ),
    },
    {
      key: 'supplierName',
      header: 'المورد المستلم',
      sortable: true,
      render: (item) => (
        <span className="text-xs font-bold text-slate-700">{item.supplierName}</span>
      ),
    },
    {
      key: 'items',
      header: 'البنود',
      render: (item) => (
        <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
          {item.items.length} أصناف
        </span>
      ),
    },
    {
      key: 'total',
      header: 'الإجمالي',
      sortable: true,
      render: (item) => (
        <span className="font-black text-sm text-[#0f9d7a]">
          {formatCurrency(item.total)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (item) => getStatusBadge(item.status),
    },
    {
      key: 'createdAt',
      header: 'التاريخ',
      sortable: true,
      render: (item) => (
        <span className="text-xs text-slate-400">
          {new Date(item.createdAt).toLocaleDateString('ar-SA')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      render: (item) => (
        <button
          onClick={() => setSelectedOrder(item)}
          className="p-1.5 text-slate-500 hover:text-[#0f9d7a] hover:bg-emerald-50 rounded-lg transition"
          title="عرض البنود وتحديث الحالة"
        >
          <Eye className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-[#0f9d7a]" />
            <span>سجل الطلبيات بين الصيدليات والمستودعات</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            متابعة كافة الطلبيات الموجهة للموردين مع تفاصيل الأسعار وحالات التأكيد
          </p>
        </div>
      </div>

      {/* شريط الفلاتر والبحث */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث بالصيدلية أو المورد..."
            className="w-full pr-10 pl-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:border-[#0f9d7a]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1">المورد</label>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
            >
              <option value="all">كل الموردين</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1">الصيدلية</label>
            <select
              value={selectedPharmacy}
              onChange={(e) => setSelectedPharmacy(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
            >
              <option value="all">كل الصيدليات</option>
              {users.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.pharmacyName || u.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1">الحالة</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
            >
              <option value="all">كل الحالات</option>
              <option value="sent">مرسلة (Sent)</option>
              <option value="confirmed">مؤكدة (Confirmed)</option>
              <option value="cancelled">ملغاة (Cancelled)</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner text="جاري جلب الطلبيات..." />
        </div>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="w-8 h-8" />}
          title="لا توجد طلبيات مطابقة"
          description="لم يتم العثور على أي طلبيات وفق معايير البحث المحددة."
        />
      ) : (
        <Table
          columns={columns}
          data={filteredOrders}
          keyExtractor={(item) => item.id}
        />
      )}

      {/* تفاصيل الطلبية وتعديل الحالة */}
      <Modal
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        title={`تفاصيل الطلبية #${selectedOrder?.id}`}
        maxWidth="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">تغيير الحالة:</span>
              <button
                type="button"
                onClick={() => selectedOrder && handleStatusChange(selectedOrder.id, 'confirmed')}
                className="px-3 py-1 bg-emerald-50 text-[#0f9d7a] hover:bg-emerald-100 rounded-lg text-xs font-bold transition"
              >
                تأكيد
              </button>
              <button
                type="button"
                onClick={() => selectedOrder && handleStatusChange(selectedOrder.id, 'cancelled')}
                className="px-3 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-bold transition"
              >
                إلغاء
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
            >
              إغلاق
            </button>
          </div>
        }
      >
        {selectedOrder && (
          <div className="space-y-4 text-right">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl text-xs">
              <div>
                <span className="text-slate-400 block">الصيدلية:</span>
                <span className="font-bold text-slate-800">{selectedOrder.pharmacyName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">المورد:</span>
                <span className="font-bold text-slate-800">{selectedOrder.supplierName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">الحالة الحالية:</span>
                <div>{getStatusBadge(selectedOrder.status)}</div>
              </div>
              <div>
                <span className="text-slate-400 block">جوال الصيدلية:</span>
                <span className="font-mono text-slate-700" dir="ltr">
                  {selectedOrder.pharmacyPhone}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block">العنوان:</span>
                <span className="text-slate-700">{selectedOrder.pharmacyAddress}</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-500 mb-2">الأصناف المطلوبة:</h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-60 overflow-y-auto">
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
              <span className="text-xs font-bold text-slate-600">المجموع الكلي:</span>
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
