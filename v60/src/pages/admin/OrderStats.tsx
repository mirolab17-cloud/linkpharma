// src/pages/admin/OrderStats.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, MapPin, RefreshCw, Truck } from 'lucide-react';
import { getOrders, getUsers } from '../../services/dataStorage';
import { Order, UserProfile } from '../../types';
import { useToastStore } from '../../store/useToastStore';
import { Spinner } from '../../components/Loader';
import { EmptyState } from '../../components/EmptyState';

type GroupBy = 'governorate' | 'city' | 'supplier';

const UNKNOWN = 'غير محدد';
const GROUP_LABEL: Record<GroupBy, string> = { governorate: 'المحافظة', city: 'المدينة', supplier: 'المستودع' };

function toDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDay(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDayKey(date.toISOString());
}

function formatDayLabel(key: string): string {
  const date = new Date(`${key}T12:00:00`);
  const weekday = date.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long' });
  return `${key} · ${weekday}`;
}

function resolveLocation(order: Order, usersById: Map<string, UserProfile>): { governorate: string; city: string } {
  const pharmacy = usersById.get(order.pharmacyId);
  const branches = pharmacy?.branches || [];
  const branch = branches.find((item) => item.id === order.pharmacyBranchId)
    || branches.find((item) => item.id === pharmacy?.defaultBranchId)
    || branches[0];
  return {
    governorate: (branch?.governorate || pharmacy?.governorate || '').trim() || UNKNOWN,
    city: (branch?.city || pharmacy?.city || '').trim() || UNKNOWN,
  };
}

