import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2 } from 'lucide-react';
import { RepresentativeRequestCard } from '../../components/RepresentativeRequestCard';

export const RepresentativeRequestPage: React.FC = () => (
  <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 pb-24" dir="rtl">
    <Link to="/app/profile" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800"><ArrowRight className="h-4 w-4" />العودة إلى الملف الشخصي</Link>
    <header className="rounded-3xl bg-gradient-to-br from-teal-700 to-[#073b4c] p-6 text-white shadow-lg">
      <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15"><Building2 className="h-6 w-6" /></span><div><p className="text-xs font-bold text-teal-100">طلبات المندوبين</p><h1 className="mt-1 text-xl font-black">أنا مندوب</h1></div></div>
      <p className="mt-3 text-xs leading-6 text-white/80">أرسل طلب ربط حسابك بالمستودع الذي تمثله. صلاحيات الحساب لا تتغير إلا بعد مراجعة الإدارة والموافقة.</p>
    </header>
    <RepresentativeRequestCard />
  </div>
);
