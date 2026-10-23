import { getSystemSettings, updateSystemSettings } from './dataStorage';
export type SubscriptionGate = 'trial' | 'expired' | 'suspended' | 'pending';

export interface SubscriptionPlan {
  id: string;
  name: string;
  period: string;
  price: string;
  originalPrice?: string;
  badge?: string;
  savings?: string;
  features: string[];
  enabled: boolean;
}

export interface SubscriptionExperience {
  eyebrow: string;
  title: string;
  description: string;
  primaryCta: string;
  secondaryCta: string;
  whatsappTemplate: string;
  showPlans: boolean;
  showStats: boolean;
}

export interface SubscriptionPolicy {
  version: 1;
  currency: string;
  plans: SubscriptionPlan[];
  experiences: Record<SubscriptionGate, SubscriptionExperience>;
}

const STORAGE_KEY = 'linkpharma:v40:subscription-policy';

export const defaultSubscriptionPolicy: SubscriptionPolicy = {
  version: 1,
  currency: '₪',
  plans: [
    { id: 'monthly', name: 'الباقة الشهرية', period: 'شهرياً', price: '199 ₪', enabled: true, features: ['أسعار جميع المستودعات', 'طلبيات مباشرة عبر واتساب', 'تحديثات الأسعار والعروض', 'دعم فني سريع'] },
    { id: 'quarterly', name: 'باقة 3 أشهر', period: 'لكل 3 أشهر', price: '479 ₪', originalPrice: '597 ₪', badge: 'الأكثر طلباً', savings: 'وفر 20%', enabled: true, features: ['كل مميزات الباقة الشهرية', 'توفير 20% مقارنة بالشهري', 'تنبيهات العروض الحصرية', 'أولوية معالجة الطلبيات'] },
    { id: 'yearly', name: 'الباقة السنوية', period: 'سنوياً', price: '1,490 ₪', originalPrice: '2,388 ₪', badge: 'أكبر توفير', savings: 'وفر 38%', enabled: true, features: ['استقرار سنوي دون انقطاع', 'أفضل سعر للصيدلية', 'تقارير التوفير الشهرية', 'مدير حساب ودعم مخصص'] },
  ],
  experiences: {
    trial: { eyebrow: 'انتهت الفترة التجريبية', title: 'جاهز لتحويل صيدليتك إلى قرارات أذكى؟', description: 'اختر الباقة المناسبة واستمر في الوصول إلى الأسعار والعروض من المستودعات المعتمدة.', primaryCta: 'تواصل للتفعيل', secondaryCta: 'تسجيل الخروج', whatsappTemplate: 'السلام عليكم، أرغب في تفعيل اشتراك صيدليتي في Link Pharma.', showPlans: true, showStats: true },
    expired: { eyebrow: 'الاشتراك يحتاج إلى تجديد', title: 'أسعارك وفرص التوفير ما زالت بانتظارك', description: 'جدّد اشتراكك الآن واستعد المقارنة الذكية بين الموردين وإدارة طلبياتك بسهولة.', primaryCta: 'تجديد عبر واتساب', secondaryCta: 'تسجيل الخروج', whatsappTemplate: 'السلام عليكم، أرغب في تجديد اشتراك صيدليتي في Link Pharma.', showPlans: true, showStats: true },
    suspended: { eyebrow: 'الحساب موقوف مؤقتاً', title: 'نحتاج إلى مساعدتك لإعادة تفعيل الحساب', description: 'تواصل مع فريق الدعم لمراجعة حالة الحساب وإعادة فتح الوصول إلى المنصة.', primaryCta: 'التواصل مع الدعم', secondaryCta: 'تسجيل الخروج', whatsappTemplate: 'السلام عليكم، أحتاج إلى مراجعة حالة حساب صيدليتي في Link Pharma.', showPlans: false, showStats: false },
    pending: { eyebrow: 'الطلب قيد المراجعة', title: 'نراجع بيانات صيدليتك بعناية', description: 'سيظهر لك الوصول الكامل فور اعتماد الحساب من فريق Link Pharma.', primaryCta: 'تواصل مع الدعم', secondaryCta: 'تسجيل الخروج', whatsappTemplate: 'السلام عليكم، أود الاستفسار عن حالة طلب اعتماد صيدليتي في Link Pharma.', showPlans: false, showStats: false },
  },
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function getSubscriptionPolicy(): SubscriptionPolicy {
  if (typeof window === 'undefined') return clone(defaultSubscriptionPolicy);
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return clone(defaultSubscriptionPolicy);
    return { ...clone(defaultSubscriptionPolicy), ...JSON.parse(saved) };
  } catch { return clone(defaultSubscriptionPolicy); }
}

export async function loadSubscriptionPolicy(): Promise<SubscriptionPolicy> {
  const local = getSubscriptionPolicy();
  try {
    const settings = await getSystemSettings();
    const remote = (settings as any).subscriptionPolicy;
    if (remote && Array.isArray(remote.plans) && remote.experiences) {
      const merged = { ...clone(defaultSubscriptionPolicy), ...remote } as SubscriptionPolicy;
      if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }
  } catch (error) {
    console.warn('[subscription-policy] remote load unavailable', error);
  }
  return local;
}

export async function saveSubscriptionPolicy(policy: SubscriptionPolicy): Promise<void> {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
  try { await updateSystemSettings({ subscriptionPolicy: policy } as any); }
  catch (error) { console.warn('[subscription-policy] remote save unavailable', error); }
}

export function resetSubscriptionPolicy(): SubscriptionPolicy {
  const policy = clone(defaultSubscriptionPolicy);
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
  return policy;
}