export const OrderStats: React.FC = () => {
  const { error } = useToastStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>('governorate');
  const [from, setFrom] = useState(() => shiftDay(-13));
  const [to, setTo] = useState(() => shiftDay(0));
  const [includeCancelled, setIncludeCancelled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orderRows, userRows] = await Promise.all([getOrders(), getUsers()]);
      setOrders(orderRows);
      setUsers(userRows);
    } catch (e: any) {
      error('تعذر تحميل إحصائيات الطلبات: ' + (e?.message || ''));
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => {
    const usersById = new Map(users.map((user) => [user.uid, user]));
    const perDay = new Map<string, Map<string, number>>();
    const totalsByGroup = new Map<string, number>();
    let total = 0;

    orders.forEach((order) => {
      if (!includeCancelled && order.status === 'cancelled') return;
      const day = toDayKey(order.createdAt);
      if (!day || day < from || day > to) return;
      const place = resolveLocation(order, usersById);
      const group = groupBy === 'governorate' ? place.governorate
        : groupBy === 'city' ? (place.city === UNKNOWN ? place.city : `${place.governorate} - ${place.city}`)
        : (order.supplierName || UNKNOWN);
      const dayMap = perDay.get(day) || new Map<string, number>();
      dayMap.set(group, (dayMap.get(group) || 0) + 1);
      perDay.set(day, dayMap);
      totalsByGroup.set(group, (totalsByGroup.get(group) || 0) + 1);
      total += 1;
    });

    const groups = [...totalsByGroup.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
    const days = [...perDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, map]) => ({ day, map, total: [...map.values()].reduce((sum, value) => sum + value, 0) }));
    const maxDay = days.reduce((max, item) => Math.max(max, item.total), 0);
    return { groups, days, total, maxDay };
  }, [orders, users, groupBy, from, to, includeCancelled]);

  const setQuickRange = (daysBack: number) => { setFrom(shiftDay(-(daysBack - 1))); setTo(shiftDay(0)); };

  if (loading) return <div className="py-20 flex justify-center"><Spinner text="تحميل إحصائيات الطلبات..." /></div>;

  const GroupIcon = groupBy === 'supplier' ? Truck : MapPin;

  return (
    <div className="space-y-5 pb-12" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><BarChart3 className="h-6 w-6 text-[#0f9d7a]" />إحصائيات الطلبات اليومية</h1>
          <p className="mt-1 text-xs text-slate-500">عدد الطلبات لكل يوم موزعًا حسب المحافظة أو المدينة أو المستودع.</p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-xs font-bold"><RefreshCw className="h-4 w-4" />تحديث</button>
      </header>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {(['governorate', 'city', 'supplier'] as const).map((value) => (
            <button key={value} onClick={() => setGroupBy(value)} className={`rounded-xl px-4 py-2 text-xs font-bold transition ${groupBy === value ? 'bg-slate-900 text-white' : 'border bg-white text-slate-600 hover:bg-slate-50'}`}>
              حسب {GROUP_LABEL[value]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-bold text-slate-600">من<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="mt-1 block rounded-xl border p-2 text-xs" /></label>
          <label className="text-xs font-bold text-slate-600">إلى<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="mt-1 block rounded-xl border p-2 text-xs" /></label>
          <div className="flex gap-2">
            {[7, 14, 30, 90].map((count) => <button key={count} onClick={() => setQuickRange(count)} className="rounded-lg border bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-100">آخر {count} يوم</button>)}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={includeCancelled} onChange={(event) => setIncludeCancelled(event.target.checked)} />تضمين الطلبات الملغاة</label>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-800">إجمالي الطلبات في الفترة</p><p className="mt-1 text-3xl font-black text-emerald-900">{stats.total}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="flex items-center gap-1 text-xs font-bold text-slate-500"><CalendarDays className="h-4 w-4" />أيام فيها طلبات</p><p className="mt-1 text-3xl font-black text-slate-900">{stats.days.length}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="flex items-center gap-1 text-xs font-bold text-slate-500"><GroupIcon className="h-4 w-4" />الأعلى طلبًا</p><p className="mt-1 truncate text-lg font-black text-slate-900">{stats.groups[0] ? `${stats.groups[0].name} (${stats.groups[0].count})` : '—'}</p></div>
      </section>

      {stats.total === 0 ? (
        <EmptyState title="لا توجد طلبات في هذه الفترة" description="غيّر نطاق التاريخ أو فعّل تضمين الطلبات الملغاة." />
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-black text-slate-900">الإجمالي حسب {GROUP_LABEL[groupBy]}</h2>
            <div className="space-y-2">
              {stats.groups.map((group) => (
                <div key={group.name} className="flex items-center gap-3 text-xs">
                  <span className="w-40 shrink-0 truncate font-bold text-slate-700 sm:w-56">{group.name}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0f9d7a]" style={{ width: `${Math.max(4, (group.count / stats.groups[0].count) * 100)}%` }} /></div>
                  <span className="w-20 shrink-0 text-left font-black text-slate-900" dir="ltr">{group.count} · {Math.round((group.count / stats.total) * 100)}%</span>
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 p-4 text-sm font-black text-slate-900">الطلبات لكل يوم حسب {GROUP_LABEL[groupBy]}</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-right text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="sticky right-0 bg-slate-50 px-3 py-3 font-black">اليوم</th>
                    {stats.groups.map((group) => <th key={group.name} className="whitespace-nowrap px-3 py-3 font-bold">{group.name}</th>)}
                    <th className="px-3 py-3 font-black text-[#0f9d7a]">المجموع</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.days.map((row) => (
                    <tr key={row.day} className="border-t border-slate-100 hover:bg-emerald-50/30">
                      <td className="sticky right-0 whitespace-nowrap bg-white px-3 py-2.5 font-bold text-slate-800">{formatDayLabel(row.day)}</td>
                      {stats.groups.map((group) => {
                        const count = row.map.get(group.name) || 0;
                        return <td key={group.name} className={`px-3 py-2.5 text-center ${count ? 'font-black text-slate-900' : 'text-slate-300'}`}>{count || '·'}</td>;
                      })}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2"><span className="font-black text-[#0f9d7a]">{row.total}</span><div className="hidden h-2 w-16 overflow-hidden rounded-full bg-slate-100 sm:block"><div className="h-full bg-[#0f9d7a]" style={{ width: `${(row.total / (stats.maxDay || 1)) * 100}%` }} /></div></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-black">
                  <tr>
                    <td className="sticky right-0 bg-slate-50 px-3 py-3">المجموع</td>
                    {stats.groups.map((group) => <td key={group.name} className="px-3 py-3 text-center">{group.count}</td>)}
                    <td className="px-3 py-3 text-[#0f9d7a]">{stats.total}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
