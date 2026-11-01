import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, History, LayoutTemplate, RotateCcw, Save, Star, BellRing, UserRound } from 'lucide-react';
import { getSystemSettings, updateSystemSettings } from '../../services/dataStorage';
import { CardDetailKey, CardTitleKey, ProductCardConfig } from '../../types';
import { DEFAULT_PRODUCT_CARD_CONFIG, normalizeProductCardConfig, productCardTitle } from '../../utils/productCatalog';
import { useToastStore } from '../../store/useToastStore';

const TITLE_LABELS: Record<CardTitleKey, string> = {
  tradeName: 'اسم الدواء',
  strength: 'التركيز',
  form: 'الشكل الدوائي',
  packSize: 'العبوة',
  manufacturer: 'الشركة',
};
const DETAIL_LABELS: Record<CardDetailKey, string> = {
  activeIngredient: 'المادة الفعالة',
  manufacturer: 'الشركة المصنعة',
  packSize: 'العبوة',
  category: 'التصنيف',
  trend: 'اتجاه السعر (ارتفع/انخفض)',
};
const SEPARATORS = [
  { value: ' ', label: 'مسافة' },
  { value: ' - ', label: 'شرطة ( - )' },
  { value: ' | ', label: 'خط ( | )' },
  { value: ' · ', label: 'نقطة ( · )' },
  { value: '، ', label: 'فاصلة ( ، )' },
];
const SAMPLE = { tradeName: 'Acretin', strength: '0.025%', form: 'كريم', packSize: '30g', manufacturer: 'شركة الشرق', category: 'جلدية', ingredient: 'Tretinoin' };
const panel = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';

