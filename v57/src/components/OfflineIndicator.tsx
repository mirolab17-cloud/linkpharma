import React, { useEffect, useState } from 'react';
import { BrandMark } from './BrandLogo';
import { WifiOff, RefreshCw } from 'lucide-react';
export const OfflineIndicator: React.FC = () => {
 const [offline,setOffline]=useState(typeof navigator !== 'undefined' && !navigator.onLine);
 useEffect(()=>{const on=()=>setOffline(false), off=()=>setOffline(true); addEventListener('online',on); addEventListener('offline',off); return()=>{removeEventListener('online',on);removeEventListener('offline',off)}},[]);
 if(!offline) return null;
 return <div dir="rtl" className="fixed inset-0 z-[100] bg-slate-50 flex items-center justify-center p-6 text-center">
  <div className="max-w-sm w-full bg-white border border-slate-200 rounded-3xl p-8 shadow-xl">
   <div className="mx-auto mb-4 flex justify-center"><BrandMark size={56}/></div>
   <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center"><WifiOff className="w-6 h-6"/></div>
   <h1 className="text-2xl font-black text-slate-900">فارما لينك غير متاحة حالياً</h1>
   <p className="mt-3 text-sm leading-7 text-slate-500">لا يوجد اتصال بالإنترنت. التطبيق يعمل أونلاين فقط، أعد الاتصال ثم حاول مرة أخرى.</p>
   <button onClick={()=>location.reload()} className="mt-6 w-full rounded-xl bg-[#0f9d7a] text-white py-3 text-sm font-black"><RefreshCw className="inline w-4 ml-2"/>إعادة المحاولة</button>
  </div></div>;
};
