// src/components/SubscriptionExpiredScreen.tsx
import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { getOrders, getProducts, getSuppliers } from '../services/dataStorage';
import { 
  Sparkles, 
  Check, 
  ShieldCheck, 
  TrendingUp, 
  ShoppingBag, 
  Pill, 
  Building, 
  MessageCircle, 
  LogOut,
  Clock,
  HeartHandshake
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Plan {
  id: string;
  name: string;
  period: string;
  price: string;
  originalPrice?: string;
  badge?: string;
  isPopular?: boolean;
  savings?: string;
  features: string[];
}

export const SubscriptionExpiredScreen: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const [selectedPlanId, setSelectedPlanId] = useState<string>('quarterly');
  const [stats, setStats] = useState({
    userOrdersCount: 0,
    totalProductsCount: 30,
    totalSuppliersCount: 3,
  });

  useEffect(() => {
    async function loadStats() {
      try {
        const [ordersList, prodsList, supsList] = await Promise.all([
          getOrders(),
          getProducts(),
          getSuppliers(),
        ]);
        const myOrders = ordersList.filter((o) => o.pharmacyId === user?.uid);
        setStats({
          userOrdersCount: myOrders.length,
          totalProductsCount: Math.max(prodsList.length, 30),
          totalSuppliersCount: Math.max(supsList.length, 3),
        });
      } catch (err) {
        console.error('Failed to load stats for expiry screen:', err);
      }
    }
    loadStats();
  }, [user]);

  const plans: Plan[] = [
    {
      id: 'monthly',
      name: 'الباقة الشهرية',
      period: 'شهرياً',
      price: '199 ₪',
      features: [
        'مقارنة أسعار غير محدودة لكافة المستودعات',
        'إرسال طلبيات الشراء عبر واتساب مباشرة',
        'تحديثات يومية لأسعار الأدوية والعروض',
        'دعم فني سريع',
      ],
    },
    {
      id: 'quarterly',
      name: 'باقة 3 أشهر',
      period: 'لكل 3 أشهر',
      price: '479 ₪',
      originalPrice: '597 ₪',
      badge: 'الخيار الأكثر طلباً ⭐',
      isPopular: true,
      savings: 'وفر 20%',
      features: [
        'كل مميزات الباقة الشهرية',
        'وفر 20% مقارنة بالاشتراك الشهري',
        'تنبيهات فورية بالعروض الحصرية والخصومات',
        'أولوية معالجة الطلبيات لدى المستودعات الشريكة',
      ],
    },
    {
      id: 'yearly',
      name: 'الباقة السنوية',
      period: 'سنوياً',
      price: '1,490 ₪',
      originalPrice: '2,388 ₪',
      badge: 'أكبر توفير 💎',
      savings: 'وفر 38%',
      features: [
        'استقرار سنوي بدون قلق انقطاع الخدمة',
        'وفر 38% بأفضل سعر على الإطلاق',
        'لوحة تقارير شهرية لحجم التوفير الفعلي لصيدليتك',
        'مدير حساب ومستشار دعم مخصص',
      ],
    },
  ];

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[1];

  const handleRenewViaWhatsApp = () => {
    const adminPhone = '966501234567'; // رقم إدارة المنصة المعتمد
    const textMessage = `السلام عليكم ورحمة الله،
أرغب في تجديد اشتراك صيدليتي في منصة مقارنة أسعار الأدوية:

🏥 الصيدلية: ${user?.pharmacyName || user?.name || 'صيدلية مسجلة'}
👤 المسؤول: ${user?.name || '-'}
📧 البريد: ${user?.email || '-'}
📦 الباقة المختارة: ${selectedPlan.name} (${selectedPlan.price} / ${selectedPlan.period})

يرجى تزويدي بطرق الدفع لتفعيل الحساب فوراً. شكراً لكم!`;

    const encoded = encodeURIComponent(textMessage);
    const url = `https://wa.me/${adminPhone}?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50/70 py-10 px-4 sm:px-6 lg:px-8 text-slate-800" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* شريط الإجراءات العلوي */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-xs font-bold text-slate-500">
              حساب: <strong className="text-slate-800">{user?.pharmacyName || user?.name}</strong>
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>

        {/* البطاقة الرئيسية الترحيبية */}
        <div className="bg-white rounded-3xl p-6 sm:p-10 border border-slate-200 shadow-xl text-center space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-[#0f9d7a]" />

          <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-[#0f9d7a] border border-emerald-100 flex items-center justify-center mx-auto shadow-xs">
            <Clock className="w-8 h-8 text-[#0f9d7a]" />
          </div>

          <div className="space-y-2 max-w-2xl mx-auto">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              اشتراكك انتهى... لكن أسعارك ما زالت بانتظارك
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              انتهت فترتك التجريبية في المنصة. جدّد اشتراكك الآن بلمسة واحدة للاستمرار في مقارنة أسعار كافة المستودعات والحصول على أعلى هوامش ربح لصيدليتك.
            </p>
          </div>

          {/* لوحة القيمة: ما الذي يخسره الصيدلي عند التوقف */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 text-right">
            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-100/70 text-[#0f9d7a] shrink-0 mt-0.5">
                <Pill className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">الأصناف المتاحة بالمستودعات</span>
                <span className="text-base font-black text-slate-900 block mt-0.5">
                  +{stats.totalProductsCount} صنف دوائي
                </span>
                <span className="text-[10px] text-slate-500">مع مقارنة فورية بين أفضل المستودعات</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-teal-100/70 text-teal-700 shrink-0 mt-0.5">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">متوسط نسبة التوفير</span>
                <span className="text-base font-black text-slate-900 block mt-0.5">
                  18% - 25% توفير
                </span>
                <span className="text-[10px] text-slate-500">لكل طلبية عند اختيار المورد الأرخص</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-blue-100/70 text-blue-700 shrink-0 mt-0.5">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">طلبياتك المحفوظة</span>
                <span className="text-base font-black text-slate-900 block mt-0.5">
                  {stats.userOrdersCount} طلبيات مسجلة
                </span>
                <span className="text-[10px] text-emerald-600 font-bold">محفوظة بأمان ولن تُحذف</span>
              </div>
            </div>
          </div>
        </div>

        {/* خطط وباقات الاشتراك الثلاث */}
        <div className="space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-extrabold text-slate-900">
              اختر الباقة المناسبة لصيدليتك
            </h2>
            <p className="text-xs text-slate-500">
              جميع الباقات تشمل وصولاً كاملاً وغير محدود لجميع المستودعات ومقارنة الأسعار
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isSelected = selectedPlanId === plan.id;

              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`bg-white rounded-2xl p-6 border-2 cursor-pointer transition-all flex flex-col justify-between relative shadow-xs ${
                    isSelected
                      ? 'border-[#0f9d7a] ring-4 ring-[#0f9d7a]/10 shadow-md'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* شارة التمييز */}
                  {plan.badge && (
                    <div className="absolute -top-3 right-6 bg-[#0f9d7a] text-white text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-2xs">
                      {plan.badge}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-extrabold text-base text-slate-900">
                        {plan.name}
                      </h3>
                      {plan.savings && (
                        <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md">
                          {plan.savings}
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-slate-900">{plan.price}</span>
                        <span className="text-xs text-slate-400 font-semibold">/ {plan.period}</span>
                      </div>
                      {plan.originalPrice && (
                        <span className="text-xs text-slate-400 line-through">
                          بدل {plan.originalPrice}
                        </span>
                      )}
                    </div>

                    <ul className="space-y-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                      {plan.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-[#0f9d7a] shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-5 mt-4 border-t border-slate-100">
                    <div
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold text-center transition ${
                        isSelected
                          ? 'bg-[#0f9d7a] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {isSelected ? 'الباقة المختارة' : 'اختيار هذه الباقة'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* زر التجديد عبر واتساب */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-md text-center space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-extrabold text-slate-900">
              تفعيل فوري عبر واتساب
            </h3>
            <p className="text-xs text-slate-500">
              اضغط الزر أدناه لإرسال طلب التجديد مباشرة بالباقة المختارة (<strong>{selectedPlan.name}</strong>)
            </p>
          </div>

          <button
            onClick={handleRenewViaWhatsApp}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm sm:text-base shadow-lg hover:shadow-xl transition flex items-center justify-center gap-3 mx-auto active:scale-98"
          >
            <MessageCircle className="w-5 h-5" />
            <span>جدّد الآن ({selectedPlan.price} - {selectedPlan.name})</span>
          </button>

          {/* طمأنة بخصوص البيانات */}
          <div className="pt-3 flex items-center justify-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-[#0f9d7a]" />
            <span>
              بيانات صيدليتك وسجل طلبياتك ومقارناتك محفوظة بالكامل بأمان ولن تُحذف أبداً
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