function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export const CardSettings: React.FC = () => {
  const { success, error } = useToastStore();
  const [config, setConfig] = useState<ProductCardConfig>(DEFAULT_PRODUCT_CARD_CONFIG);
  const [adminName, setAdminName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSystemSettings()
      .then((settings) => {
        setConfig(normalizeProductCardConfig(settings.productCardConfig));
        setAdminName(settings.adminDisplayName || '');
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const title = useMemo(() => productCardTitle(SAMPLE, config) || '—', [config]);

  const save = async () => {
    setSaving(true);
    try {
      await updateSystemSettings({ productCardConfig: config, adminDisplayName: adminName.trim() });
      success('تم حفظ إعدادات الكرت واسم الإدارة. تظهر للمستخدمين فور تحديث الصفحة.');
    } catch (e: any) {
      error(e?.message || 'تعذر حفظ الإعدادات.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: 'showSavings' | 'showFavorite' | 'showAlert' | 'showViewButton') => setConfig((c) => ({ ...c, [key]: !c[key] }));

  if (loading) return <p className="p-10 text-center text-sm text-slate-500">جاري التحميل...</p>;

  const detailItems = config.details.filter((d) => d.visible);

  return (
    <div dir="rtl" className="mx-auto max-w-5xl space-y-5 p-3 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black text-slate-900"><LayoutTemplate className="h-6 w-6 text-[#0f9d7a]" />تخصيص كرت الصنف واسم الإدارة</h1>
          <p className="mt-1 text-xs text-slate-500">تحكم في العناصر الظاهرة في كرت الصنف وترتيبها، واسم الإدارة الظاهر عند الرفع.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setConfig(DEFAULT_PRODUCT_CARD_CONFIG)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><RotateCcw className="h-4 w-4" />الافتراضي</button>
          <button onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0f9d7a] px-4 py-2 text-xs font-black text-white hover:bg-[#0b7a5e] disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'جاري الحفظ...' : 'حفظ'}</button>
        </div>
      </header>

      <section className={panel}>
        <h2 className="mb-3 text-sm font-black text-slate-900">معاينة مباشرة</h2>
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <h3 className="flex-1 text-base font-extrabold leading-snug text-slate-900">{title}</h3>
            <div className="flex items-center gap-0.5">
              {config.showViewButton && <span className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-[#0f9d7a]"><History className="h-4 w-4" /></span>}
              {config.showFavorite && <span className="p-1.5 text-slate-300"><Star className="h-4 w-4" /></span>}
              {config.showAlert && <span className="p-1.5 text-slate-300"><BellRing className="h-4 w-4" /></span>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            {detailItems.map((item) => {
              if (item.key === 'activeIngredient') return <span key={item.key} className="text-xs font-bold text-[#0f9d7a]">{SAMPLE.ingredient}</span>;
              if (item.key === 'manufacturer') return <span key={item.key} className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5">الشركة: <strong className="text-slate-700">{SAMPLE.manufacturer}</strong></span>;
              if (item.key === 'packSize') return <span key={item.key} className="rounded-md border border-slate-100 bg-slate-50 px-2 py-0.5">العبوة: <strong className="text-slate-700">{SAMPLE.packSize}</strong></span>;
              if (item.key === 'category') return <span key={item.key} className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{SAMPLE.category}</span>;
              return <span key={item.key} className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-800">انخفض -5%</span>;
            })}
          </div>
          {config.showSavings && <div className="mt-2.5 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800"><span>فارق توفير بين المستودعات:</span><span>وفّر 2.00 ₪ (10%)</span></div>}
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className={panel}>
          <h2 className="mb-1 text-sm font-black text-slate-900">عنوان الكرت (ترتيب الاسم)</h2>
          <p className="mb-3 text-[11px] text-slate-500">رتّب أجزاء الاسم بالأسهم وأخفِ ما لا تريد ظهوره.</p>
          <ul className="space-y-1.5">
            {config.title.map((item, index) => (
              <li key={item.key} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <span className={`flex-1 text-xs font-bold ${item.visible ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{TITLE_LABELS[item.key]}</span>
                <button onClick={() => setConfig((c) => ({ ...c, title: moveItem(c.title, index, -1) }))} disabled={index === 0} className="rounded-lg p-1 text-slate-500 hover:bg-white disabled:opacity-30" aria-label="أعلى"><ArrowUp className="h-4 w-4" /></button>
                <button onClick={() => setConfig((c) => ({ ...c, title: moveItem(c.title, index, 1) }))} disabled={index === config.title.length - 1} className="rounded-lg p-1 text-slate-500 hover:bg-white disabled:opacity-30" aria-label="أسفل"><ArrowDown className="h-4 w-4" /></button>
                <button onClick={() => setConfig((c) => ({ ...c, title: c.title.map((t) => t.key === item.key ? { ...t, visible: !t.visible } : t) }))} className="rounded-lg p-1 text-slate-600 hover:bg-white" aria-label="إظهار/إخفاء">{item.visible ? <Eye className="h-4 w-4 text-[#0f9d7a]" /> : <EyeOff className="h-4 w-4" />}</button>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <label className="space-y-1"><span className="font-bold text-slate-600">الفاصل بين الأجزاء</span>
              <select value={config.titleSeparator} onChange={(e) => setConfig((c) => ({ ...c, titleSeparator: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-slate-800">
                {SEPARATORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label className="space-y-1"><span className="font-bold text-slate-600">كتابة الشكل الدوائي</span>
              <select value={config.formStyle} onChange={(e) => setConfig((c) => ({ ...c, formStyle: e.target.value as 'abbr' | 'original' }))} className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-slate-800">
                <option value="abbr">مختصر (Tab, Cap...)</option>
                <option value="original">كما هو محفوظ</option>
              </select>
            </label>
          </div>
        </section>

        <section className={panel}>
          <h2 className="mb-1 text-sm font-black text-slate-900">تفاصيل أسفل العنوان (ترتيب وإظهار)</h2>
          <p className="mb-3 text-[11px] text-slate-500">العناصر التي تظهر تحت اسم الدواء بالترتيب نفسه.</p>
          <ul className="space-y-1.5">
            {config.details.map((item, index) => (
              <li key={item.key} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <span className={`flex-1 text-xs font-bold ${item.visible ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{DETAIL_LABELS[item.key]}</span>
                <button onClick={() => setConfig((c) => ({ ...c, details: moveItem(c.details, index, -1) }))} disabled={index === 0} className="rounded-lg p-1 text-slate-500 hover:bg-white disabled:opacity-30" aria-label="أعلى"><ArrowUp className="h-4 w-4" /></button>
                <button onClick={() => setConfig((c) => ({ ...c, details: moveItem(c.details, index, 1) }))} disabled={index === config.details.length - 1} className="rounded-lg p-1 text-slate-500 hover:bg-white disabled:opacity-30" aria-label="أسفل"><ArrowDown className="h-4 w-4" /></button>
                <button onClick={() => setConfig((c) => ({ ...c, details: c.details.map((d) => d.key === item.key ? { ...d, visible: !d.visible } : d) }))} className="rounded-lg p-1 text-slate-600 hover:bg-white" aria-label="إظهار/إخفاء">{item.visible ? <Eye className="h-4 w-4 text-[#0f9d7a]" /> : <EyeOff className="h-4 w-4" />}</button>
              </li>
            ))}
          </ul>
          <h3 className="mb-2 mt-4 text-xs font-black text-slate-700">أزرار وشارات الكرت</h3>
          <div className="space-y-1.5 text-xs">
            {([
              ['showViewButton', 'أيقونة عرض الصنف وآخر التغييرات'],
              ['showFavorite', 'زر المفضلة'],
              ['showAlert', 'زر تنبيه السعر'],
              ['showSavings', 'شارة فارق التوفير بين المستودعات'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 font-bold text-slate-800">
                <span>{label}</span>
                <input type="checkbox" checked={config[key]} onChange={() => toggle(key)} className="h-4 w-4 accent-[#0f9d7a]" />
              </label>
            ))}
          </div>
        </section>
      </div>

      <section className={panel}>
        <h2 className="mb-1 flex items-center gap-2 text-sm font-black text-slate-900"><UserRound className="h-5 w-5 text-[#0f9d7a]" />اسم حساب الإدارة الظاهر للمستخدمين</h2>
        <p className="mb-3 text-[11px] text-slate-500">يظهر هذا الاسم كرافع للأسعار وفي سجل التغييرات عندما ترفع الإدارة أو تعدّل الأسعار. اتركه فارغاً لاستخدام اسم الحساب الأصلي. ينطبق على الرفع القادم فقط.</p>
        <input
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          maxLength={60}
          placeholder="مثال: إدارة فارما لينك"
          className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-[#0f9d7a]"
        />
      </section>
    </div>
  );
};
