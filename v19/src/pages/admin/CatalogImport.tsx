import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, Download, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { getActiveIngredients, getProducts, saveActiveIngredient, saveProduct } from '../../services/dataStorage';
import { ActiveIngredient, Product } from '../../types';
import { normalizeArabic } from '../../utils/arabicNormalize';
import { productIdentityKey } from '../../utils/productCatalog';
import { useToastStore } from '../../store/useToastStore';

const pick = (row: any, keys: string[]) => {
  const key = Object.keys(row).find((candidate) => keys.some((part) => candidate.toLowerCase().replace(/\s/g, '').includes(part)));
  return key ? String(row[key] ?? '').trim() : '';
};

export const CatalogImport: React.FC = () => {
  const { success, error } = useToastStore();
  const [tab, setTab] = useState<'ingredients' | 'products'>('ingredients');
  const [rows, setRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState('');
  const [ingredients, setIngredients] = useState<ActiveIngredient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [onlyValid, setOnlyValid] = useState(true);

  const load = async () => {
    const [loadedIngredients, loadedProducts] = await Promise.all([getActiveIngredients(), getProducts()]);
    setIngredients(loadedIngredients);
    setProducts(loadedProducts);
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await load();
    setFileName(file.name);
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    setRows(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }));
  };

  const preview: any[] = useMemo(() => rows.map((row, index) => {
    if (tab === 'ingredients') {
      const name = pick(row, ['name', 'اسم', 'ingredient', 'مادة']);
      const category = pick(row, ['category', 'تصنيف']);
      const duplicate = ingredients.some((item) => normalizeArabic(item.name) === normalizeArabic(name));
      return { index, name, category, valid: Boolean(name && category && !duplicate), reason: !name ? 'اسم ناقص' : !category ? 'تصنيف ناقص' : duplicate ? 'مكرر' : '' };
    }
    const tradeName = pick(row, ['tradename', 'productname', 'name', 'اسم']);
    const strength = pick(row, ['strength', 'concentration', 'تركيز']);
    const form = pick(row, ['form', 'dosage', 'shape', 'شكل']);
    const manufacturer = pick(row, ['manufacturer', 'company', 'شركة']);
    const category = pick(row, ['category', 'تصنيف']) || 'Other';
    const ingredientName = pick(row, ['activeingredientname', 'ingredient', 'مادة']);
    const ingredient = ingredients.find((item) => normalizeArabic(item.name) === normalizeArabic(ingredientName));
    const productType: Product['productType'] = /medical|supply|مستلزم/i.test(category) ? 'medical_supply' : ingredient ? 'medicine' : 'other';
    const candidate = { tradeName, strength, form, manufacturer, category, activeIngredientId: ingredient?.id || '', productType };
    const duplicate = products.some((item) => productIdentityKey(item) === productIdentityKey(candidate));
    return { index, ...candidate, valid: Boolean(tradeName && (!ingredientName || ingredient) && !duplicate), reason: !tradeName ? 'اسم ناقص' : ingredientName && !ingredient ? 'المادة غير موجودة — اتركها فارغة للمستلزمات أو أضفها أولاً' : duplicate ? 'مكرر' : '' };
  }), [rows, tab, ingredients, products]);

  const commit = async () => {
    setBusy(true);
    try {
      let count = 0;
      for (const row of preview.filter((item) => item.valid || !onlyValid)) {
        if (tab === 'ingredients') {
          await saveActiveIngredient({ name: row.name, normalizedName: normalizeArabic(row.name), category: row.category });
        } else {
          await saveProduct({ tradeName: row.tradeName, normalizedName: normalizeArabic(row.tradeName), strength: row.strength, form: row.form, manufacturer: row.manufacturer, category: row.category, activeIngredientId: row.activeIngredientId || '', productType: row.productType, createdAt: new Date().toISOString() });
        }
        count += 1;
      }
      success(`تم اعتماد ${count} صفاً بنجاح`);
      setRows([]);
      await load();
    } catch (exception: any) {
      error(`فشل الاعتماد: ${exception.message || 'خطأ غير معروف'}`);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const data = tab === 'ingredients' ? [{ name: 'Paracetamol', category: 'Analgesics' }] : [{ tradeName: 'Augmentin', strength: '1gm', form: 'Tab', manufacturer: 'GSK', category: 'Antibiotic', activeIngredientName: 'Amoxicillin + Clavulanic Acid' }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), 'Template');
    const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([output]));
    anchor.download = tab === 'ingredients' ? 'active-ingredients-template.xlsx' : 'products-template.xlsx';
    anchor.click();
  };

  return <div dir="rtl" className="space-y-5 pb-16">
    <header className="rounded-3xl bg-gradient-to-br from-[#0f9d7a] to-[#073b4c] p-6 text-white"><p className="text-xs font-bold text-emerald-100">كتالوج فارما لينك</p><h1 className="mt-2 text-2xl font-black">استيراد المواد والأصناف التجارية</h1><p className="mt-2 text-sm text-white/80">الأسماء التجارية تُحفظ بالإنجليزية، والمستلزمات لا تحتاج مادة فعالة.</p></header>
    <div className="flex gap-2"><button onClick={() => { setTab('ingredients'); setRows([]); }} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === 'ingredients' ? 'bg-[#0f9d7a] text-white' : 'border bg-white'}`}>المواد الفعالة</button><button onClick={() => { setTab('products'); setRows([]); }} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === 'products' ? 'bg-[#0f9d7a] text-white' : 'border bg-white'}`}>الأصناف التجارية</button></div>
    <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center gap-3"><label className="cursor-pointer rounded-xl bg-[#0f9d7a] px-4 py-3 text-xs font-bold text-white"><UploadCloud className="ml-1 inline w-4" /> رفع Excel / CSV<input hidden type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} /></label><button onClick={downloadTemplate} className="rounded-xl border px-4 py-3 text-xs font-bold"><Download className="ml-1 inline w-4" /> تحميل القالب</button>{fileName && <span className="text-xs text-slate-500"><FileSpreadsheet className="ml-1 inline w-4" />{fileName}</span>}</div><p className="mt-3 text-xs text-slate-500">{tab === 'ingredients' ? 'الأعمدة المطلوبة: name, category' : 'الأعمدة: tradeName, strength, form, manufacturer, category, activeIngredientName (اختياري للمستلزمات)'}</p></section>
    {rows.length > 0 && <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-black">المعاينة قبل الاعتماد</h2><p className="text-xs text-slate-500">صالح: {preview.filter((item) => item.valid).length} · يحتاج مراجعة: {preview.filter((item) => !item.valid).length}</p></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={onlyValid} onChange={(event) => setOnlyValid(event.target.checked)} /> اعتماد الصفوف الصحيحة فقط</label></div><div className="max-h-[430px] overflow-auto"><table className="w-full text-right text-xs"><thead><tr className="border-b bg-slate-50"><th className="p-2">#</th><th className="p-2">الاسم</th><th className="p-2">التفاصيل</th><th className="p-2">الحالة</th></tr></thead><tbody>{preview.map((item: any) => <tr key={item.index} className="border-b"><td className="p-2">{item.index + 2}</td><td className="p-2 font-bold" dir="ltr">{tab === 'ingredients' ? item.name : item.tradeName}</td><td className="p-2" dir="ltr">{tab === 'ingredients' ? item.category : [item.strength, item.form, item.manufacturer, item.category].filter(Boolean).join(' · ')}</td><td className={`p-2 font-bold ${item.valid ? 'text-emerald-600' : 'text-rose-600'}`}>{item.valid ? <><CheckCircle2 className="ml-1 inline w-4" /> صالح</> : <><AlertTriangle className="ml-1 inline w-4" />{item.reason}</>}</td></tr>)}</tbody></table></div><button disabled={busy} onClick={commit} className="mt-4 rounded-xl bg-[#0f9d7a] px-5 py-3 text-xs font-bold text-white disabled:opacity-50">{busy ? 'جاري الاعتماد...' : 'اعتماد البيانات'}</button></section>}
  </div>;
};
