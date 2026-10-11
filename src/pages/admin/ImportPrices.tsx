// src/pages/admin/ImportPrices.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  getSuppliers, 
  getProducts, 
  getActiveIngredients,
  saveSupplier,
  saveProduct,
  commitImportBatch,
  getImportBatches,
  rollbackImportBatch
} from '../../services/dataStorage';
import { Supplier, Product, ActiveIngredient, ImportBatch } from '../../types';
import { parseSpreadsheetFile, processMappedRows, SheetParseResult, MappedPriceRow } from '../../services/import';
import { extractPricesFromImage, extractPricesFromText, ExtractedPriceItem } from '../../services/gemini';
import { ProductMatcher, MatchResult } from '../../utils/fuzzyMatch';
import { normalizeArabic } from '../../utils/arabicNormalize';
import { formatCurrency } from '../../utils/formatPrice';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Image as ImageIcon, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RotateCcw, 
  Save, 
  ArrowLeft, 
  ArrowRight, 
  Plus, 
  Trash2, 
  Sparkles, 
  Eye, 
  Search,
  Check,
  X,
  Clock,
  History,
  Building
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Spinner } from '../../components/Loader';

type InputMode = 'file' | 'image' | 'text';
type Step = 1 | 2 | 3 | 4; // 1: Input, 2: Mapping / Gemini Result, 3: Matching Review, 4: Summary

interface RowMatchItem {
  rowId: string;
  originalName: string;
  price: number;
  publicPrice?: number;
  available: boolean;
  expiry?: string;
  status: 'exact' | 'fuzzy' | 'none' | 'ignored';
  selectedProductId: string | null;
  suggestions: { product: Product; score: number }[];
}

