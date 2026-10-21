import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CalendarDays, FileSpreadsheet, ShieldCheck, UserRound } from 'lucide-react';
import { getSuppliers } from '../../services/dataStorage';
import { Supplier } from '../../types';
import { useAuthStore } from '../../store/useAuthStore';

export const RepresentativeProfile: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  useEffect(() => {
    if (user?.supplierId) getSuppliers().then((items) => setSupplier(items.find((item) => item.id === user.supplierId) || null)).catch(() => setSupplier(null));
  }, [user?.supplierId]);
  if (!user || user.role !== 'representative') return null;
  const permissions = user.representativePermissions;
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-5" dir="rtl">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6"><div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#0f9d7a] flex items-center justify-center"><UserRound className="w-6 h-6" /></div><div><h1 className="text-xl font-black text-slate-900">الملف الشخصي للمندوب</h1><p className="text-xs text-slate-500 mt-1">بيانات الحساب والصلاحيات المعتمدة</p></div></div>
        <dl className="grid sm:grid-cols-2 gap-4 text-xs"><div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">الاسم</dt><dd className="font-bold text-slate-900 mt-1">{user.name}</dd></div><div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">البريد</dt><dd className="font-bold text-slate-900 mt-1" dir="ltr">{user.email}</dd></div><div className="sm:col-span-2 rounded-xl bg-slate-50 p-3"><dt className="text-slate-500 flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />المستودع المرتبط</dt><dd className="font-bold text-slate-900 mt-1">{supplier?.name || 'جارٍ التحميل أو يحتاج مراجعة الإدارة'}</dd></div></dl>
        <div className="mt-5"><h2 className="text-sm font-black text-slate-800 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#0f9d7a]" />الصلاحيات الحالية</h2><div className="mt-3 flex flex-wrap gap-2">{permissions?.managePrices && <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-[11px] font-bold text-emerald-800"><FileSpreadsheet className="inline w-3.5 h-3.5 ml-1" />رفع الأسعار</span>}{permissions?.managePromotions && <span className="rounded-full bg-sky-100 px-3 py-1.5 text-[11px] font-bold text-sky-800">إدارة العروض</span>}{permissions?.manageDeliverySchedule && <span className="rounded-full bg-amber-100 px-3 py-1.5 text-[11px] font-bold text-amber-800"><CalendarDays className="inline w-3.5 h-3.5 ml-1" />جدول التوصيل</span>}</div></div>
        <div className="mt-6 flex flex-wrap gap-2"><button onClick={() => navigate('/app/representative')} className="rounded-xl bg-[#0f9d7a] px-4 py-2.5 text-xs font-black text-white">فتح مساحة العمل</button><button onClick={() => navigate('/app/representative')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700">عرض أدوات المستودع</button></div>
      </section>
    </div>
  );
};
