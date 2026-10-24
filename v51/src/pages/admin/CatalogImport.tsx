import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, Download, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import {
  getActiveIngredients,
  getProducts,
  saveActiveIngredientsBatch,
  saveProductsBatch,
  rebuildCatalogSnapshots,
} from '../../services/dataStorage';
import { ActiveIngredient, Product } from '../../types';
import { normalizeArabic } from '../../utils/arabicNormalize';
import { productIdentityKey } from '../../utils/productCatalog';
import { findCatalogHeader, splitActiveIngredientNames } from '../../utils/catalogImport';
import { useToastStore } from '../../store/useToastStore';

const columnAliases = {
  ingredientName: ['activeIngredientName', 'ingredientName', 'ingredient', 'اسم المادة الفعالة', 'اسم المادة', 'name', 'اسم', 'مادة'],
  category: ['category', 'تصنيف', 'الفئة'],
  tradeName: ['tradeName', 'productName', 'اسم الصنف', 'الاسم التجاري', 'name', 'اسم'],
  strength: ['strength', 'concentration', 'تركيز'],
  form: ['form', 'dosage', 'shape', 'شكل'],
  packSize: ['packSize', 'package size', 'unitsPerPack', 'عبوة', 'حجم العبوة', 'عدد الوحدات', 'عدد الحبات', 'محتوى العبوة'],
  manufacturer: ['manufacturer', 'companyName', 'company', 'maker', 'الشركة المصنعة', 'شركة'],
} as const;