export const ImportPrices: React.FC = () => {
  const { user } = useAuthStore();
  const { success, error, warning, info } = useToastStore();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<ActiveIngredient[]>([]);
  const [recentBatches, setRecentBatches] = useState<ImportBatch[]>([]);

  // Selection
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [inputMode, setInputMode] = useState<InputMode>('file');

  // File Upload State
  const [sheetData, setSheetData] = useState<SheetParseResult | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [startRow, setStartRow] = useState<number>(2);

  // Column Mapping State
  const [nameCol, setNameCol] = useState<number>(-1);
  const [priceCol, setPriceCol] = useState<number>(-1);
  const [publicPriceCol, setPublicPriceCol] = useState<number>(-1);
  const [availCol, setAvailCol] = useState<number>(-1);
  const [expiryCol, setExpiryCol] = useState<number>(-1);

  // Gemini Input State
  const [pastedText, setPastedText] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [geminiItems, setGeminiItems] = useState<ExtractedPriceItem[]>([]);

  // Matching State
  const [matchRows, setMatchRows] = useState<RowMatchItem[]>([]);
  const [filterMatchStatus, setFilterMatchStatus] = useState<'all' | 'exact' | 'fuzzy' | 'none' | 'ignored'>('all');
  const [matchSearchTerm, setMatchSearchTerm] = useState('');

  // New Product Modal inline creation
  const [isNewProdModalOpen, setIsNewProdModalOpen] = useState(false);
  const [targetRowIdForNewProd, setTargetRowIdForNewProd] = useState<string | null>(null);
  const [newProdTradeName, setNewProdTradeName] = useState('');
  const [newProdActiveIngId, setNewProdActiveIngId] = useState('');
  const [newProdForm, setNewProdForm] = useState('أقراص');
  const [newProdStrength, setNewProdStrength] = useState('');
  const [newProdManufacturer, setNewProdManufacturer] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('عام');

  // Summary State
  const [commitSummary, setCommitSummary] = useState<{
    batchId: string;
    updatedCount: number;
    newCount: number;
    ignoredCount: number;
  } | null>(null);

  // Rollback Confirm
  const [isRollbackOpen, setIsRollbackOpen] = useState(false);
  const [targetRollbackBatchId, setTargetRollbackBatchId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadBaseData();
  }, []);

  const loadBaseData = async () => {
    try {
      const [sups, prods, ings, batches] = await Promise.all([
        getSuppliers(),
        getProducts(),
        getActiveIngredients(),
        getImportBatches(),
      ]);
      setSuppliers(sups);
      setProducts(prods);
      setIngredients(ings);
      setRecentBatches(batches);
      if (sups.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(sups[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const selectedSupplier = useMemo(() => {
    return suppliers.find((s) => s.id === selectedSupplierId);
  }, [suppliers, selectedSupplierId]);

  // تطبيق القالب المحفوظ للمورد تلقائياً إن وُجد
  useEffect(() => {
    if (selectedSupplier?.importTemplate && sheetData) {
      const t = selectedSupplier.importTemplate;
      if (t.startRow) setStartRow(t.startRow);
      if (t.sheetName && sheetData.sheetNames.includes(t.sheetName)) {
        setSelectedSheetName(t.sheetName);
      }
      // البحث عن عناوين الأعمدة
      const headers = sheetData.previewRows[0]?.cells || [];
      const findIdx = (colName?: string) => {
        if (!colName) return -1;
        // مطابقة بالاسم أو بالحرف
        const byHeader = headers.findIndex((h) => h.includes(colName) || colName.includes(h));
        if (byHeader > -1) return byHeader;
        // مطابقة برمز العمود مثل 'A', 'B'
        return sheetData.columnHeaders.indexOf(colName);
      };

      if (t.columns.name) setNameCol(findIdx(t.columns.name));
      if (t.columns.price) setPriceCol(findIdx(t.columns.price));
      if (t.columns.publicPrice) setPublicPriceCol(findIdx(t.columns.publicPrice));
      if (t.columns.availability) setAvailCol(findIdx(t.columns.availability));
      if (t.columns.expiry) setExpiryCol(findIdx(t.columns.expiry));
    }
  }, [selectedSupplier, sheetData]);

  // حفظ ترتيب الأعمدة الحالي في مستند المورد
  const handleSaveSupplierTemplate = async () => {
    if (!selectedSupplier) return;
    if (nameCol === -1 || priceCol === -1) {
      warning('يرجى تحديد عمود اسم الصنف وعمود السعر على الأقل.');
      return;
    }

    const headers = sheetData?.previewRows[0]?.cells || [];
    const getColLabel = (idx: number) => {
      if (idx === -1) return '';
      return headers[idx] || sheetData?.columnHeaders[idx] || '';
    };

    try {
      const template = {
        sheetName: selectedSheetName,
        startRow,
        columns: {
          name: getColLabel(nameCol),
          price: getColLabel(priceCol),
          publicPrice: getColLabel(publicPriceCol),
          availability: getColLabel(availCol),
          expiry: getColLabel(expiryCol),
        },
      };

      await saveSupplier({
        ...selectedSupplier,
        importTemplate: template,
      });

      success(`تم حفظ قالب ترتيب الأعمدة للمورد (${selectedSupplier.name}) بنجاح.`);
      await loadBaseData();
    } catch (e: any) {
      error('فشل حفظ القالب: ' + e.message);
    }
  };

  // رفع وقراءة ملف Excel / CSV
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setCurrentFileName(file.name);
    try {
      const result = await parseSpreadsheetFile(file);
      setSheetData(result);
      setSelectedSheetName(result.selectedSheet);

      // محاولة تخمين الأعمدة المبدئية ذكياً
      const firstRow = result.previewRows[0]?.cells || [];
      firstRow.forEach((cell, idx) => {
        const norm = normalizeArabic(cell);
        if (norm.includes('صنف') || norm.includes('اسم') || norm.includes('دواء') || norm.includes('item') || norm.includes('name')) {
          if (nameCol === -1) setNameCol(idx);
        } else if (norm.includes('سعر') || norm.includes('صيدل') || norm.includes('price') || norm.includes('cost')) {
          if (priceCol === -1) setPriceCol(idx);
        } else if (norm.includes('عموم') || norm.includes('جمهور') || norm.includes('public')) {
          if (publicPriceCol === -1) setPublicPriceCol(idx);
        } else if (norm.includes('توفر') || norm.includes('حال') || norm.includes('stock') || norm.includes('avail')) {
          if (availCol === -1) setAvailCol(idx);
        }
      });

      setStep(2);
      success('تمت قراءة الملف بنجاح. راجع ربط الأعمدة.');
    } catch (err: any) {
      error('فشل قراءة الملف: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // معالجة الذكاء الاصطناعي للنص أو الصورة
  const handleGeminiProcess = async () => {
    if (!selectedSupplierId) {
      warning('يرجى اختيار المورد أولاً.');
      return;
    }

    setLoading(true);
    try {
      let items: ExtractedPriceItem[] = [];
      if (inputMode === 'image') {
        if (!imageFile) {
          warning('يرجى رفع صورة قائمة الأسعار أولاً.');
          setLoading(false);
          return;
        }
        items = await extractPricesFromImage(imageFile);
      } else {
        if (!pastedText.trim()) {
          warning('يرجى لصق نص قائمة الأسعار أولاً.');
          setLoading(false);
          return;
        }
        items = await extractPricesFromText(pastedText);
      }

      if (items.length === 0) {
        throw new Error('لم يتم استخراج أي أسعار صالحة من المدخلات.');
      }

      setGeminiItems(items);
      setCurrentFileName(inputMode === 'image' ? (imageFile?.name || 'صورة_أسعار') : 'نص_ملصوق');
      setStep(2);
      success(`نجح الذكاء الاصطناعي في استخراج ${items.length} صنفاً بنجاح!`);
    } catch (err: any) {
      error(err.message || 'فشلت معالجة الذكاء الاصطناعي.');
    } finally {
      setLoading(false);
    }
  };

  // الانتقال لخطوة المطابقة (Matching Step)
  const handleProceedToMatching = () => {
    let rowsToMatch: {
      rawName: string;
      price: number;
      publicPrice?: number;
      available?: boolean;
      expiry?: string;
    }[] = [];

    if (inputMode === 'file') {
      if (!sheetData) return;
      if (nameCol === -1 || priceCol === -1) {
        warning('يجب اختيار عمود اسم الصنف وعمود السعر على الأقل.');
        return;
      }

      const mapped = processMappedRows({
        allRows: sheetData.allRows,
        startRow,
        nameColIdx: nameCol,
        priceColIdx: priceCol,
        publicPriceColIdx: publicPriceCol,
        availColIdx: availCol,
        expiryColIdx: expiryCol,
      });

      const validRows = mapped.filter((r) => r.isValid && r.rawPrice !== null);
      if (validRows.length === 0) {
        error('لم يتم العثور على أي صفوف صالحة بأسماء وأسعار بعد معالجة الملف.');
        return;
      }

      rowsToMatch = validRows.map((r) => ({
        rawName: r.rawName,
        price: r.rawPrice!,
        publicPrice: r.rawPublicPrice || undefined,
        available: r.rawAvailability ? !r.rawAvailability.includes('غير') && !r.rawAvailability.includes('نفد') : true,
        expiry: r.rawExpiry,
      }));
    } else {
      // من Gemini
      rowsToMatch = geminiItems.map((item) => ({
        rawName: item.name,
        price: item.price,
        publicPrice: item.publicPrice,
        available: true,
      }));
    }

    // تشغيل محرك المطابقة (Fuse.js + Normalization)
    const matcher = new ProductMatcher(products);
    const results: RowMatchItem[] = rowsToMatch.map((row, idx) => {
      const matchResult = matcher.match(row.rawName);

      return {
        rowId: 'row_' + idx + '_' + Date.now(),
        originalName: row.rawName,
        price: row.price,
        publicPrice: row.publicPrice,
        available: row.available ?? true,
        expiry: row.expiry,
        status: matchResult.status,
        selectedProductId: matchResult.matchedProduct ? matchResult.matchedProduct.id : null,
        suggestions: matchResult.suggestions,
      };
    });

    setMatchRows(results);
    setStep(3);
    info(`تمت مطابقة ${results.length} صفاً. يرجى مراجعة الحالات.`);
  };

  // فتح نافذة إنشاء صنف جديد من جدول المطابقة
  const handleOpenCreateProduct = (row: RowMatchItem) => {
    setTargetRowIdForNewProd(row.rowId);
    setNewProdTradeName(row.originalName);
    setNewProdActiveIngId(ingredients[0]?.id || '');
    setNewProdForm('أقراص');
    setNewProdStrength('');
    setNewProdManufacturer('');
    setNewProdCategory('عام');
    setIsNewProdModalOpen(true);
  };

  // حفظ الصنف الجديد وربطه فوراً بالصف
  const handleSaveNewProductAndLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdTradeName.trim() || !newProdActiveIngId) return;

    try {
      const savedProd = await saveProduct({
        tradeName: newProdTradeName.trim(),
        normalizedName: normalizeArabic(newProdTradeName.trim()),
        activeIngredientId: newProdActiveIngId,
        form: newProdForm,
        strength: newProdStrength.trim(),
        manufacturer: newProdManufacturer.trim(),
        category: newProdCategory.trim() || 'عام',
      });

      // إضافة الصنف للقائمة
      setProducts((prev) => [savedProd, ...prev]);

      // ربط الصنف بالصف وتغيير حالته إلى exact
      if (targetRowIdForNewProd) {
        setMatchRows((prev) =>
          prev.map((r) =>
            r.rowId === targetRowIdForNewProd
              ? { ...r, selectedProductId: savedProd.id, status: 'exact' }
              : r
          )
        );
      }

      setIsNewProdModalOpen(false);
      success(`تم إنشاء صنف (${savedProd.tradeName}) وربطه بالصف بنجاح.`);
    } catch (err: any) {
      error('تعذر إنشاء الصنف: ' + err.message);
    }
  };

  // قبول كل المطابقات التلقائية
  const handleAcceptAllAutoMatches = () => {
    setMatchRows((prev) =>
      prev.map((r) => {
        if (r.status === 'fuzzy' && r.suggestions.length > 0) {
          return {
            ...r,
            selectedProductId: r.suggestions[0].product.id,
            status: 'exact',
          };
        }
        return r;
      })
    );
    success('تم قبول أفضل الاقتراحات لجميع الصفوف المعلقة.');
  };

  // اعتماد الاستيراد وحفظ الأسعار
  const handleCommitImport = async () => {
    if (!selectedSupplierId || !user) return;

    const validCommitRows = matchRows.filter(
      (r) => r.status !== 'ignored' && r.selectedProductId !== null
    );

    if (validCommitRows.length === 0) {
      warning('لا توجد أصناف صالحة أو مربوطة للاعتماد. تأكد من ربط الأصناف أولاً.');
      return;
    }

    setLoading(true);
    try {
      const priceRecords = validCommitRows.map((r) => ({
        productId: r.selectedProductId!,
        price: r.price,
        publicPrice: r.publicPrice,
        available: r.available,
        expiry: r.expiry,
      }));

      const res = await commitImportBatch({
        supplierId: selectedSupplierId,
        fileName: currentFileName,
        createdBy: user.name || 'مدير النظام',
        priceRecords,
      });

      const ignoredCount = matchRows.filter((r) => r.status === 'ignored' || !r.selectedProductId).length;

      setCommitSummary({
        batchId: res.batchId,
        updatedCount: res.updatedCount,
        newCount: res.newCount,
        ignoredCount,
      });

      setStep(4);
      success(`تم اعتماد الاستيراد بنجاح! تم تحديث ${res.updatedCount} صنفاً وإضافة ${res.newCount} جديداً.`);
      await loadBaseData();
    } catch (err: any) {
      error('فشل اعتماد الاستيراد: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // التراجع عن دفعة استيراد سابقة
  const executeRollback = async () => {
    if (!targetRollbackBatchId) return;
    setLoading(true);
    try {
      const ok = await rollbackImportBatch(targetRollbackBatchId);
      if (ok) {
        success('تم التراجع عن دفعة الاستيراد واستعادة الأسعار السابقة بنجاح.');
        setIsRollbackOpen(false);
        await loadBaseData();
      } else {
        error('تعذر التراجع عن هذه الدفعة.');
      }
    } catch (e: any) {
      error('فشل التراجع: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // تصفية صفوف المطابقة للعرض
  const displayedMatchRows = useMemo(() => {
    return matchRows.filter((r) => {
      if (filterMatchStatus !== 'all' && r.status !== filterMatchStatus) return false;
      if (matchSearchTerm.trim()) {
        const norm = normalizeArabic(matchSearchTerm);
        return normalizeArabic(r.originalName).includes(norm);
      }
      return true;
    });
  }, [matchRows, filterMatchStatus, matchSearchTerm]);

  // إحصاءات المطابقة
  const matchStats = useMemo(() => {
    const exact = matchRows.filter((r) => r.status === 'exact').length;
    const fuzzy = matchRows.filter((r) => r.status === 'fuzzy').length;
    const none = matchRows.filter((r) => r.status === 'none').length;
    const ignored = matchRows.filter((r) => r.status === 'ignored').length;
    return { exact, fuzzy, none, ignored, total: matchRows.length };
  }, [matchRows]);

  return (
    <div className="space-y-6 pb-24">
      {/* رأس الصفحة ومسار الخطوات */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <UploadCloud className="w-6 h-6 text-[#0f9d7a]" />
            <span>رفع وتحديث أسعار المستودعات</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            استيراد ملفات Excel/CSV أو مسح القوائم بالذكاء الاصطناعي مع المطابقة الذكية والتراجع
          </p>
        </div>

        {/* مؤشر الخطوات */}
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs text-xs font-bold">
          <span className={step >= 1 ? 'text-[#0f9d7a]' : 'text-slate-400'}>1. المدخلات</span>
          <span className="text-slate-300">›</span>
          <span className={step >= 2 ? 'text-[#0f9d7a]' : 'text-slate-400'}>2. الأعمدة</span>
          <span className="text-slate-300">›</span>
          <span className={step >= 3 ? 'text-[#0f9d7a]' : 'text-slate-400'}>3. المطابقة</span>
          <span className="text-slate-300">›</span>
          <span className={step >= 4 ? 'text-[#0f9d7a]' : 'text-slate-400'}>4. الملخص</span>
        </div>
      </div>

      {/* ======================= الخطوة 1: اختيار المورد وطريقة الإدخال ======================= */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-6">
            {/* اختيار المورد */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                اختر المورد / المستودع المراد تحديث أسعاره <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full sm:w-96 px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 bg-white focus:outline-hidden focus:border-[#0f9d7a]"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.importTemplate ? '⭐ (لديه قالب محفوظ)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* طريقة الإدخال */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                اختر طريقة إدخال وتوريد الأسعار:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setInputMode('file')}
                  className={`p-5 rounded-2xl border text-right transition flex flex-col justify-between ${
                    inputMode === 'file'
                      ? 'border-[#0f9d7a] bg-emerald-50/40 ring-1 ring-[#0f9d7a]'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <FileSpreadsheet
                    className={`w-8 h-8 mb-3 ${
                      inputMode === 'file' ? 'text-[#0f9d7a]' : 'text-slate-400'
                    }`}
                  />
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">ملف Excel / CSV</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      يدعم ملفات .xlsx و .csv و .xls مع اختيار ورقة العمل وصف البداية
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setInputMode('image')}
                  className={`p-5 rounded-2xl border text-right transition flex flex-col justify-between ${
                    inputMode === 'image'
                      ? 'border-[#0f9d7a] bg-emerald-50/40 ring-1 ring-[#0f9d7a]'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <ImageIcon
                    className={`w-8 h-8 mb-3 ${
                      inputMode === 'image' ? 'text-[#0f9d7a]' : 'text-slate-400'
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-extrabold text-sm text-slate-900">صورة كشف أو فاتورة</h3>
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      استخراج الأسعار تلقائياً من صورة القائمة عبر Gemini Vision
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setInputMode('text')}
                  className={`p-5 rounded-2xl border text-right transition flex flex-col justify-between ${
                    inputMode === 'text'
                      ? 'border-[#0f9d7a] bg-emerald-50/40 ring-1 ring-[#0f9d7a]'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <FileText
                    className={`w-8 h-8 mb-3 ${
                      inputMode === 'text' ? 'text-[#0f9d7a]' : 'text-slate-400'
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-extrabold text-sm text-slate-900">نص ملصوق</h3>
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      لصق قائمة أسعار من واتساب أو بريد، وسيتعرف Gemini على الأسماء والأسعار
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* محتوى الإدخال بناءً على الطريقة */}
            <div className="pt-4 border-t border-slate-100">
              {inputMode === 'file' && (
                <div className="border-2 border-dashed border-slate-300 rounded-3xl p-8 text-center hover:border-[#0f9d7a] transition bg-slate-50/50">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                  />
                  <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-[#0f9d7a] flex items-center justify-center mx-auto mb-4">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <h3 className="font-extrabold text-base text-slate-800">
                    اضغط لاختيار ملف Excel أو CSV
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    يدعم جميع صيغ الجداول، مع إمكانية معاينة الصفوف وربط الأعمدة في الخطوة التالية
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    className="mt-5 px-6 py-2.5 bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 disabled:opacity-50"
                  >
                    {loading ? 'جاري قراءة الملف...' : 'اختيار ملف من الجهاز'}
                  </button>
                </div>
              )}

              {inputMode === 'image' && (
                <div className="space-y-4">
                  <input
                    type="file"
                    ref={imageInputRef}
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                    accept="image/*"
                    className="hidden"
                  />
                  <div
                    onClick={() => imageInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 rounded-3xl p-8 text-center hover:border-[#0f9d7a] cursor-pointer transition bg-slate-50/50"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                    <h3 className="font-extrabold text-base text-slate-800">
                      {imageFile ? imageFile.name : 'اضغط لرفع صورة قائمة الأسعار'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      التقط صورة واضحة للفاتورة أو كشف المستودع وسيقوم Gemini بالتعرف عليها
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleGeminiProcess}
                      disabled={loading || !imageFile}
                      className="px-6 py-2.5 bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 disabled:opacity-50 flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{loading ? 'جاري التحليل بالذكاء الاصطناعي...' : 'استخراج الأسعار عبر Gemini'}</span>
                    </button>
                  </div>
                </div>
              )}

              {inputMode === 'text' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      الصق نص رسالة أو قائمة الأسعار هنا:
                    </label>
                    <textarea
                      rows={6}
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder="مثال:
بنادول إكسترا - 12 ريال
أوجمنتين 1 جم - 55 ريال
بروفين 400 - 18 ريال..."
                      className="w-full p-3.5 rounded-2xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a] font-mono leading-relaxed"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleGeminiProcess}
                      disabled={loading || !pastedText.trim()}
                      className="px-6 py-2.5 bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 disabled:opacity-50 flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{loading ? 'جاري استخراج البيانات...' : 'استخراج الأصناف بالذكاء الاصطناعي'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* سجل دفعات الاستيراد السابقة مع زر التراجع */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
            <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
              <History className="w-4 h-4 text-[#0f9d7a]" />
              <span>دفعات الاستيراد السابقة وإمكانية التراجع (Rollback)</span>
            </h3>

            {recentBatches.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">
                لا توجد دفعات استيراد مسجلة حتى الآن
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentBatches.map((batch) => {
                  const sup = suppliers.find((s) => s.id === batch.supplierId);
                  return (
                    <div
                      key={batch.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-800">{sup?.name || 'مستودع'}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <span>الملف: {batch.fileName}</span>
                          <span>•</span>
                          <span>{batch.rowsCount} صنفاً</span>
                          <span>•</span>
                          <span>بواسطة: {batch.createdBy}</span>
                          <span>•</span>
                          <span>{new Date(batch.createdAt).toLocaleString('ar-SA')}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setTargetRollbackBatchId(batch.id);
                          setIsRollbackOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold transition flex items-center gap-1.5 w-fit"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>التراجع عن هذه الدفعة</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================= الخطوة 2: ربط الأعمدة أو مراجعة Gemini ======================= */}
      {step === 2 && (
        <div className="space-y-6">
          {inputMode === 'file' && sheetData && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-black text-slate-900">معاينة وربط أعمدة الملف</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    الملف: <strong className="text-slate-800">{currentFileName}</strong> للمورد:{' '}
                    <strong className="text-[#0f9d7a]">{selectedSupplier?.name}</strong>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* اختيار ورقة العمل إن كان هناك أكثر من ورقة */}
                  {sheetData.sheetNames.length > 1 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600">ورقة العمل:</span>
                      <select
                        value={selectedSheetName}
                        onChange={(e) => setSelectedSheetName(e.target.value)}
                        className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                      >
                        {sheetData.sheetNames.map((sn) => (
                          <option key={sn} value={sn}>
                            {sn}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* صف البداية */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600">صف بداية البيانات:</span>
                    <input
                      type="number"
                      min="1"
                      value={startRow}
                      onChange={(e) => setStartRow(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 px-2 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-center"
                    />
                  </div>

                  <button
                    onClick={handleSaveSupplierTemplate}
                    className="px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-bold border border-purple-200 transition flex items-center gap-1.5"
                    title="حفظ ترتيب هذه الأعمدة في مستند المورد لتطبيقه تلقائياً في المرات القادمة"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>حفظ هذا الترتيب لهذا المورد</span>
                  </button>
                </div>
              </div>

              {/* واجهة ربط الأعمدة الخمسة */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
                {/* 1) اسم الصنف (إجباري) */}
                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1">
                    اسم الصنف <span className="text-rose-500">* (إجباري)</span>
                  </label>
                  <select
                    value={nameCol}
                    onChange={(e) => setNameCol(parseInt(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white focus:outline-hidden focus:border-[#0f9d7a]"
                  >
                    <option value={-1}>-- اختر العمود --</option>
                    {sheetData.columnHeaders.map((colLetter, idx) => {
                      const headerText = sheetData.previewRows[0]?.cells[idx] || '';
                      return (
                        <option key={colLetter} value={idx}>
                          العمود {colLetter} {headerText ? `(${headerText})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 2) السعر (إجباري) */}
                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1">
                    سعر الشراء / الصيدلية <span className="text-rose-500">* (إجباري)</span>
                  </label>
                  <select
                    value={priceCol}
                    onChange={(e) => setPriceCol(parseInt(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white focus:outline-hidden focus:border-[#0f9d7a]"
                  >
                    <option value={-1}>-- اختر العمود --</option>
                    {sheetData.columnHeaders.map((colLetter, idx) => {
                      const headerText = sheetData.previewRows[0]?.cells[idx] || '';
                      return (
                        <option key={colLetter} value={idx}>
                          العمود {colLetter} {headerText ? `(${headerText})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 3) السعر العام (اختياري) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    سعر العموم (اختياري)
                  </label>
                  <select
                    value={publicPriceCol}
                    onChange={(e) => setPublicPriceCol(parseInt(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white focus:outline-hidden focus:border-[#0f9d7a]"
                  >
                    <option value={-1}>-- غير محدد --</option>
                    {sheetData.columnHeaders.map((colLetter, idx) => {
                      const headerText = sheetData.previewRows[0]?.cells[idx] || '';
                      return (
                        <option key={colLetter} value={idx}>
                          العمود {colLetter} {headerText ? `(${headerText})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 4) التوفر (اختياري) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    التوفر بالمستودع (اختياري)
                  </label>
                  <select
                    value={availCol}
                    onChange={(e) => setAvailCol(parseInt(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white focus:outline-hidden focus:border-[#0f9d7a]"
                  >
                    <option value={-1}>-- غير محدد --</option>
                    {sheetData.columnHeaders.map((colLetter, idx) => {
                      const headerText = sheetData.previewRows[0]?.cells[idx] || '';
                      return (
                        <option key={colLetter} value={idx}>
                          العمود {colLetter} {headerText ? `(${headerText})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 5) تاريخ الانتهاء (اختياري) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    تاريخ الانتهاء (اختياري)
                  </label>
                  <select
                    value={expiryCol}
                    onChange={(e) => setExpiryCol(parseInt(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white focus:outline-hidden focus:border-[#0f9d7a]"
                  >
                    <option value={-1}>-- غير محدد --</option>
                    {sheetData.columnHeaders.map((colLetter, idx) => {
                      const headerText = sheetData.previewRows[0]?.cells[idx] || '';
                      return (
                        <option key={colLetter} value={idx}>
                          العمود {colLetter} {headerText ? `(${headerText})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* معاينة أول 20 صفاً مع ترقيم الأعمدة (A, B, C...) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>معاينة أول 20 صفاً من الملف:</span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    الصف {startRow} محدد كصف بداية قراءة الأسعار
                  </span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 max-h-80 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-mono sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 w-12 text-center">#</th>
                        {sheetData.columnHeaders.map((colLetter, colIdx) => {
                          const isName = colIdx === nameCol;
                          const isPrice = colIdx === priceCol;
                          return (
                            <th
                              key={colLetter}
                              className={`py-2 px-3 ${
                                isName
                                  ? 'bg-emerald-100/90 text-emerald-900 font-bold'
                                  : isPrice
                                  ? 'bg-sky-100/90 text-sky-900 font-bold'
                                  : ''
                              }`}
                            >
                              العمود {colLetter}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {sheetData.previewRows.map((row) => {
                        const isStart = row.rowNumber === startRow;
                        const isBeforeStart = row.rowNumber < startRow;
                        return (
                          <tr
                            key={row.rowNumber}
                            className={`${
                              isStart
                                ? 'bg-emerald-50/70 font-semibold'
                                : isBeforeStart
                                ? 'bg-slate-50/40 text-slate-400 line-through'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-2 px-3 text-center font-mono font-bold text-slate-400">
                              {row.rowNumber}
                            </td>
                            {row.cells.map((cell, cIdx) => (
                              <td key={cIdx} className="py-2 px-3 truncate max-w-44">
                                {cell || <span className="text-slate-300">-</span>}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* أزرار التنقل */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
                >
                  العودة للخطوة السابقة
                </button>

                <button
                  type="button"
                  onClick={handleProceedToMatching}
                  className="px-6 py-2.5 rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold transition shadow-xs flex items-center gap-2 active:scale-95"
                >
                  <span>متابعة لمطابقة الأصناف</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* مسار Gemini (جدول قابل للتعديل والإضافة والحذف قبل الاعتماد) */}
          {(inputMode === 'image' || inputMode === 'text') && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-black text-slate-900">
                    مراجعة الأصناف المستخرجة بواسطة الذكاء الاصطناعي
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    يمكنك تعديل الأسماء والأسعار أو حذف وإضافة صفوف قبل الانتقال للمطابقة
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const newItem: ExtractedPriceItem = {
                      id: 'ext_' + Date.now(),
                      name: '',
                      price: 0,
                    };
                    setGeminiItems((prev) => [newItem, ...prev]);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-50 text-[#0f9d7a] hover:bg-emerald-100 text-xs font-bold transition flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة صف جديد</span>
                </button>
              </div>

              {/* جدول التعديل */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 max-h-96 overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">#</th>
                      <th className="py-2.5 px-4">اسم الصنف المستخرج</th>
                      <th className="py-2.5 px-4 w-40">السعر المستخرج (ر.س)</th>
                      <th className="py-2.5 px-4 w-20 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {geminiItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-center text-slate-400 font-bold">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-4">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setGeminiItems((prev) =>
                                prev.map((i) => (i.id === item.id ? { ...i, name: val } : i))
                              );
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-hidden focus:border-[#0f9d7a]"
                          />
                        </td>
                        <td className="py-2 px-4">
                          <input
                            type="number"
                            step="0.01"
                            value={item.price}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setGeminiItems((prev) =>
                                prev.map((i) => (i.id === item.id ? { ...i, price: val } : i))
                              );
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold focus:outline-hidden focus:border-[#0f9d7a]"
                          />
                        </td>
                        <td className="py-2 px-4 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setGeminiItems((prev) => prev.filter((i) => i.id !== item.id))
                            }
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* أزرار التنقل */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
                >
                  العودة للخطوة السابقة
                </button>

                <button
                  type="button"
                  onClick={handleProceedToMatching}
                  className="px-6 py-2.5 rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold transition shadow-xs flex items-center gap-2 active:scale-95"
                >
                  <span>متابعة لمطابقة الأصناف</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================= الخطوة 3: شاشة المطابقة الشاملة ======================= */}
      {step === 3 && (
        <div className="space-y-6">
          {/* لوحة إحصاءات المطابقة وفلاتر الحالات */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  نتائج المطابقة مع قاعدة الأصناف ({matchRows.length} صفاً)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  تطابق تام (أخضر)، تطابق تقريبي مقترح (أصفر)، أو صنف غير موجود (أحمر)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAcceptAllAutoMatches}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 text-[#0f9d7a] hover:bg-emerald-100 border border-emerald-200 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
                >
                  <Check className="w-4 h-4" />
                  <span>قبول كل الاقتراحات التلقائية</span>
                </button>

                <button
                  type="button"
                  onClick={handleCommitImport}
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold transition shadow-xs flex items-center gap-2 active:scale-95 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{loading ? 'جاري الاعتماد...' : 'اعتماد الاستيراد وتحديث الأسعار'}</span>
                </button>
              </div>
            </div>

            {/* شارات إحصائيات المطابقة */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setFilterMatchStatus('exact')}
                className={`p-3 rounded-2xl border text-right transition ${
                  filterMatchStatus === 'exact'
                    ? 'border-emerald-500 bg-emerald-50/70'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800">مطابق تماماً</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <span className="text-xl font-black text-emerald-700 mt-1 block">
                  {matchStats.exact}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterMatchStatus('fuzzy')}
                className={`p-3 rounded-2xl border text-right transition ${
                  filterMatchStatus === 'fuzzy'
                    ? 'border-amber-500 bg-amber-50/70'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-800">يحتاج مراجعة</span>
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <span className="text-xl font-black text-amber-700 mt-1 block">
                  {matchStats.fuzzy}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterMatchStatus('none')}
                className={`p-3 rounded-2xl border text-right transition ${
                  filterMatchStatus === 'none'
                    ? 'border-rose-500 bg-rose-50/70'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-800">غير موجود</span>
                  <XCircle className="w-4 h-4 text-rose-600" />
                </div>
                <span className="text-xl font-black text-rose-700 mt-1 block">
                  {matchStats.none}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterMatchStatus('all')}
                className={`p-3 rounded-2xl border text-right transition ${
                  filterMatchStatus === 'all'
                    ? 'border-slate-700 bg-slate-100'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">كل الصفوف</span>
                  <Eye className="w-4 h-4 text-slate-500" />
                </div>
                <span className="text-xl font-black text-slate-800 mt-1 block">
                  {matchStats.total}
                </span>
              </button>
            </div>

            {/* شريط البحث في الصفوف */}
            <div className="relative pt-2">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-5 pointer-events-none" />
              <input
                type="text"
                value={matchSearchTerm}
                onChange={(e) => setMatchSearchTerm(e.target.value)}
                placeholder="ابحث في أسماء الأصناف المطابقة..."
                className="w-full pr-9 pl-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:border-[#0f9d7a]"
              />
            </div>
          </div>

          {/* جدول مراجعة نتائج المطابقة */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4">اسم الصنف في الملف</th>
                    <th className="py-3 px-3 w-28">السعر</th>
                    <th className="py-3 px-3 w-36">حالة المطابقة</th>
                    <th className="py-3 px-4">الصنف المرتبط في النظام</th>
                    <th className="py-3 px-4 w-44 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedMatchRows.map((row) => {
                    const matchedProd = products.find((p) => p.id === row.selectedProductId);

                    return (
                      <tr
                        key={row.rowId}
                        className={`transition ${
                          row.status === 'ignored'
                            ? 'bg-slate-50/60 opacity-60'
                            : row.status === 'exact'
                            ? 'hover:bg-emerald-50/30'
                            : row.status === 'fuzzy'
                            ? 'hover:bg-amber-50/30'
                            : 'hover:bg-rose-50/30'
                        }`}
                      >
                        {/* 1) اسم الصنف في الملف */}
                        <td className="py-3 px-4">
                          <span className="font-extrabold text-slate-800 block">
                            {row.originalName}
                          </span>
                        </td>

                        {/* 2) السعر */}
                        <td className="py-3 px-3 font-black text-slate-900">
                          {formatCurrency(row.price)}
                        </td>

                        {/* 3) حالة المطابقة الملونة */}
                        <td className="py-3 px-3">
                          {row.status === 'exact' && (
                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold rounded-lg flex items-center gap-1 w-fit">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>مطابق تلقائياً</span>
                            </span>
                          )}
                          {row.status === 'fuzzy' && (
                            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-bold rounded-lg flex items-center gap-1 w-fit">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              <span>يحتاج مراجعة</span>
                            </span>
                          )}
                          {row.status === 'none' && (
                            <span className="px-2.5 py-1 bg-rose-100 text-rose-800 font-bold rounded-lg flex items-center gap-1 w-fit">
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>غير موجود</span>
                            </span>
                          )}
                          {row.status === 'ignored' && (
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-500 font-bold rounded-lg flex items-center gap-1 w-fit">
                              <span>متجاهل</span>
                            </span>
                          )}
                        </td>

                        {/* 4) الصنف المرتبط أو الاقتراحات */}
                        <td className="py-3 px-4">
                          {row.status === 'fuzzy' && row.suggestions.length > 0 ? (
                            <div className="space-y-1">
                              <select
                                value={row.selectedProductId || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setMatchRows((prev) =>
                                    prev.map((r) =>
                                      r.rowId === row.rowId
                                        ? {
                                            ...r,
                                            selectedProductId: val || null,
                                            status: val ? 'exact' : 'none',
                                          }
                                        : r
                                    )
                                  );
                                }}
                                className="w-full px-2.5 py-1.5 rounded-xl border border-amber-300 bg-amber-50/50 text-xs font-bold text-slate-800 focus:outline-hidden"
                              >
                                <option value="">اختر من أقرب الاقتراحات ({row.suggestions.length})...</option>
                                {row.suggestions.map((sug) => (
                                  <option key={sug.product.id} value={sug.product.id}>
                                    {sug.product.tradeName} ({sug.product.manufacturer})
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : matchedProd ? (
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#0f9d7a]">
                                {matchedProd.tradeName}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {matchedProd.manufacturer}
                              </span>
                            </div>
                          ) : (
                            <select
                              value={row.selectedProductId || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setMatchRows((prev) =>
                                  prev.map((r) =>
                                    r.rowId === row.rowId
                                      ? {
                                          ...r,
                                          selectedProductId: val || null,
                                          status: val ? 'exact' : 'none',
                                        }
                                      : r
                                  )
                                );
                              }}
                              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-700 bg-white"
                            >
                              <option value="">ربط يدوي بصنف موجود في النظام...</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.tradeName}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>

                        {/* 5) الإجراءات (إنشاء صنف جديد، تجاهل) */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {row.status === 'none' && (
                              <button
                                type="button"
                                onClick={() => handleOpenCreateProduct(row)}
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-[#0f9d7a] rounded-lg font-bold text-[11px] transition flex items-center gap-1"
                                title="إنشاء صنف جديد وتعبئة اسمه تلقائياً"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>إنشاء صنف</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setMatchRows((prev) =>
                                  prev.map((r) =>
                                    r.rowId === row.rowId
                                      ? {
                                          ...r,
                                          status: r.status === 'ignored' ? 'none' : 'ignored',
                                        }
                                      : r
                                  )
                                );
                              }}
                              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                                row.status === 'ignored'
                                  ? 'bg-slate-200 text-slate-700'
                                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {row.status === 'ignored' ? 'إلغاء التجاهل' : 'تجاهل'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* شريط الإجراءات السفلي */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition"
              >
                العودة لربط الأعمدة
              </button>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 font-semibold">
                  الأصناف الجاهزة للاعتماد:{' '}
                  <strong className="text-[#0f9d7a]">
                    {matchRows.filter((r) => r.status !== 'ignored' && r.selectedProductId).length}
                  </strong>
                </span>

                <button
                  type="button"
                  onClick={handleCommitImport}
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold transition shadow-xs flex items-center gap-2 active:scale-95 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{loading ? 'جاري الاعتماد...' : 'اعتماد الاستيراد وتحديث الأسعار'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================= الخطوة 4: ملخص الاعتماد الناجح ======================= */}
      {step === 4 && commitSummary && (
        <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-emerald-50 text-[#0f9d7a] border border-emerald-200 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900">
              تم اعتماد تحديث الأسعار بنجاح!
            </h2>
            <p className="text-xs text-slate-500">
              تم تسجيل التحديثات في قاعدة الأسعار وسجل التغييرات لـ ({selectedSupplier?.name})
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
            <div className="p-3 bg-white rounded-xl border border-slate-200">
              <span className="text-slate-400 block font-medium">الأسعار المحدثة</span>
              <span className="text-xl font-black text-[#0f9d7a] mt-1 block">
                {commitSummary.updatedCount}
              </span>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200">
              <span className="text-slate-400 block font-medium">الأسعار الجديدة</span>
              <span className="text-xl font-black text-sky-600 mt-1 block">
                {commitSummary.newCount}
              </span>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200">
              <span className="text-slate-400 block font-medium">الصفوف المتجاهلة</span>
              <span className="text-xl font-black text-slate-500 mt-1 block">
                {commitSummary.ignoredCount}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setSheetData(null);
                setGeminiItems([]);
                setMatchRows([]);
                setCommitSummary(null);
              }}
              className="w-full sm:w-auto px-6 py-2.5 bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold rounded-xl transition shadow-xs"
            >
              استيراد دفعة أسعار أخرى
            </button>

            <button
              type="button"
              onClick={() => {
                setTargetRollbackBatchId(commitSummary.batchId);
                setIsRollbackOpen(true);
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>التراجع عن هذا الاستيراد</span>
            </button>
          </div>
        </div>
      )}

      {/* نافذة إنشاء صنف جديد من جدول المطابقة */}
      <Modal
        isOpen={isNewProdModalOpen}
        onClose={() => setIsNewProdModalOpen(false)}
        title="إنشاء صنف تجاري جديد وربطه بالصف"
        maxWidth="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsNewProdModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="create-prod-form"
              className="px-5 py-2 text-xs font-bold text-white bg-[#0f9d7a] hover:bg-[#0b7a5e] rounded-xl shadow-xs"
            >
              إنشاء الصنف وربطه فوراً
            </button>
          </>
        }
      >
        <form id="create-prod-form" onSubmit={handleSaveNewProductAndLink} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الاسم التجاري *</label>
            <input
              type="text"
              required
              value={newProdTradeName}
              onChange={(e) => setNewProdTradeName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">المادة الفعالة *</label>
            <select
              value={newProdActiveIngId}
              onChange={(e) => setNewProdActiveIngId(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a] bg-white"
            >
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الشكل</label>
              <input
                type="text"
                value={newProdForm}
                onChange={(e) => setNewProdForm(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">التركيز</label>
              <input
                type="text"
                value={newProdStrength}
                onChange={(e) => setNewProdStrength(e.target.value)}
                placeholder="500mg..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الشركة المصنعة</label>
              <input
                type="text"
                value={newProdManufacturer}
                onChange={(e) => setNewProdManufacturer(e.target.value)}
                placeholder="GSK..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">التصنيف</label>
              <input
                type="text"
                value={newProdCategory}
                onChange={(e) => setNewProdCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a]"
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* تأكيد التراجع عن دفعة استيراد */}
      <ConfirmDialog
        isOpen={isRollbackOpen}
        onClose={() => setIsRollbackOpen(false)}
        onConfirm={executeRollback}
        title="التراجع عن دفعة الاستيراد"
        message="هل أنت متأكد من رغبتك في التراجع عن هذه الدفعة؟ سيتم استرجاع أسعار الأصناف كما كانت قبل عملية الاستيراد هذه مباشرة من سجل التاريخ."
        confirmText="نعم، التراجع واستعادة الأسعار"
      />
    </div>
  );
};
