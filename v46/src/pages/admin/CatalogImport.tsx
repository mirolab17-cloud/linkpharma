import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, Download, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { getActiveIngredients, getProducts, saveActiveIngredient, saveProduct, rebuildCatalogSnapshots } from '../../services/dataStorage';
import { ActiveIngredient, Product } from '../../types';
import { normalizeArabic } from '../../utils/arabicNormalize';
import { productIdentityKey } from '../../utils/productCatalog';
import { useToastStore } from '../../store/useToastStore';

const normalizeColumn = (value: string) => value.toLowerCase().replace(/[\s_-]/g, '');
const pick = (row: any, keys: string[]) => {
  const key = Object.keys(row).find((candidate) => keys.some((part) => normalizeColumn(candidate).includes(normalizeColumn(part))));
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
  const [step, setStep] = useState(1);
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});

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
    const parsedRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }) as any[];
    const headers = Object.keys(parsedRows[0] || {});
    const auto = (aliases: string[]) => headers.find((header) => aliases.some((alias) => normalizeColumn(header).includes(normalizeColumn(alias)))) || '';
    setColumnMap(tab === 'ingredients' ? { name: auto(['name', 'اسم', 'ingredient', 'مادة']), category: auto(['category', 'تصنيف']) } : { tradeName: auto(['tradename', 'productname', 'name', 'اسم']), strength: auto(['strength', 'concentration', 'تركيز']), form: auto(['form', 'dosage', 'shape', 'شكل']), packSize: auto(['packsize', 'package size', 'packagesize', 'unitsperpack', 'عبوة', 'حجم العبوة', 'عدد الوحدات', 'عدد الحبات', 'محتوى العبوة']), manufacturer: auto(['manufacturer', 'company', 'companyname', 'manufacturername', 'maker', 'شركة', 'الشركة المصنعة']), category: auto(['category', 'تصنيف']), activeIngredientName: auto(['activeingredientname', 'ingredient', 'مادة']) });
    setRows(parsedRows);
    setStep(2);
    setMappingConfirmed(false);
  };

  const pickMapped = (row: any, field: string, aliases: string[]) => {
    const selected = columnMap[field];
    return selected ? String(row[selected] ?? '').trim() : pick(row, aliases);
  };

  const mappingFields = tab === 'ingredients'
    ? [{ key: 'name', label: 'اسم المادة', aliases: ['name', 'اسم', 'ingredient', 'مادة'], required: true }, { key: 'category', label: 'التصنيف', aliases: ['category', 'تصنيف'], required: true }]
    : [{ key: 'tradeName', label: 'الاسم التجاري', aliases: ['tradename', 'productname', 'name', 'اسم'], required: true }, { key: 'strength', label: 'التركيز', aliases: ['strength', 'concentration', 'تركيز'] }, { key: 'form', label: 'الشكل / الوحدة', aliases: ['form', 'dosage', 'shape', 'شكل'] }, { key: 'manufacturer', label: 'الشركة', aliases: ['manufacturer', 'company', 'companyname', 'manufacturername', 'maker', 'شركة', 'الشركة المصنعة'] }, { key: 'packSize', label: 'حجم العبوة / عدد الوحدات', aliases: ['packsize', 'package size', 'packagesize', 'unitsperpack', 'عبوة', 'حجم العبوة', 'عدد الوحدات', 'عدد الحبات', 'محتوى العبوة'] }, { key: 'category', label: 'التصنيف', aliases: ['category', 'تصنيف'] }, { key: 'activeIngredientName', label: 'المادة الفعالة (اختياري)', aliases: ['activeingredientname', 'ingredient', 'مادة'] }];

  const preview: any[] = useMemo(() => rows.map((row, index) => {
    if (tab === 'ingredients') {
      const name = pickMapped(row, 'name', ['name', 'اسم', 'ingredient', 'مادة']);
      const category = pickMapped(row, 'category', ['category', 'تصنيف']);
      const duplicate = ingredients.some((item) => normalizeArabic(item.name) === normalizeArabic(name));
      return { index, name, category, valid: Boolean(name && category && !duplicate), reason: !name ? 'اسم ناقص' : !category ? 'تصنيف ناقص' : duplicate ? 'مكرر' : '' };
    }
    const tradeName = pickMapped(row, 'tradeName', ['tradename', 'productname', 'name', 'اسم']);
    const strength = pickMapped(row, 'strength', ['strength', 'concentration', 'تركيز']);
    const form = pickMapped(row, 'form', ['form', 'dosage', 'shape', 'شكل']);
    const manufacturer = pickMapped(row, 'manufacturer', ['manufacturer', 'company', 'companyname', 'manufacturername', 'maker', 'شركة', 'الشركة المصنعة']);
    const packSize = pickMapped(row, 'packSize', ['packsize', 'package size', 'packagesize', 'unitsperpack', 'عبوة', 'حجم العبوة', 'عدد الوحدات', 'عدد الحبات', 'محتوى العبوة']);
    const category = pick(row, ['category', 'تصنيف']) || 'Other';
    const ingredientName = pickMapped(row, 'activeIngredientName', ['activeingredientname', 'ingredient', 'مادة']);
    const ingredient = ingredients.find((item) => normalizeArabic(item.name) === normalizeArabic(ingredientName));
    const productType: Product['productType'] = /medical|supply|مستلزم/i.test(category) ? 'medical_supply' : ingredient ? 'medicine' : 'other';
    const candidate = { tradeName, strength, form, manufacturer, packSize, category, activeIngredientId: ingredient?.id || '', productType };
    const duplicate = products.some((item) => productIdentityKey(item) === productIdentityKey(candidate));
    return { index, ...candidate, valid: Boolean(tradeName && (!ingredientName || ingredient) && !duplicate), reason: !tradeName ? 'اسم ناقص' : ingredientName && !ingredient ? 'المادة غير موجودة — اتركها فارغة للمستلزمات أو أضفها أولاً' : duplicate ? 'مكرر' : '' };
  }), [rows, tab, ingredients, products, columnMap]);

  const commit = async () => {
    setBusy(true);
    try {
      let count = 0;
      for (const row of preview.filter((item) => item.valid || !onlyValid)) {
        if (tab === 'ingredients') {
          await saveActiveIngredient({ name: row.name, normalizedName: normalizeArabic(row.name), category: row.category });
        } else {
          await saveProduct({ tradeName: row.tradeName, normalizedName: normalizeArabic(row.tradeName), strength: row.strength, form: row.form, packSize: row.packSize, manufacturer: row.manufacturer, category: row.category, activeIngredientId: row.activeIngredientId || '', productType: row.productType, createdAt: new Date().toISOString() });
        }
        count += 1;
      }
      if (tab === 'products') {
        try { await rebuildCatalogSnapshots(); } catch (snapshotError) { console.warn('Catalog snapshot rebuild deferred:', snapshotError); }
      }
      success(`تم اعتماد ${count} صفاً بنجاح`);
      setRows([]);
      setStep(1);
      setMappingConfirmed(false);
      await load();
    } catch (exception: any) {
      error(`فشل الاعتماد: ${exception.message || 'خطأ غير معروف'}`);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const data = tab === 'ingredients' ? [{ name: 'Paracetamol', category: 'Analgesics' }] : [{ tradeName: 'Augmentin', strength: '1gm', form: 'Tab', packSize: '14 tablets', manufacturer: 'GSK', category: 'Antibiotic', activeIngredientName: 'Amoxicillin + Clavulanic Acid' }];
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
    <div className="grid grid-cols-3 gap-2"><div className="rounded-xl bg-[#0f9d7a] text-white p-3 text-xs font-bold">1. نوع البيانات<br/><span className="font-normal opacity-80">مواد أو أصناف</span></div><div className={`rounded-xl p-3 text-xs font-bold ${step >= 2 ? 'bg-[#0f9d7a] text-white' : 'bg-slate-100 text-slate-400'}`}>2. الملف والأعمدة<br/><span className="font-normal opacity-80">رفع ومراجعة التعيين</span></div><div className={`rounded-xl p-3 text-xs font-bold ${step >= 3 ? 'bg-[#0f9d7a] text-white' : 'bg-slate-100 text-slate-400'}`}>3. المعاينة والاعتماد<br/><span className="font-normal opacity-80">تأكيد نهائي</span></div></div><div className="flex gap-2"><button onClick={() => { setTab('ingredients'); setRows([]); }} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === 'ingredients' ? 'bg-[#0f9d7a] text-white' : 'border bg-white'}`}>المواد الفعالة</button><button onClick={() => { setTab('products'); setRows([]); }} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === 'products' ? 'bg-[#0f9d7a] text-white' : 'border bg-white'}`}>الأصناف التجارية</button></div>
    <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center gap-3"><label className="cursor-pointer rounded-xl bg-[#0f9d7a] px-4 py-3 text-xs font-bold text-white"><UploadCloud className="ml-1 inline w-4" /> رفع Excel / CSV<input hidden type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} /></label><button onClick={downloadTemplate} className="rounded-xl border px-4 py-3 text-xs font-bold"><Download className="ml-1 inline w-4" /> تحميل القالب</button>{fileName && <span className="text-xs text-slate-500"><FileSpreadsheet className="ml-1 inline w-4" />{fileName}</span>}</div><p className="mt-3 text-xs text-slate-500">{tab === 'ingredients' ? 'الأعمدة المطلوبة: name, category' : 'الأعمدة: tradeName، strength، form، packSize (حجم العبوة/عدد الوحدات اختياري مثل 20 قرصاً أو 5 أمبولات)، manufacturer، category، activeIngredientName (اختياري للمستلزمات)'}</p></section>
    {rows.length > 0 && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="font-black text-emerald-950">الخطوة 2: تعيين الأعمدة</h2><p className="text-xs text-emerald-800 mt-1">تم التعرف تلقائياً على الأعمدة. راجع القالب ثم أكد للانتقال إلى المعاينة.</p></div><button type="button" onClick={() => { setMappingConfirmed(true); setStep(3); }} className={`rounded-xl px-4 py-2.5 text-xs font-bold ${mappingConfirmed ? 'bg-white text-emerald-700 border border-emerald-300' : 'bg-[#0f9d7a] text-white'}`}>{mappingConfirmed ? 'تم تأكيد الأعمدة' : 'تأكيد التعيين والانتقال'}</button></div><div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{mappingFields.map((field) => <label key={field.key} className="text-xs font-bold text-emerald-950">{field.label}{field.required && <span className="text-rose-600"> *</span>}<select value={columnMap[field.key] || ''} onChange={(event) => { setColumnMap((current) => ({ ...current, [field.key]: event.target.value })); setMappingConfirmed(false); }} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-normal"><option value="">غير مستخدم / فارغ</option>{Object.keys(rows[0] || {}).map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div></section>}
    {rows.length > 0 && <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-black">المعاينة قبل الاعتماد</h2><p className="text-xs text-slate-500">صالح: {preview.filter((item) => item.valid).length} · يحتاج مراجعة: {preview.filter((item) => !item.valid).length}</p></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={onlyValid} onChange={(event) => setOnlyValid(event.target.checked)} /> اعتماد الصفوف الصحيحة فقط</label></div><div className="max-h-[430px] overflow-auto"><table className="w-full text-right text-xs"><thead><tr className="border-b bg-slate-50"><th className="p-2">#</th><th className="p-2">الاسم</th><th className="p-2">التفاصيل</th><th className="p-2">الشركة</th><th className="p-2">الحالة</th></tr></thead><tbody>{preview.map((item: any) => <tr key={item.index} className="border-b"><td className="p-2">{item.index + 2}</td><td className="p-2 font-bold" dir="ltr">{tab === 'ingredients' ? item.name : item.tradeName}</td><td className="p-2" dir="ltr">{tab === 'ingredients' ? item.category : [item.strength, item.form, item.packSize ? `العبوة: ${item.packSize}` : '', item.category].filter(Boolean).join(' · ')}</td><td className="p-2 font-bold" dir="ltr">{tab === 'ingredients' ? '—' : item.manufacturer || '—'}</td><td className={`p-2 font-bold ${item.valid ? 'text-emerald-600' : 'text-rose-600'}`}>{item.valid ? <><CheckCircle2 className="ml-1 inline w-4" /> صالح</> : <><AlertTriangle className="ml-1 inline w-4" />{item.reason}</>}</td></tr>)}</tbody></table></div><button disabled={busy || !mappingConfirmed} onClick={commit} className="mt-4 rounded-xl bg-[#0f9d7a] px-5 py-3 text-xs font-bold text-white disabled:opacity-50">{busy ? 'جاري الاعتماد...' : mappingConfirmed ? 'اعتماد البيانات' : 'أكد تعيين الأعمدة أولاً'}</button></section>}
  </div>;
};
