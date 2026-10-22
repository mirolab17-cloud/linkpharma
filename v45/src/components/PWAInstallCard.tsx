import React, { useState } from 'react';
import { Download, ExternalLink, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { ActionButton } from './designSystem';

export const PWAInstallCard: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  if (isInstalled) return null;
  const canInstall = isInstallable || isIOS;
  if (!canInstall) return <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4" dir="rtl"><div className="flex items-start gap-3"><Smartphone className="mt-0.5 h-5 w-5 text-slate-400" /><div><h2 className="text-sm font-black text-slate-800">تطبيق فارما لينك جاهز للتثبيت</h2><p className="mt-1 text-xs leading-6 text-slate-500">إذا ظهر رمز التثبيت في شريط المتصفح يمكنك إضافته للشاشة الرئيسية للوصول الأسرع والعمل بإحساس التطبيق.</p></div></div></section>;
  return <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm" dir="rtl"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-[#0f9d7a]"><Download className="h-5 w-5" /></span><div><h2 className="text-sm font-black text-emerald-950">ثبّت فارما لينك على جهازك</h2><p className="mt-1 max-w-xl text-xs leading-6 text-emerald-800">نقرة واحدة تضع المنصة على الشاشة الرئيسية لتفتح طلباتك وأسعارك بسرعة، مع بقاء حسابك وبياناتك محفوظة بأمان.</p></div></div>{isInstallable ? <ActionButton onClick={() => void install()}><Download className="ml-1 inline h-4 w-4" />تثبيت التطبيق</ActionButton> : <ActionButton tone="neutral" onClick={() => setShowGuide(true)}><ExternalLink className="ml-1 inline h-4 w-4" />طريقة التثبيت</ActionButton>}</div>{showGuide && <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3 text-xs leading-6 text-slate-700">في Safari اضغط <strong>مشاركة</strong> ثم اختر <strong>إضافة إلى الشاشة الرئيسية</strong>. في Chrome افتح قائمة المتصفح واختر <strong>تثبيت التطبيق</strong> أو <strong>إضافة إلى الشاشة الرئيسية</strong>.</div>}</section>;
};