const normalizeValue = (value: string) => normalizeArabic(String(value || '').trim()).toLowerCase();

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
    return { ingredients: loadedIngredients, products: loadedProducts };
  };

  const handleTabChange = (nextTab: 'ingredients' | 'products') => {
    setTab(nextTab);
    setRows([]);
    setColumnMap({});
    setFileName('');
    setMappingConfirmed(false);
    setStep(1);
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await load();
      setFileName(file.name);
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsedRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[];
      if (!parsedRows.length) {
        error('الملف لا يحتوي على صفوف بيانات.');
        return;
      }
      const headers = Object.keys(parsedRows[0]);
      const auto = (aliases: readonly string[]) => findCatalogHeader(headers, [...aliases]);
      if (tab === 'ingredients') {
        setColumnMap({
          name: auto(columnAliases.ingredientName),
          category: auto(columnAliases.category),
        });
      } else {
        setColumnMap({
          tradeName: auto(columnAliases.tradeName),
          strength: auto(columnAliases.strength),
          form: auto(columnAliases.form),
          packSize: auto(columnAliases.packSize),
          manufacturer: auto(columnAliases.manufacturer),
          category: auto(columnAliases.category),
          activeIngredientName: auto(columnAliases.ingredientName),
        });
      }
      setRows(parsedRows);
      setStep(2);
      setMappingConfirmed(false);
    } catch (exception: any) {
      error(`تعذر قراءة الملف: ${exception?.message || 'خطأ غير معروف'}`);
    } finally {
      event.target.value = '';
    }
  };

  const pickMapped = (row: any, field: string, aliases: readonly string[]) => {
    if (Object.prototype.hasOwnProperty.call(columnMap, field)) {
      const selected = columnMap[field];
      return selected ? String(row[selected] ?? '').trim() : '';
    }
    const header = findCatalogHeader(Object.keys(row || {}), [...aliases]);
    return header ? String(row[header] ?? '').trim() : '';
  };

  const mappingFields = tab === 'ingredients'
    ? [
        { key: 'name', label: 'اسم المادة الفعالة', aliases: columnAliases.ingredientName, required: true },
        { key: 'category', label: 'التصنيف', aliases: columnAliases.category, required: false },
      ]
    : [
        { key: 'tradeName', label: 'الاسم التجاري', aliases: columnAliases.tradeName, required: true },
        { key: 'strength', label: 'التركيز', aliases: columnAliases.strength, required: false },
        { key: 'form', label: 'الشكل / الوحدة', aliases: columnAliases.form, required: false },
        { key: 'manufacturer', label: 'الشركة', aliases: columnAliases.manufacturer, required: false },
        { key: 'packSize', label: 'حجم العبوة / عدد الوحدات', aliases: columnAliases.packSize, required: false },
        { key: 'category', label: 'التصنيف', aliases: columnAliases.category, required: false },
        { key: 'activeIngredientName', label: 'المادة الفعالة (+ للتركيبات، تُضاف تلقائياً إذا لم تكن مسجلة)', aliases: columnAliases.ingredientName, required: false },
      ];

  const preview: any[] = useMemo(() => {
    const seenIngredientNames = new Set<string>();
    const seenProductKeys = new Set<string>();
    return rows.flatMap<any>((row, index) => {
      if (tab === 'ingredients') {
        const rawName = pickMapped(row, 'name', columnAliases.ingredientName);
        const category = pickMapped(row, 'category', columnAliases.category) || 'غير مصنف';
        const names = splitActiveIngredientNames(rawName);
        return names.map((name) => {
          const key = normalizeValue(name);
          const exists = ingredients.some((item) => normalizeValue(item.normalizedName || item.name) === key);
          const repeated = seenIngredientNames.has(key);
          seenIngredientNames.add(key);
          const valid = Boolean(name && !repeated);
          return {
            index,
            name,
            category,
            alreadyExists: exists,
            valid,
            reason: repeated ? 'مكرر داخل الملف — سيُحفظ مرة واحدة' : exists ? 'موجودة مسبقاً — سيُعاد استخدامها دون تكرار' : '',
          };
        });
      }

      const tradeName = pickMapped(row, 'tradeName', columnAliases.tradeName);
      const strength = pickMapped(row, 'strength', columnAliases.strength);
      const form = pickMapped(row, 'form', columnAliases.form);
      const manufacturer = pickMapped(row, 'manufacturer', columnAliases.manufacturer);
      const packSize = pickMapped(row, 'packSize', columnAliases.packSize);
      const category = pickMapped(row, 'category', columnAliases.category) || 'Other';
      const activeIngredientNames = splitActiveIngredientNames(pickMapped(row, 'activeIngredientName', columnAliases.ingredientName));
      const matchedIngredients = activeIngredientNames.map((name) => ingredients.find((item) => normalizeValue(item.normalizedName || item.name) === normalizeValue(name)));
      const activeIngredientIds = matchedIngredients.flatMap((item) => item ? [item.id] : []);
      const missingIngredientNames = activeIngredientNames.filter((_, nameIndex) => !matchedIngredients[nameIndex]);
      const productType: Product['productType'] = /medical|supply|مستلزم/i.test(category)
        ? 'medical_supply'
        : activeIngredientNames.length > 0 ? 'medicine' : 'other';
      const candidate = {
        tradeName,
        strength,
        form,
        manufacturer,
        packSize,
        category,
        activeIngredientId: activeIngredientIds[0] || '',
        activeIngredientIds,
        productType,
      };
      const key = productIdentityKey(candidate as Product);
      const exists = products.some((item) => productIdentityKey(item) === key);
      const repeated = seenProductKeys.has(key);
      seenProductKeys.add(key);
      const valid = Boolean(tradeName && !exists && !repeated);
      return [{
        index,
        ...candidate,
        activeIngredientNames,
        missingIngredientNames,
        valid,
        reason: !tradeName ? 'اسم الصنف ناقص' : exists ? 'الصنف موجود مسبقاً' : repeated ? 'الصنف مكرر داخل الملف' : '',
      }];
    });
  }, [rows, tab, ingredients, products, columnMap]);

  const commit = async () => {
    setBusy(true);
    try {
      const acceptedRows = preview.filter((item) => item.valid || !onlyValid);
      if (tab === 'ingredients') {
        const existingNames = new Set(ingredients.map((item) => normalizeValue(item.normalizedName || item.name)));
        const newIngredients: Array<Omit<ActiveIngredient, 'id'>> = [];
        for (const item of acceptedRows) {
          const key = normalizeValue(item.name);
          if (!key || existingNames.has(key)) continue;
          existingNames.add(key);
          newIngredients.push({ name: item.name, normalizedName: normalizeArabic(item.name), category: item.category });
        }
        await saveActiveIngredientsBatch(newIngredients);
        success(`تم حفظ ${newIngredients.length} مادة فعالة جديدة، وإعادة استخدام المواد المسجلة مسبقاً دون تكرار.`);
      } else {
        const ingredientMap = new Map(ingredients.map((item) => [normalizeValue(item.normalizedName || item.name), item]));
        const missingToCreate = new Map<string, Omit<ActiveIngredient, 'id'>>();
        for (const item of acceptedRows) {
          for (const name of item.activeIngredientNames as string[]) {
            const key = normalizeValue(name);
            if (key && !ingredientMap.has(key) && !missingToCreate.has(key)) {
              missingToCreate.set(key, { name, normalizedName: normalizeArabic(name), category: item.category || 'غير مصنف' });
            }
          }
        }
        const createdIngredients = await saveActiveIngredientsBatch(Array.from(missingToCreate.values()));
        createdIngredients.forEach((item) => ingredientMap.set(normalizeValue(item.normalizedName || item.name), item));

        const productsToSave = acceptedRows.map((item) => {
          const activeIngredientIds = (item.activeIngredientNames as string[])
            .map((name) => ingredientMap.get(normalizeValue(name))?.id)
            .filter((id): id is string => Boolean(id));
          return {
            tradeName: item.tradeName,
            normalizedName: normalizeArabic(item.tradeName),
            strength: item.strength,
            form: item.form,
            packSize: item.packSize,
            manufacturer: item.manufacturer,
            category: item.category,
            activeIngredientId: activeIngredientIds[0] || '',
            activeIngredientIds,
            productType: item.productType,
            createdAt: new Date().toISOString(),
          };
        });
        const savedProducts = await saveProductsBatch(productsToSave);
        try { await rebuildCatalogSnapshots(); } catch (snapshotError) { console.warn('Catalog snapshot rebuild deferred:', snapshotError); }
        success(`تم اعتماد ${savedProducts.length} صنفاً، وتسجيل ${createdIngredients.length} مادة فعالة جديدة وربط المواد الموجودة مسبقاً تلقائياً.`);
      }
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
    const data = tab === 'ingredients'
      ? [{ activeIngredientName: 'Paracetamol', category: 'Analgesics' }]
      : [{ tradeName: 'Augmentin', strength: '1gm', form: 'Tab', packSize: '14 tablets', manufacturer: 'GSK', category: 'Antibiotic', activeIngredientName: 'Amoxicillin + Clavulanic Acid' }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), 'Template');
    const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([output]));
    anchor.download = tab === 'ingredients' ? 'active-ingredients-template.xlsx' : 'products-template.xlsx';
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  return <div dir="rtl" className="space-y-5 pb-16">
    <header className="rounded-3xl bg-gradient-to-br from-[#0f9d7a] to-[#073b4c] p-6 text-white">
      <p className="text-xs font-bold text-emerald-100">كتالوج فارما لينك</p>
      <h1 className="mt-2 text-2xl font-black">استيراد المواد والأصناف التجارية</h1>
      <p className="mt-2 text-sm text-white/80">يمكن ربط عدة مواد فعالة بالصنف باستخدام علامة +، وتسجيل أي مادة غير موجودة تلقائياً.</p>
    </header>
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-xl bg-[#0f9d7a] text-white p-3 text-xs font-bold">1. نوع البيانات<br/><span className="font-normal opacity-80">مواد أو أصناف</span></div>
      <div className={`rounded-xl p-3 text-xs font-bold ${step >= 2 ? 'bg-[#0f9d7a] text-white' : 'bg-slate-100 text-slate-400'}`}>2. الملف والأعمدة<br/><span className="font-normal opacity-80">رفع ومراجعة التعيين</span></div>
      <div className={`rounded-xl p-3 text-xs font-bold ${step >= 3 ? 'bg-[#0f9d7a] text-white' : 'bg-slate-100 text-slate-400'}`}>3. المعاينة والاعتماد<br/><span className="font-normal opacity-80">تأكيد نهائي</span></div>
    </div>
    <div className="flex gap-2">
      <button onClick={() => handleTabChange('ingredients')} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === 'ingredients' ? 'bg-[#0f9d7a] text-white' : 'border bg-white'}`}>المواد الفعالة</button>
      <button onClick={() => handleTabChange('products')} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === 'products' ? 'bg-[#0f9d7a] text-white' : 'border bg-white'}`}>الأصناف التجارية</button>
    </div>
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-xl bg-[#0f9d7a] px-4 py-3 text-xs font-bold text-white"><UploadCloud className="ml-1 inline w-4" /> رفع Excel / CSV<input hidden type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} /></label>
        <button onClick={downloadTemplate} className="rounded-xl border px-4 py-3 text-xs font-bold"><Download className="ml-1 inline w-4" /> تحميل القالب</button>
        {fileName && <span className="text-xs text-slate-500"><FileSpreadsheet className="ml-1 inline w-4" />{fileName}</span>}
      </div>
      <p className="mt-3 text-xs text-slate-500">{tab === 'ingredients' ? 'اسم المادة الفعالة مطلوب والتصنيف اختياري؛ تقبل الخانة عدة مواد مفصولة بعلامة +.' : 'الأعمدة: tradeName، strength، form، packSize، manufacturer، category، activeIngredientName. افصل المواد المركبة بعلامة +.'}</p>
    </section>
    {rows.length > 0 && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h2 className="font-black text-emerald-950">الخطوة 2: تعيين الأعمدة</h2><p className="text-xs text-emerald-800 mt-1">تم التعرف على الأعمدة بمطابقة الاسم الكامل أولاً؛ راجع التعيين ثم أكد للانتقال إلى المعاينة.</p></div>
        <button type="button" onClick={() => { setMappingConfirmed(true); setStep(3); }} className={`rounded-xl px-4 py-2.5 text-xs font-bold ${mappingConfirmed ? 'bg-white text-emerald-700 border border-emerald-300' : 'bg-[#0f9d7a] text-white'}`}>{mappingConfirmed ? 'تم تأكيد الأعمدة' : 'تأكيد التعيين والانتقال'}</button>
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{mappingFields.map((field) => <label key={field.key} className="text-xs font-bold text-emerald-950">{field.label}{field.required && <span className="text-rose-600"> *</span>}<select value={columnMap[field.key] || ''} onChange={(event) => { setColumnMap((current) => ({ ...current, [field.key]: event.target.value })); setMappingConfirmed(false); }} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-normal"><option value="">غير مستخدم / فارغ</option>{Object.keys(rows[0] || {}).map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div>
    </section>}
    {rows.length > 0 && <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-black">المعاينة قبل الاعتماد</h2><p className="text-xs text-slate-500">صالح: {preview.filter((item) => item.valid).length} · يحتاج مراجعة: {preview.filter((item) => !item.valid).length}</p></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={onlyValid} onChange={(event) => setOnlyValid(event.target.checked)} /> اعتماد الصفوف الصحيحة فقط</label></div>
      <div className="max-h-[430px] overflow-auto"><table className="w-full text-right text-xs"><thead><tr className="border-b bg-slate-50"><th className="p-2">#</th><th className="p-2">الاسم</th><th className="p-2">التفاصيل</th><th className="p-2">المواد الفعالة</th><th className="p-2">الشركة</th><th className="p-2">الحالة</th></tr></thead><tbody>{preview.map((item: any) => <tr key={`${item.index}-${item.name || item.tradeName}`} className="border-b"><td className="p-2">{item.index + 2}</td><td className="p-2 font-bold" dir="ltr">{tab === 'ingredients' ? item.name : item.tradeName}</td><td className="p-2" dir="ltr">{tab === 'ingredients' ? item.category : [item.strength, item.form, item.packSize ? `العبوة: ${item.packSize}` : '', item.category].filter(Boolean).join(' · ')}</td><td className="p-2" dir="ltr">{tab === 'ingredients' ? (item.alreadyExists ? 'موجودة في القاعدة' : '—') : <>{item.activeIngredientNames?.join(' + ') || '—'}{item.missingIngredientNames?.length > 0 && <span className="block mt-1 text-amber-700">سيتم تسجيل: {item.missingIngredientNames.join(' + ')}</span>}</>}</td><td className="p-2 font-bold" dir="ltr">{tab === 'ingredients' ? '—' : item.manufacturer || '—'}</td><td className={`p-2 font-bold ${item.valid ? item.reason ? 'text-amber-700' : 'text-emerald-600' : 'text-rose-600'}`}>{item.valid ? <><CheckCircle2 className="ml-1 inline w-4" />{item.reason || 'صالح'}</> : <><AlertTriangle className="ml-1 inline w-4" />{item.reason}</>}</td></tr>)}</tbody></table></div>
      <button disabled={busy || !mappingConfirmed} onClick={commit} className="mt-4 rounded-xl bg-[#0f9d7a] px-5 py-3 text-xs font-bold text-white disabled:opacity-50">{busy ? 'جاري الاعتماد...' : mappingConfirmed ? 'اعتماد البيانات' : 'أكد تعيين الأعمدة أولاً'}</button>
    </section>}
  </div>;
};
