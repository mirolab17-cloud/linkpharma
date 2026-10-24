// src/pages/pharmacy/Tools.tsx — v47: أدوات إضافية تمنحها الإدارة للصيدلية (رفع أسعار، إنشاء أصناف، إنشاء مواد فعالة)
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FilePlus2, FlaskConical, UploadCloud, Wrench } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import { getActiveIngredients, getProducts, getSuppliers, saveActiveIngredient, saveProduct } from '../../services/dataStorage';
import { ActiveIngredient, Product } from '../../types';
import { hasCapability, priceUploadSupplierOf } from '../../utils/pharmacyCapabilities';
import { normalizeArabic } from '../../utils/arabicNormalize';
import { SearchSelect } from '../../components/SearchSelect';
import { ImportPrices } from '../admin/ImportPrices';
import { DOSAGE_FORMS } from '../admin/Products';

type Tab = 'prices' | 'products' | 'ingredients';

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white p-3 text-sm';

const ProductCreator: React.FC<{ uid: string }> = ({ uid }) => {
  const { success, error } = useToastStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<ActiveIngredient[]>([]);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ tradeName: '', form: DOSAGE_FORMS[0] as string, strength: '', packSize: '', manufacturer: '', category: '', barcode: '', ingredientId: '' });
  const set = (key: keyof typeof f, value: string) => setF((prev) => ({ ...prev, [key]: value }));

  const load = async () => { const [p, i] = await Promise.all([getProducts(), getActiveIngredients()]); setProducts(p); setIngredients(i); };
  useEffect(() => { void load().catch(() => undefined); }, []);

  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))], [products]);
  const mine = useMemo(() => products.filter((p) => p.createdByUid === uid), [products, uid]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.tradeName.trim()) { error('اكتب اسم الصنف.'); return; }
    setSaving(true);
    try {
      await saveProduct({
        tradeName: f.tradeName.trim(), normalizedName: normalizeArabic(f.tradeName.trim()),
        form: f.form.trim(), strength: f.strength.trim(), packSize: f.packSize.trim(), manufacturer: f.manufacturer.trim(),
        category: f.category.trim() || 'عام', barcode: f.barcode.trim(),
        activeIngredientId: f.ingredientId, activeIngredientIds: f.ingredientId ? [f.ingredientId] : [],
        createdAt: new Date().toISOString(),
      });
      success('تمت إضافة الصنف. يظهر لبقية الصيدليات بعد أن تنشر الإدارة النسخة.');
      setF({ tradeName: '', form: DOSAGE_FORMS[0], strength: '', packSize: '', manufacturer: '', category: '', barcode: '', ingredientId: '' });
      await load();
    } catch (err: any) { error(err?.message || 'تعذر حفظ الصنف.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="font-black text-slate-900">إضافة صنف تجاري جديد</h2>
        <p className="text-xs leading-6 text-slate-500">تأكد أولاً أن الصنف غير موجود في صفحة الأسعار، فالنظام يرفض الأصناف المكررة (نفس الباركود أو نفس الهوية).</p>
        <input className={inputCls} placeholder="الاسم التجاري *" value={f.tradeName} onChange={(e) => set('tradeName', e.target.value)} required />
        <div className="grid gap-3 sm:grid-cols-2">
          <select className={inputCls} value={f.form} onChange={(e) => set('form', e.target.value)}>{DOSAGE_FORMS.map((x) => <option key={x}>{x}</option>)}</select>
          <input className={inputCls} placeholder="التركيز (مثال 500mg)" value={f.strength} onChange={(e) => set('strength', e.target.value)} />
          <input className={inputCls} placeholder="حجم العبوة / عدد الوحدات" value={f.packSize} onChange={(e) => set('packSize', e.target.value)} />
          <input className={inputCls} placeholder="الشركة المصنعة" value={f.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} />
          <input className={inputCls} placeholder="التصنيف" list="tools-categories" value={f.category} onChange={(e) => set('category', e.target.value)} />
          <datalist id="tools-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <input className={inputCls} placeholder="الباركود (اختياري)" value={f.barcode} onChange={(e) => set('barcode', e.target.value)} />
        </div>
        <SearchSelect label="المادة الفعالة (اختياري للمستلزمات)" placeholder="ابحث واختر مادة فعالة" options={ingredients.map((i) => ({ id: i.id, label: i.name, subLabel: i.category }))} value={f.ingredientId} onChange={(id) => set('ingredientId', id)} />
        <button type="submit" disabled={saving} className="w-full rounded-xl bg-[#0f9d7a] px-5 py-3 text-sm font-black text-white disabled:opacity-60 sm:w-auto">{saving ? 'جاري الحفظ...' : 'حفظ الصنف'}</button>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 font-black text-slate-900">أصناف أضفتها ({mine.length})</h2>
        <ul className="divide-y divide-slate-100">
          {mine.map((p) => <li key={p.id} className="py-2.5 text-sm"><b>{p.tradeName}</b> <span className="text-xs text-slate-500">{[p.strength, p.form, p.manufacturer].filter(Boolean).join(' · ')}</span></li>)}
          {!mine.length && <li className="py-6 text-center text-xs text-slate-500">لم تضف أصنافاً بعد.</li>}
        </ul>
      </section>
    </div>
  );
};

