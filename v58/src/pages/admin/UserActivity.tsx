import React, { useEffect, useState } from 'react';
import { Activity, MonitorSmartphone, RefreshCw, ShieldCheck } from 'lucide-react';
import { getUsers } from '../../services/dataStorage';
import { useAuthStore } from '../../store/useAuthStore';
import type { UserProfile } from '../../types';

export const UserActivity: React.FC = () => {
  const current = useAuthStore((state) => state.user);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try { setUsers((await getUsers()).filter((u) => (u.loginCount || u.lastActive || u.deviceIds?.length))); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (current?.role === 'admin') void load(); }, [current?.role]);
  if (current?.role !== 'admin') return null;
  return <div dir="rtl" className="mx-auto max-w-6xl space-y-5 p-3 sm:p-6">
    <header className="rounded-3xl bg-gradient-to-br from-[#0f9d7a] to-[#073b4c] p-6 text-white">
      <div className="flex items-center gap-2 text-emerald-100"><Activity className="h-5 w-5"/><span className="text-xs font-bold">الأمان والحسابات</span></div>
      <h1 className="mt-2 text-2xl font-black">نشاط المستخدمين والأجهزة</h1>
      <p className="mt-2 text-sm leading-6 text-white/80">يعرض آخر نشاط وعدد مرات الدخول ومعرّفات أجهزة عشوائية مجهولة، دون جمع بصمة جهاز أو معلومات تعريفية عنه.</p>
    </header>
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-950"><ShieldCheck className="mt-1 h-5 w-5 shrink-0"/><p><b>حدود الجلسات:</b> Firebase لا يتيح من واجهة العميل عرض الجلسات النشطة الأخرى أو تسجيل خروجها عن بُعد. هذه القائمة سجل للأجهزة التي سجلت الدخول وليست قائمة جلسات مؤكدة النشاط. يمكن للمستخدم تسجيل الخروج من جهازه الحالي من حسابه.</p></div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b p-4"><h2 className="font-black">الحسابات ذات نشاط مسجل</h2><button onClick={() => void load()} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"><RefreshCw className="h-4 w-4"/>تحديث</button></div>
      {loading ? <p className="p-6 text-sm text-slate-500">جارٍ تحميل البيانات…</p> : users.length === 0 ? <p className="p-6 text-sm text-slate-500">لا توجد بيانات نشاط بعد.</p> : <div className="divide-y">{users.map((u) => {
        const lastActiveMs = u.lastActive ? new Date(u.lastActive).getTime() : 0;
        const recentHeartbeat = lastActiveMs > 0 && Date.now() - lastActiveMs <= 7 * 60 * 1000;
        return <article key={u.uid} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <div><b className="block text-sm">{u.pharmacyName || u.name || u.email}</b><span className="text-xs text-slate-500">{u.email} · {u.role}</span><div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600"><span>الدخول: {u.loginCount || 0}</span><span>آخر دخول: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ar') : '—'}</span><span>آخر نبضة نشاط: {u.lastActive ? new Date(u.lastActive).toLocaleString('ar') : '—'}</span><span className={`rounded-full px-2 py-1 font-bold ${recentHeartbeat ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{recentHeartbeat ? 'نبضة حديثة · مؤشر فقط' : 'لا توجد نبضة حديثة'}</span></div></div>
          <div className="flex items-center gap-2 text-xs text-slate-500"><MonitorSmartphone className="h-4 w-4"/>{u.deviceIds?.length || 0} جهاز معروف</div>
          {!!u.deviceIds?.length && <div className="md:col-span-2 flex flex-wrap gap-2">{u.deviceIds.map((id) => <code key={id} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{id.slice(0, 8)}…</code>)}</div>}
        </article>;
      })}</div>}
    </section>
  </div>;
};
