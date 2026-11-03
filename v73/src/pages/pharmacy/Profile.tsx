import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bell, Building2, CalendarClock, Lightbulb, MapPin, Pencil, Phone, UserRound, UserRoundCheck } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { getSystemSettings } from '../../services/dataStorage';
import { formatBranchAddress } from '../../utils/gaza';
import { PWAInstallCard } from '../../components/PWAInstallCard';
import { PlatformShareCard } from '../../components/PlatformShareCard';

export const PharmacyProfile: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const getRemainingDays = useAuthStore((state) => state.getRemainingDays);
  const isExpired = useAuthStore((state) => state.isExpired);
  const [supportPhone, setSupportPhone] = useState('970599999999');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported');
  const [notificationBusy, setNotificationBusy] = useState(false);
  const isComplete = Boolean(user?.profileComplete);
  const enableNotifications = async () => {
    if (!(typeof window !== 'undefined' && 'Notification' in window)) { setNotificationPermission('unsupported'); return; }
    if (Notification.permission === 'denied') { setNotificationPermission('denied'); return; }
    if (Notification.permission === 'granted') { setNotificationPermission('granted'); return; }
    setNotificationBusy(true);
    try { setNotificationPermission(await Notification.requestPermission()); }
    catch { setNotificationPermission(Notification.permission); }
    finally { setNotificationBusy(false); }
  };

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
  const expiryMillis = user.subscriptionExpiresAtMillis || (user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).getTime() : 0);
  const remainingDays = getRemainingDays();
  const expired = isExpired();
  const subscriptionLabel = user.subscriptionStatus === 'trial' ? 'فترة تجريبية' : user.subscriptionStatus === 'active' ? 'اشتراك فعّال' : 'اشتراك';
  const daysText = remainingDays === 1 ? 'يوم واحد' : remainingDays === 2 ? 'يومان' : `${remainingDays} يومًا`;
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

      {user.role === 'pharmacy' && (
        <section className={`rounded-2xl border p-5 shadow-sm ${expired || remainingDays <= 3 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <div className="flex items-center gap-3">
            <span className={`grid h-11 w-11 place-items-center rounded-xl ${expired || remainingDays <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-[#0f9d7a]'}`}><CalendarClock className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-600">{subscriptionLabel} · الأيام المتبقية</p>
              <p className="mt-0.5 text-2xl font-black text-slate-900">{!expiryMillis ? 'غير محدد' : expired ? 'انتهى الاشتراك' : daysText}</p>
              {expiryMillis > 0 && <p className="mt-0.5 text-[11px] text-slate-500">ينتهي في {new Date(expiryMillis).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' })}</p>}
            </div>
          </div>
        </section>
      )}

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

      <PlatformShareCard />

      <section className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-sky-700"><Bell className="h-5 w-5" /></span>
          <div><h2 className="text-sm font-black text-slate-900">ابقَ على اطلاع بكل جديد</h2><p className="mt-1 text-xs leading-5 text-slate-600">فعّل إشعارات المتصفح لتصلك التنبيهات المهمة وتحديثات حسابك فور توفرها.</p>
            {notificationPermission === 'granted' && <p className="mt-1 text-xs font-bold text-emerald-700">إذن الإشعارات مفعّل على هذا الجهاز.</p>}
            {notificationPermission === 'denied' && <p className="mt-1 text-xs font-bold text-amber-700">سبق رفض الإذن. يمكنك تغييره من إعدادات الموقع في المتصفح؛ لن نكرر طلبه.</p>}
            {notificationPermission === 'unsupported' && <p className="mt-1 text-xs text-slate-500">هذا المتصفح لا يدعم إشعارات الويب.</p>}
          </div>
        </div>
        <button type="button" onClick={() => void enableNotifications()} disabled={notificationBusy || notificationPermission !== 'default'} className="shrink-0 rounded-xl bg-sky-700 px-4 py-2.5 text-xs font-black text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">{notificationBusy ? 'جارٍ طلب الإذن…' : 'تفعيل الإشعارات'}</button>
      </section>
      <PWAInstallCard />

      <a href={supportUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-right transition hover:bg-emerald-100">
        <span><strong className="block text-sm font-black text-emerald-950">دعم مدير المنصة</strong><small className="mt-1 block text-xs text-emerald-800">تواصل مباشر عبر واتساب · <span dir="ltr">+{supportPhone}</span></small></span><Phone className="h-5 w-5 text-emerald-700" />
      </a>
    </div>
  );
};