const IngredientCreator: React.FC<{ uid: string }> = ({ uid }) => {
  const { success, error } = useToastStore();
  const [items, setItems] = useState<ActiveIngredient[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const load = async () => setItems(await getActiveIngredients());
  useEffect(() => { void load().catch(() => undefined); }, []);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))], [items]);
  const mine = items.filter((i) => i.createdByUid === uid);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const norm = normalizeArabic(name.trim());
    if (!norm) { error('اكتب اسم المادة الفعالة.'); return; }
    if (items.some((i) => (i.normalizedName || normalizeArabic(i.name)) === norm)) { error('هذه المادة الفعالة موجودة مسبقاً.'); return; }
    setSaving(true);
    try {
      await saveActiveIngredient({ name: name.trim(), normalizedName: norm, category: category.trim() || 'عام' });
      success('تمت إضافة المادة الفعالة.');
      setName(''); setCategory('');
      await load();
    } catch (err: any) { error(err?.message || 'تعذر حفظ المادة الفعالة.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="font-black text-slate-900">إضافة مادة فعالة جديدة</h2>
        <input className={inputCls} placeholder="اسم المادة الفعالة *" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className={inputCls} placeholder="التصنيف الدوائي" list="tools-ing-categories" value={category} onChange={(e) => setCategory(e.target.value)} />
        <datalist id="tools-ing-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        <button type="submit" disabled={saving} className="w-full rounded-xl bg-[#0f9d7a] px-5 py-3 text-sm font-black text-white disabled:opacity-60 sm:w-auto">{saving ? 'جاري الحفظ...' : 'حفظ المادة'}</button>
      </form>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 font-black text-slate-900">مواد أضفتها ({mine.length})</h2>
        <ul className="divide-y divide-slate-100">
          {mine.map((i) => <li key={i.id} className="py-2.5 text-sm"><b>{i.name}</b> <span className="text-xs text-slate-500">{i.category}</span></li>)}
          {!mine.length && <li className="py-6 text-center text-xs text-slate-500">لم تضف مواد بعد.</li>}
        </ul>
      </section>
    </div>
  );
};

export const PharmacyTools: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const [params, setParams] = useSearchParams();
  const [supplierName, setSupplierName] = useState('');
  const uploadSupplierId = priceUploadSupplierOf(user);

  const tabs = useMemo(() => [
    ...(uploadSupplierId ? [{ id: 'prices' as Tab, label: 'رفع الأسعار', icon: UploadCloud }] : []),
    ...(hasCapability(user, 'createProducts') ? [{ id: 'products' as Tab, label: 'إضافة صنف', icon: FilePlus2 }] : []),
    ...(hasCapability(user, 'createIngredients') ? [{ id: 'ingredients' as Tab, label: 'إضافة مادة فعالة', icon: FlaskConical }] : []),
  ], [user, uploadSupplierId]);

  useEffect(() => {
    if (!uploadSupplierId) return;
    void getSuppliers().then((all) => setSupplierName(all.find((s) => s.id === uploadSupplierId)?.name || '')).catch(() => undefined);
  }, [uploadSupplierId]);

  if (!user) return null;
  if (!tabs.length) {
    return <div className="mx-auto max-w-3xl p-6 text-center text-sm text-slate-600" dir="rtl">لم تمنحك الإدارة أدوات إضافية بعد.</div>;
  }
  const requested = params.get('tab') as Tab | null;
  const active = tabs.find((tab) => tab.id === requested)?.id || tabs[0].id;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 pb-24 sm:p-6 md:pb-6" dir="rtl">
      <header className="rounded-3xl bg-gradient-to-br from-emerald-800 to-teal-700 p-6 text-white">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-100"><Wrench className="h-4 w-4" />أدواتي</div>
        <h1 className="mt-2 text-2xl font-black">أدوات منحتها لك الإدارة</h1>
        <p className="mt-1 text-xs text-emerald-50">كل ما تفعله هنا يُسجَّل باسم حسابك.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} type="button" onClick={() => setParams({ tab: tab.id }, { replace: true })}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black ${active === tab.id ? 'bg-[#0f9d7a] text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
              <Icon className="h-4 w-4" />{tab.label}
            </button>
          );
        })}
      </div>

      {active === 'prices' && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 sm:p-5">
          <p className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900">
            ترفع هنا أسعار {supplierName ? <b>{supplierName}</b> : 'المستودع المحدد لك'} فقط. لا يمكن إنشاء أصناف أو تعديل البونص من هذه الشاشة.
          </p>
          <ImportPrices />
        </section>
      )}
      {active === 'products' && <ProductCreator uid={user.uid} />}
      {active === 'ingredients' && <IngredientCreator uid={user.uid} />}
    </div>
  );
};
