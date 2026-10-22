import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Building2, Lightbulb, MapPin, Pencil, Phone, UserRound, UserRoundCheck } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { getSystemSettings } from '../../services/dataStorage';
import { formatBranchAddress } from '../../utils/gaza';
import { PWAInstallCard } from '../../components/PWAInstallCard';

export const PharmacyProfile: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const [supportPhone, setSupportPhone] = useState('970599999999');
  const isComplete = Boolean(user?.profileComplete);

  useEffect(() => {
    let active = true;
    void getSystemSettings().then((settings) => {
      if (active && settings.supportWhatsApp) setSupportPhone(settings.supportWhatsApp);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!user) return null;
  const pharmacyName = user.pharmacyName || 'بيانات الصيدلية غير مكتملة';
  const ownerName = user.ownerName || user.name || '—';
  const defaultBranch = user.branches?.find((branch) => branch.id === user.defaultBranchId) || user.branches?.[0];
  const defaultAddress = defaultBranch ? formatBranchAddress(defaultBranch) : [user.governorate, user.city, user.street, user.addressDetail].filter(Boolean).join(' - ');
  const supportMessage = `السلام عليكم، أنا ${ownerName} من ${user.pharmacyName || 'الصيدلية'} وأحتاج مساعدة في المنصة.`;
  const supportUrl = `https://wa.me/${supportPhone.replace(/\D/g, '')}?text=${encodeURIComponent(supportMessage)}`;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 pb-24" dir="rtl">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f9d7a] via-[#087e6c] to-[#073b4c] p-6 text-white shadow-lg sm:p-8">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20"><Building2 className="h-7 w-7" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-emerald-100">ملف الصيدلية</p>
            <h1 className="mt-1 truncate text-2xl font-black">{pharmacyName}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-white/85"><UserRound className="h-4 w-4" />المالك: {ownerName}</p>
          </div>
        </div>
        {!isComplete && <p className="mt-5 rounded-2xl border border-amber-200/40 bg-amber-100/15 p-3 text-xs leading-6 text-amber-50">أكمل بيانات الصيدلية حتى تتمكن من استخدام المنصة وإرسال الطلبات.</p>}
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link to="/app/profile/edit" className="group flex min-h-24 items-center justify-between rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md">
          <span className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-[#0f9d7a]"><Pencil className="h-5 w-5" /></span><span><strong className="block text-sm font-black text-slate-900">تعديل بياناتي</strong><small className="mt-1 block text-xs text-slate-500">تحديث معلومات الصيدلية والفروع ({user.branches?.length || 0} فرع)</small></span></span><ArrowLeft className="h-4 w-4 text-slate-400 transition group-hover:-translate-x-1 group-hover:text-emerald-700" />
        </Link>
        <Link to="/app/representative-request" className="group flex min-h-24 items-center justify-between rounded-2xl border border-teal-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-400 hover:shadow-md">
          <span className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-teal-50 text-teal-700"><UserRoundCheck className="h-5 w-5" /></span><span><strong className="block text-sm font-black text-slate-900">أنا مندوب</strong><small className="mt-1 block text-xs text-slate-500">طلب ربط حسابك بمستودع</small></span></span><ArrowLeft className="h-4 w-4 text-slate-400 transition group-hover:-translate-x-1 group-hover:text-teal-700" />
        </Link>
        <Link to="/app/suggestions" className="group flex min-h-20 items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md sm:col-span-2">
          <span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><Lightbulb className="h-5 w-5" /></span><span><strong className="block text-sm font-black text-slate-900">الاقتراحات والملاحظات</strong><small className="mt-1 block text-xs text-slate-500">أرسل اقتراحك من الصفحة المخصصة</small></span></span><ArrowLeft className="h-4 w-4 text-slate-400 transition group-hover:-translate-x-1" />
        </Link>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-900">بيانات الحساب</h2>
        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-slate-700"><UserRound className="h-4 w-4 text-emerald-700" />{ownerName}</div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-slate-700"><Phone className="h-4 w-4 text-emerald-700" /><span dir="ltr">{user.phone || '—'}</span></div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-slate-700"><MapPin className="h-4 w-4 text-emerald-700" /><span>{defaultBranch ? `الفرع الافتراضي: ${defaultBranch.name} · ${defaultAddress}` : defaultAddress || 'الموقع غير محدد'}</span></div><div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-slate-700"><Building2 className="h-4 w-4 text-emerald-700" />عدد الفروع: {user.branches?.length || 0}</div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-slate-700"><Building2 className="h-4 w-4 text-emerald-700" />{pharmacyName}</div>
        </div>
      </section>

      <PWAInstallCard />

      <a href={supportUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-right transition hover:bg-emerald-100">
        <span><strong className="block text-sm font-black text-emerald-950">دعم مدير المنصة</strong><small className="mt-1 block text-xs text-emerald-800">تواصل مباشر عبر واتساب · <span dir="ltr">+{supportPhone}</span></small></span><Phone className="h-5 w-5 text-emerald-700" />
      </a>
    </div>
  );
};
