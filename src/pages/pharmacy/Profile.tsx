// src/pages/pharmacy/Profile.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { 
  Building, 
  MapPin, 
  Phone, 
  CheckCircle, 
  ShieldAlert, 
  ShieldCheck
} from 'lucide-react';
import { isValidPhone, cleanPhone } from '../../utils/phone';
import { useToastStore } from '../../store/useToastStore';

export const PharmacyProfile: React.FC = () => {
  const { user, updateUserProfile } = useAuthStore();
  const navigate = useNavigate();

  // بيانات الصيدلية
  const [pharmacyName, setPharmacyName] = useState(user?.pharmacyName || '');
  const [address, setAddress] = useState(user?.address || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);

  const isFirstTime = !user?.profileComplete;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pharmacyName.trim() || !address.trim() || !phone.trim()) {
      useToastStore.getState().error('يرجى تعبئة جميع الحقول المطلوبة.');
      return;
    }

    if (!isValidPhone(phone)) {
      useToastStore.getState().error('رقم الجوال غير صالح. يجب أن يحتوي على 8 إلى 15 رقماً بالصيغة الدولية.');
      return;
    }

    setSaving(true);
    const cleaned = cleanPhone(phone);
    const success = await updateUserProfile({
      pharmacyName: pharmacyName.trim(),
      address: address.trim(),
      phone: cleaned,
      profileComplete: true,
    });
    setSaving(false);

    if (success && isFirstTime) {
      navigate('/app/prices');
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6" dir="rtl">
      {isFirstTime && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 leading-relaxed">
            <strong className="block text-sm font-bold mb-0.5">خطوة إلزامية لإكمال الحساب:</strong>
            يرجى إكمال بيانات الصيدلية (الاسم، العنوان، ورقم الجوال) لتتمكن من مقارنة الأسعار وإرسال الطلبيات للموردين عبر واتساب.
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
              اسم الصيدلية <span className="text-rose-500">*</span>
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
                placeholder="صيدلية الشفاء الجديدة"
                className="w-full pr-10 pl-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a] focus:ring-1 focus:ring-[#0f9d7a]"
              />
            </div>
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
                placeholder="966501234567"
                className="w-full pr-10 pl-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a] focus:ring-1 focus:ring-[#0f9d7a]"
                dir="ltr"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              أدخل الرقم بالصيغة الدولية للأرقام بدون مسافات أو علامة + (مثال: 966501234567)
            </p>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3">
            {!isFirstTime && (
              <button
                type="button"
                onClick={() => navigate('/app/prices')}
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
    </div>
  );
};
