import React from 'react';
import { Navigate } from 'react-router-dom';
import { FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { ImportPrices } from '../admin/ImportPrices';

export const PharmacyPriceManagement: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  if (!user || user.role !== 'pharmacy') return <Navigate to="/app/home" replace/>;
  if (!user.pharmacyCatalogPermissions?.managePrices) return <Navigate to="/app/home" replace/>;
  return <div className="mx-auto max-w-7xl space-y-4 pb-20" dir="rtl"><header className="rounded-3xl bg-gradient-to-l from-[#073b4c] to-[#0f9d7a] p-5 text-white shadow-lg"><h1 className="flex items-center gap-2 text-xl font-black"><ShieldCheck className="h-6 w-6"/><FileSpreadsheet className="h-5 w-5"/>رفع وتحديث الأسعار المصرّح بها</h1><p className="mt-2 text-xs leading-6 text-white/85">تستطيع رفع أسعار الموردين الذين اختارتهم الإدارة فقط. لا يمكنك حذف دفعات الأسعار أو تغيير ظهور الأصناف.</p></header><ImportPrices/></div>;
};
