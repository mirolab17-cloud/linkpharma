import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { FlaskConical, PackagePlus, Save, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import { ActiveIngredient, Product } from '../../types';
import { getActiveIngredients, saveActiveIngredient, saveProduct } from '../../services/dataStorage';
import { normalizeArabic } from '../../utils/arabicNormalize';

export const CatalogTools: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const permissions = user?.pharmacyCatalogPermissions;
  const { success, error } = useToastStore();
  const [ingredients, setIngredients] = useState<ActiveIngredient[]>([]);
  const [name, setName] = useState('');
  const [ingredientCategory, setIngredientCategory] = useState('عام');
  const [tradeName, setTradeName] = useState('');
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [form, setForm] = useState('');
  const [strength, setStrength] = useState('');
  const [packSize, setPackSize] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [category, setCategory] = useState('عام');
  const [saving, setSaving] = useState(false);

  useEffect(() => { void getActiveIngredients().then(setIngredients).catch(() => error('تعذر تحميل المواد الفعالة.')); }, [error]);
  if (!user || user.role !== 'pharmacy') return <Navigate to="/app/home" replace/>;
  if (!permissions?.createProducts && !permissions?.createActiveIngredients) return <Navigate to="/app/home" replace/>;

  const submitIngredient = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!permissions?.createActiveIngredients) return error('لا تملك صلاحية إنشاء المواد الفعالة.');
    if (!name.trim()) return error('اكتب اسم المادة الفعالة.');
    setSaving(true);
    try {
      const saved = await saveActiveIngredient({ name: name.trim(), normalizedName: normalizeArabic(name.trim()), category: ingredientCategory.trim() || 'عام' });
      setIngredients((old) => [saved, ...old.filter((row) => row.id !== saved.id)]);
      setSelectedIngredients((old) => [...new Set([...old, saved.id])]);
      setName('');
      success('تمت إضافة المادة الفعالة.');
    } catch (cause) { error(cause instanceof Error ? cause.message : 'تعذر حفظ المادة الفعالة.'); }
    finally { setSaving(false); }
  };

  const submitProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!permissions?.createProducts) return error('لا تملك صلاحية إنشاء الأصناف.');
    if (!tradeName.trim()) return error('اكتب اسم الصنف.');
    setSaving(true);
    try {
      const product: Omit<Product, 'id'> = {
        tradeName: tradeName.trim(), normalizedName: normalizeArabic(tradeName.trim()),
        activeIngredientId: selectedIngredients[0] || '', activeIngredientIds: selectedIngredients,
        form: form.trim(), strength: strength.trim(), packSize: packSize.trim(), manufacturer: manufacturer.trim(), category: category.trim() || 'عام',
        productType: selectedIngredients.length ? 'medicine' : 'other', createdAt: new Date().toISOString(),
      };
      await saveProduct(product);
      setTradeName(''); setForm(''); setStrength(''); setPackSize(''); setManufacturer(''); setSelectedIngredients([]);
      success('تم إنشاء الصنف. سيظهر للصيدليات عند توفر سعر معتمد ما لم يكن مخفياً من الإدارة.');
    } catch (cause) { error(cause instanceof Error ? cause.message : 'تعذر إنشاء الصنف.'); }
    finally { setSaving(false); }
  };

  const toggleIngredient = (id: string) => setSelectedIngredients((old) => old.includes(id) ? old.filter((item) => item !== id) : [...old, id]);
  return <div className="mx-auto max-w-5xl space-y-5 pb-20" dir="rtl">
    <header className="rounded-3xl bg-gradient-to-l from-[#073b4c] to-[#0f9d7a] p-5 text-white shadow-lg"><h1 className="flex items-center gap-2 text-2xl font-black"><ShieldCheck className="h-6 w-6"/>أدوات الكتالوج للصيدلية</h1><p className="mt-2 text-xs leading-6 text-white/85">يمكنك إضافة البيانات التي سمحت بها الإدارة فقط. الصلاحيات هنا للإنشاء؛ لا تتيح تعديل أو حذف سجلات الكتالوج الموجودة.</p></header>
    <div className="grid gap-5 md:grid-cols-2">
      {permissions.createActiveIngredients && <form onSubmit={(event) => void submitIngredient(event)} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 text-base font-black"><FlaskConical className="h-5 w-5 text-emerald-700"/>إضافة مادة فعالة</h2><label className="block text-xs font-bold">اسم المادة<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required className="mt-1.5 w-full rounded-xl border p-3 text-sm" placeholder="مثال: Paracetamol"/></label><label className="block text-xs font-bold">التصنيف<input value={ingredientCategory} onChange={(event) => setIngredientCategory(event.target.value)} maxLength={80} className="mt-1.5 w-full rounded-xl border p-3 text-sm"/></label><button disabled={saving} className="min-h-11 w-full rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white disabled:opacity-50"><Save className="ml-1 inline h-4 w-4"/>{saving ? 'جارٍ الحفظ...' : 'إضافة المادة'}</button></form>}
      {permissions.createProducts && <form onSubmit={(event) => void submitProduct(event)} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 text-base font-black"><PackagePlus className="h-5 w-5 text-emerald-700"/>إنشاء صنف</h2><label className="block text-xs font-bold">اسم الصنف<input value={tradeName} onChange={(event) => setTradeName(event.target.value)} maxLength={160} required className="mt-1.5 w-full rounded-xl border p-3 text-sm"/></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold">الشكل الصيدلاني<input value={form} onChange={(event) => setForm(event.target.value)} className="mt-1.5 w-full rounded-xl border p-3 text-xs" placeholder="أقراص، شراب…"/></label><label className="block text-xs font-bold">التركيز<input value={strength} onChange={(event) => setStrength(event.target.value)} className="mt-1.5 w-full rounded-xl border p-3 text-xs" placeholder="500 mg"/></label><label className="block text-xs font-bold">حجم العبوة<input value={packSize} onChange={(event) => setPackSize(event.target.value)} className="mt-1.5 w-full rounded-xl border p-3 text-xs"/></label><label className="block text-xs font-bold">الشركة المصنعة<input value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} className="mt-1.5 w-full rounded-xl border p-3 text-xs"/></label></div><label className="block text-xs font-bold">التصنيف<input value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 w-full rounded-xl border p-3 text-xs"/></label><fieldset className="rounded-xl border p-3"><legend className="px-1 text-xs font-bold">المواد الفعالة (اختيار متعدد واختياري)</legend><div className="max-h-32 space-y-1 overflow-auto">{ingredients.map((item) => <label key={item.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs"><input type="checkbox" checked={selectedIngredients.includes(item.id)} onChange={() => toggleIngredient(item.id)}/>{item.name} <span className="text-slate-400">· {item.category}</span></label>)}</div>{!ingredients.length && <p className="text-[10px] text-slate-500">لا توجد مواد مسجلة. إذا كانت لديك صلاحية إنشائها، أضف المادة أولاً.</p>}</fieldset><button disabled={saving} className="min-h-11 w-full rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white disabled:opacity-50"><Save className="ml-1 inline h-4 w-4"/>{saving ? 'جارٍ الحفظ...' : 'إنشاء الصنف'}</button></form>}
    </div>
  </div>;
};
