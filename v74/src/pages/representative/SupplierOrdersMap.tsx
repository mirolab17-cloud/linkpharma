import React, { useEffect, useMemo, useState } from 'react';
import { MapPinned, RefreshCw, Search, ShoppingBag, MapPin } from 'lucide-react';
import { getSupplierOrders } from '../../services/dataStorage';
import { Order } from '../../types';
import { useAuthStore } from '../../store/useAuthStore';

export const SupplierOrdersMap: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const load = async () => { if (!user?.supplierId) return; setLoading(true); try { setOrders(await getSupplierOrders(user.supplierId)); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [user?.supplierId]);
  const areas = useMemo(() => {
    const map = new Map<string, { name: string; city: string; count: number; total: number }>();
    orders.forEach((order) => {
      const parts = (order.pharmacyAddress || '').split('·').map((part) => part.trim()).filter(Boolean);
      const name = parts[0] || 'موقع غير محدد'; const city = parts[1] || '—'; const key = `${name} · ${city}`;
      const row = map.get(key) || { name, city, count: 0, total: 0 }; row.count += 1; row.total += order.total || 0; map.set(key, row);
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [orders]);
  const visible = orders.filter((order) => {
    const statusOk = filter === 'all' || order.status === filter;
    const text = `${order.pharmacyName} ${order.pharmacyAddress} ${order.id}`.toLowerCase();
    return statusOk && (!query || text.includes(query.toLowerCase()));
  });
  if (!user || user.role !== 'representative') return null;
  return <div dir="rtl" className="mx-auto max-w-6xl space-y-4 p-3 sm:p-6">
    <header className="rounded-3xl bg-gradient-to-br from-[#073b4c] to-[#0f9d7a] p-5 text-white shadow-lg"><div className="flex items-center gap-2 text-xs font-bold text-emerald-100"><MapPinned className="h-4 w-4" /> خريطة طلبات المستودع</div><h1 className="mt-2 text-2xl font-black">طلبات الصيدليات حسب المنطقة</h1><p className="mt-2 text-xs leading-6 text-white/80">عرض مقيد بالمستودع المرتبط بحسابك. لا يتم تحميل طلبات مستودعات أخرى.</p></header>
    <section className="grid gap-3 sm:grid-cols-3">{areas.slice(0, 6).map((area) => <article key={`${area.name}-${area.city}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><MapPin className="h-5 w-5 text-[#0f9d7a]" /><b className="mt-2 block text-sm">{area.name}</b><span className="text-xs text-slate-500">{area.city}</span><strong className="mt-3 block text-xl">{area.count} <small className="text-xs font-normal text-slate-500">طلب</small></strong></article>)}</section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث باسم الصيدلية أو المنطقة" className="w-full rounded-xl border p-2.5 pr-9 text-xs" /></div><select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border p-2.5 text-xs"><option value="all">كل الحالات</option><option value="sent">مرسل</option><option value="confirmed">مؤكد</option><option value="processing">قيد التجهيز</option><option value="delivered">تم التوصيل</option></select><button onClick={() => void load()} className="rounded-xl border px-3 text-xs font-bold"><RefreshCw className="ml-1 inline h-4 w-4" />تحديث</button></div>{loading ? <p className="p-8 text-center text-xs text-slate-500">جاري تحميل الطلبات...</p> : <div className="mt-3 grid gap-2">{visible.map((order) => <article key={order.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex items-start justify-between gap-2"><div><b className="text-sm">{order.pharmacyName}</b><p className="mt-1 text-[11px] text-slate-500">{order.pharmacyAddress || 'الموقع غير محدد'}</p></div><span className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-[#0f9d7a]">{order.status}</span></div><div className="mt-3 flex items-center justify-between text-xs"><span><ShoppingBag className="ml-1 inline h-4 w-4" />{order.items?.length || 0} أصناف</span><b>{order.total} ₪</b></div></article>)}{!visible.length && <p className="p-8 text-center text-xs text-slate-500">لا توجد طلبات مطابقة.</p>}</div>}</section>
  </div>;
};
