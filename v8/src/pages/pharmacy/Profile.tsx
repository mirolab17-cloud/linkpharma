// src/pages/pharmacy/Profile.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { 
  Building, 
  MapPin, 
  Phone, 
  CheckCircle, 
  ShieldAlert, 
  ShieldCheck,
  Bell,
  CheckCircle2
} from 'lucide-react';
import { normalizeSaudiLocalPhone, isValidSaudiLocalPhone } from '../../utils/profile';
import { useToastStore } from '../../store/useToastStore';
import { getPushStatus, enablePush, PushStatus } from '../../services/push';
import { getGazaLocations } from '../../utils/gaza';
import { getSystemSettings } from '../../services/dataStorage';

export const PharmacyProfile: React.FC = () => {
  const { user, updateUserProfile } = useAuthStore();
  const navigate = useNavigate();

  // بيانات الصيدلية
  const [pharmacyName, setPharmacyName] = useState(user?.pharmacyName || '');
  const [ownerName, setOwnerName] = useState(user?.ownerName || user?.name || '');
  const [governorate, setGovernorate] = useState(user?.governorate || '');
  const [city, setCity] = useState(user?.city || '');
  const [locations, setLocations] = useState(getGazaLocations());
  const [address, setAddress] = useState(user?.address || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);

  const isFirstTime = !user?.profileComplete;
  useEffect(() => { getSystemSettings().then(s => setLocations(getGazaLocations(s.gazaLocations))).catch(() => {}); }, []);
  const cities = locations[governorate] || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pharmacyName.trim() || !ownerName.trim() || !governorate || !city || !address.trim() || !phone.trim()) {
      useToastStore.getState().error('يرجى تعبئة جميع الحقول المطلوبة.');
      return;
    }

    if (!isValidSaudiLocalPhone(phone)) {
      useToastStore.getState().error('رقم الجوال غير صالح. يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.');
      return;
    }

    setSaving(true);
    const cleaned = normalizeSaudiLocalPhone(phone);
    const success = await updateUserProfile({
      pharmacyName: pharmacyName.trim(),
      ownerName: ownerName.trim(),
      governorate,
      city,
      addressDetail: address.trim(),
      address: `قطاع غزة - ${governorate} - ${city} - ${address.trim()}`, 
      phone: cleaned,
      profileComplete: true,
    });
    setSaving(false);

    if (success && isFirstTime) {
      navigate('/app/home');
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6" dir="rtl">
      {isFirstTime && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 leading-relaxed">
            <strong className="block text-sm font-bold mb-0.5">خطوة إلزامية لإكمال الحساب:</strong>
            يرجى إكمال بيانات الصيدلية (الاسم، العنوان، ورقم الجوال) لتتمكن من الأسعار والعروض وإرسال الطلبيات للموردين عبر واتساب.
          </div>
        </div>
      )}

      {/* بطاقة معلومات الصيدلية */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex items-center gap-3 pb-6 border-b border-slate-100 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#0f9d7a] flex items-center justify-center">
            <Building className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">بيانات الصيدلية</h1>
            <p className="text-xs text-slate-500">
              هذه البيانات ستظهر للموردين في ترويسة رسائل واتساب عند إرسال الطلبيات
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              اسم الصيدلية أو الصيدلي <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                <Building className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={pharmacyName}
                onChange={(e) => setPharmacyName(e.target.value)}
                placeholder="صيدلية الشفاء أو د. محمد"
                className="w-full pr-10 pl-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a] focus:ring-1 focus:ring-[#0f9d7a]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم المالك <span className="text-rose-500">*</span></label>
            <div className="relative"><input type="text" required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="د. محمد أحمد" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm" /></div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="block text-xs font-bold text-slate-700 mb-1.5">المحافظة داخل قطاع غزة <span className="text-rose-500">*</span></label><select required value={governorate} onChange={(e) => { setGovernorate(e.target.value); setCity(''); }} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"><option value="">اختر المحافظة</option>{Object.keys(locations).map((g) => <option key={g}>{g}</option>)}</select></div>
            <div><label className="block text-xs font-bold text-slate-700 mb-1.5">المدينة / المنطقة <span className="text-rose-500">*</span></label><select required disabled={!governorate} value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"><option value="">اختر المدينة أو المنطقة</option>{cities.map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              العنوان التفصيلي <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                <MapPin className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="المدينة - الحي - اسم الشارع أو المعلم القريب"
                className="w-full pr-10 pl-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a] focus:ring-1 focus:ring-[#0f9d7a]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              رقم الجوال / الواتساب للتواصل <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                <Phone className="w-4 h-4" />
              </div>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05XXXXXXXX"
                className="w-full pr-10 pl-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a] focus:ring-1 focus:ring-[#0f9d7a]"
                dir="ltr"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              أدخل رقماً محلياً يبدأ بـ 05 ويتكون من 10 أرقام. لا يوجد تحقق SMS حالياً.
            </p>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3">
            {!isFirstTime && (
              <button
                type="button"
                onClick={() => navigate('/app/home')}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
              >
                إلغاء
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold transition shadow-xs flex items-center gap-2 active:scale-95 disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{saving ? 'جاري الحفظ...' : isFirstTime ? 'حفظ ومتابعة للمنصة' : 'حفظ التعديلات'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* بطاقة المصادقة بحساب Google المعتمد */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">المصادقة بواسطة حساب Google المعتمد</h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                آمن ونشط
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              تم تسجيل الدخول مباشرة وبشكل آمن عبر خدمة Google (<span dir="ltr">{user?.email}</span>). 
              لا يتطلب حسابك كلمة مرور خاصة بالتطبيق؛ حيث تتم حمايته ومصادقته تلقائياً وفق أعلى معايير أمان Google.
            </p>
          </div>
        </div>
      </div>

      {/* بطاقة إشعارات الجوال الفورية (OneSignal Push) */}
      <PushNotificationCard />

      {/* بطاقة الدعم الفني وتواصل المستودعات عبر واتساب */}
      <SupportContactCard user={user} />
    </div>
  );
};

const PushNotificationCard: React.FC = () => {
  const [pushStatus, setPushStatus] = useState<PushStatus>(() => getPushStatus());
  const [isEnabling, setIsEnabling] = useState(false);

  useEffect(() => {
    const updateStatus = () => setPushStatus(getPushStatus());
    window.addEventListener('focus', updateStatus);
    return () => window.removeEventListener('focus', updateStatus);
  }, []);

  const handleEnable = async () => {
    setIsEnabling(true);
    try {
      const granted = await enablePush();
      setPushStatus(getPushStatus());
      if (granted) {
        useToastStore.getState().success('تم تفعيل إشعارات الجوال بنجاح! ستصلك التنبيهات حتى والتطبيق مغلق.');
      } else {
        useToastStore.getState().error('لم يتم منح إذن الإشعارات. يرجى التحقق من إعدادات المتصفح.');
      }
    } finally {
      setIsEnabling(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-4">
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#0f9d7a] flex items-center justify-center shrink-0">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900">إشعارات الجوال الفورية (Push)</h2>
              {pushStatus.isGranted && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                  مفعّلة ✅
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              تصلك تنبيهات فورية عند انخفاض أسعار الأدوية، تغيير حالة طلبيتك، أو ورود تعميمات إدارية حتى والتطبيق مغلق.
            </p>
          </div>
        </div>
      </div>

      {pushStatus.isGranted ? (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-right">
            <div className="text-xs font-bold text-emerald-900">الإشعارات مفعّلة ✅</div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              جهازك جاهز لاستقبال الإشعارات والتنبيهات المباشرة بالوقت الفعلي حتى لو كان التطبيق مغلقاً.
            </p>
          </div>
        </div>
      ) : pushStatus.isDenied ? (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2 text-right">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>تم حظر الإشعارات من إعدادات المتصفح</span>
          </div>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            لتفعيل الإشعارات: اضغط على أيقونة القفل أو الأمان 🔒 بجانب رابط الموقع في شريط عنوان المتصفح، وقم بالسماح بخيار (الإشعارات / Notifications)، ثم أعد تحميل الصفحة.
          </p>
          <p className="text-[10px] text-amber-700 font-medium">
            📱 ملاحظة لمستخدمي iPhone: الإشعارات تعمل فقط بعد «إضافة إلى الشاشة الرئيسية» (تثبيت الـ PWA عبر متصفح Safari).
          </p>
        </div>
      ) : !pushStatus.supported ? (
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-right space-y-1">
          <p className="text-xs font-bold text-slate-800">ملاحظة لمستخدمي iPhone</p>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            📱 لتفعيل إشعارات الجوال على أجهزة iOS: افتح الرابط في Safari، اضغط على زر المشاركة أسفل الشاشة، ثم اختر «إضافة إلى الشاشة الرئيسية». بعد فتح التطبيق من الأيقونة، يمكنك تفعيل الإشعارات مباشرة.
          </p>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-right">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-800">تفعيل التنبيهات المباشرة على هذا الجهاز</div>
              <div className="text-[11px] text-slate-500 mt-0.5">يتطلب موافقة سريعة من المتصفح لمرة واحدة فقط</div>
            </div>
            <button
              type="button"
              onClick={handleEnable}
              disabled={isEnabling}
              className="px-5 py-2.5 rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold transition shadow-xs flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 cursor-pointer active:scale-95"
            >
              {isEnabling ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>جاري التفعيل...</span>
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4" />
                  <span>تفعيل إشعارات الجوال</span>
                </>
              )}
            </button>
          </div>
          <p className="text-[10px] text-slate-500 border-t border-slate-200/60 pt-2">
            📱 ملاحظة لمستخدمي iPhone: الإشعارات تعمل فقط بعد «إضافة إلى الشاشة الرئيسية» (تثبيت الـ PWA).
          </p>
        </div>
      )}
    </div>
  );
};

const SupportContactCard: React.FC<{ user: any }> = ({ user }) => {
  const [supportWhatsApp, setSupportWhatsApp] = useState('966501234567');
  const [warehouseSupportWhatsApp, setWarehouseSupportWhatsApp] = useState('966552223344');

  useEffect(() => {
    import('../../services/dataStorage').then(({ getSystemSettings }) => {
      getSystemSettings().then((sys) => {
        if (sys?.supportWhatsApp) setSupportWhatsApp(sys.supportWhatsApp);
        if (sys?.warehouseSupportWhatsApp) setWarehouseSupportWhatsApp(sys.warehouseSupportWhatsApp);
      });
    });
  }, []);

  const handleSupportWhatsApp = () => {
    const msg = `السلام عليكم ورحمة الله،
أنا الدكتور ${user?.name || ''} من صيدلية ${user?.pharmacyName || ''} (${user?.phone || ''}).
أحتاج لمساعدة بخصوص الحساب / المنصة.`;
    window.open(`https://wa.me/${supportWhatsApp}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  };

  const handleWarehouseWhatsApp = () => {
    const msg = `السلام عليكم ورحمة الله،
أنا الدكتور ${user?.name || ''} من صيدلية ${user?.pharmacyName || ''} (${user?.phone || ''}).
لدي استفسار بخصوص طلبيات وتوريد المستودعات.`;
    window.open(`https://wa.me/${warehouseSupportWhatsApp}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#0f9d7a] flex items-center justify-center">
            <Phone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">الدعم الفني وتنسيق المستودعات</h3>
            <p className="text-[11px] text-slate-500">تواصل مباشر وسريع عبر واتساب مع إدارة المنصة</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <button
          type="button"
          onClick={handleSupportWhatsApp}
          className="p-3.5 rounded-2xl bg-slate-50 hover:bg-emerald-50/70 border border-slate-200 hover:border-emerald-300 transition flex items-center justify-between group text-right"
        >
          <div>
            <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-700">دعم مدير المنصة والاشتراكات</div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5" dir="ltr">+{supportWhatsApp}</div>
          </div>
          <span className="p-2 rounded-xl bg-white text-emerald-600 shadow-2xs group-hover:bg-emerald-600 group-hover:text-white transition">
            <Phone className="w-4 h-4" />
          </span>
        </button>

        <button
          type="button"
          onClick={handleWarehouseWhatsApp}
          className="p-3.5 rounded-2xl bg-slate-50 hover:bg-teal-50/70 border border-slate-200 hover:border-teal-300 transition flex items-center justify-between group text-right"
        >
          <div>
            <div className="text-xs font-bold text-slate-900 group-hover:text-teal-700">تنسيق المستودعات والطلبيات</div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5" dir="ltr">+{warehouseSupportWhatsApp}</div>
          </div>
          <span className="p-2 rounded-xl bg-white text-teal-600 shadow-2xs group-hover:bg-teal-600 group-hover:text-white transition">
            <Phone className="w-4 h-4" />
          </span>
        </button>
      </div>
    </div>
  );
};
