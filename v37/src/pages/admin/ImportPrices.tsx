// src/pages/admin/ImportPrices.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  getSuppliers,
  getProducts,
  getActiveIngredients,
  saveSupplier,
  saveProductsBatch,
  commitImportBatch,
  getImportBatches,
  rollbackImportBatch,
  getPrices
} from '../../services/dataStorage';
import { Supplier, Product, ActiveIngredient, ImportBatch, PriceRecord } from '../../types';
import { parseSpreadsheetFile, processMappedRows, SheetParseResult, MappedPriceRow } from '../../services/import';
import { ProductMatcher, MatchResult } from '../../utils/fuzzyMatch';
import { normalizeArabic } from '../../utils/arabicNormalize';
import { classifyProduct } from '../../services/importQuality';
import { formatCurrency } from '../../utils/formatPrice';
import { formatGregorianDateTime } from '../../utils/formatDate';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import { createPriceImportApproval } from '../../services/changeApprovals';
import { recordActivity } from '../../services/v18Features';
import { saveSupplierImportTemplate } from '../../services/representatives';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Save,
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Eye,
  Search,
  Check,
  X,
  Clock,
  History,
  Building,
  Key
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { SearchSelect } from '../../components/SearchSelect';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Spinner } from '../../components/Loader';

type Step = 1 | 2 | 3 | 4; // 1: Input, 2: Mapping, 3: Matching Review, 4: Summary
type NewProductKind = 'medicine' | 'medical_supply' | 'other';

interface RowMatchItem {
  rowId: string;
  originalName: string;
  tradeName?: string;
  strength?: string;
  form?: string;
  manufacturer?: string;
  pack?: string;
  bonus?: string;
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
  const isRepresentative = user?.role === 'representative';
  const { success, error, warning, info } = useToastStore();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<ActiveIngredient[]>([]);
  const [recentBatches, setRecentBatches] = useState<ImportBatch[]>([]);
  const [existingPrices, setExistingPrices] = useState<PriceRecord[]>([]);

  // Selection
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');

  // File Upload State
  const [sheetData, setSheetData] = useState<SheetParseResult | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [startRow, setStartRow] = useState<number>(2);

  // Column Mapping State
  const [nameCol, setNameCol] = useState<number>(-1);
  const [strengthCol, setStrengthCol] = useState<number>(-1);
  const [formCol, setFormCol] = useState<number>(-1);
  const [packCol, setPackCol] = useState<number>(-1);
  const [manufacturerCol, setManufacturerCol] = useState<number>(-1);
  const [bonusCol, setBonusCol] = useState<number>(-1);
  const [priceCol, setPriceCol] = useState<number>(-1);
  const [publicPriceCol, setPublicPriceCol] = useState<number>(-1);
  const [availCol, setAvailCol] = useState<number>(-1);
  const [expiryCol, setExpiryCol] = useState<number>(-1);

  // Matching State
  const [matchRows, setMatchRows] = useState<RowMatchItem[]>([]);
  const [filterMatchStatus, setFilterMatchStatus] = useState<'all' | 'exact' | 'fuzzy' | 'none' | 'ignored'>('all');
  const [matchSearchTerm, setMatchSearchTerm] = useState('');

  // Audit Diff & Anomaly Detection State (تدقيق الاستيراد والمعاينة)
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditFilter, setAuditFilter] = useState<'all' | 'outlier' | 'changed' | 'new'>('all');

  // New Product Modal inline creation
  const [isNewProdModalOpen, setIsNewProdModalOpen] = useState(false);
  const [targetRowIdForNewProd, setTargetRowIdForNewProd] = useState<string | null>(null);
  const [newProdTradeName, setNewProdTradeName] = useState('');
  const [newProdActiveIngId, setNewProdActiveIngId] = useState('');
  const [newProdForm, setNewProdForm] = useState('');
  const [newProdStrength, setNewProdStrength] = useState('');
  const [newProdPack, setNewProdPack] = useState('');
  const [newProdManufacturer, setNewProdManufacturer] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('عام');
  const [newProdBarcode, setNewProdBarcode] = useState('');
  const [newProdType, setNewProdType] = useState<NewProductKind>('other');
  const [isSavingNewProd, setIsSavingNewProd] = useState(false);
  const [bulkCreateProgress, setBulkCreateProgress] = useState<{ completed: number; total: number; status: 'running' | 'done' | 'error' } | null>(null);

  // Summary State
  const [commitSummary, setCommitSummary] = useState<{
    batchId: string;
    updatedCount: number;
    newCount: number;
    ignoredCount: number;
    approvalPending?: boolean;
  } | null>(null);

  // Rollback Confirm
  const [isRollbackOpen, setIsRollbackOpen] = useState(false);
  const [targetRollbackBatchId, setTargetRollbackBatchId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadBaseData();
  }, [user?.role, user?.supplierId]);

  const loadBaseData = async () => {
    try {
      const [sups, prods, ings, batches] = await Promise.all([
        getSuppliers(),
        getProducts(),
        getActiveIngredients(),
        getImportBatches(),
      ]);
      const scopedSuppliers = user?.role === 'representative' ? sups.filter((supplier) => supplier.id === user.supplierId) : sups;
      setSuppliers(scopedSuppliers);
      setProducts(prods);
      setIngredients(ings);
      setRecentBatches(batches);
      const preferredSupplierId = user?.role === 'representative' ? user.supplierId : selectedSupplierId || scopedSuppliers[0]?.id;
      if (preferredSupplierId && scopedSuppliers.some((supplier) => supplier.id === preferredSupplierId)) setSelectedSupplierId(preferredSupplierId);
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
      if (t.columns.strength) setStrengthCol(findIdx(t.columns.strength));
      if (t.columns.form) setFormCol(findIdx(t.columns.form));
      if (t.columns.pack) setPackCol(findIdx(t.columns.pack));
      if (t.columns.manufacturer) setManufacturerCol(findIdx(t.columns.manufacturer));
      if (t.columns.price) setPriceCol(findIdx(t.columns.price));
      if (t.columns.publicPrice) setPublicPriceCol(findIdx(t.columns.publicPrice));
      if (t.columns.availability) setAvailCol(findIdx(t.columns.availability));
      if (t.columns.expiry) setExpiryCol(findIdx(t.columns.expiry));
      if (t.columns.bonus) setBonusCol(findIdx(t.columns.bonus));
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
          strength: getColLabel(strengthCol),
          form: getColLabel(formCol),
          pack: getColLabel(packCol),
          manufacturer: getColLabel(manufacturerCol),
          price: getColLabel(priceCol),
          publicPrice: getColLabel(publicPriceCol),
          availability: getColLabel(availCol),
          expiry: getColLabel(expiryCol),
          bonus: getColLabel(bonusCol),
        },
      };

      if (user?.role === 'representative') {
        await saveSupplierImportTemplate(selectedSupplier.id, template);
      } else {
        await saveSupplier({ ...selectedSupplier, importTemplate: template });
      }

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

    setBulkCreateProgress(null);
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
        if (norm.includes('تركيز') || norm.includes('strength') || norm.includes('concentration') || norm.includes('dose')) {
          if (strengthCol === -1) setStrengthCol(idx);
        } else if (norm.includes('شكل') || norm.includes('form') || norm.includes('dosage form') || norm.includes('presentation')) {
          if (formCol === -1) setFormCol(idx);
        } else if (norm.includes('عبو') || norm.includes('حجم') || norm.includes('pack') || norm.includes('package') || norm.includes('unit size')) {
          if (packCol === -1) setPackCol(idx);
        } else if (norm.includes('شرك') || norm.includes('مصنع') || norm.includes('manufacturer') || norm.includes('brand owner')) {
          if (manufacturerCol === -1) setManufacturerCol(idx);
        } else if (norm.includes('صنف') || norm.includes('اسم') || norm.includes('دواء') || norm.includes('item') || norm.includes('name')) {
          if (nameCol === -1) setNameCol(idx);
        } else if (norm.includes('بونص') || norm.includes('عرض') || norm.includes('bonus') || norm.includes('offer')) {
          if (bonusCol === -1) setBonusCol(idx);
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

  // الانتقال لخطوة المطابقة (Matching Step)
  const handleProceedToMatching = () => {
    let rowsToMatch: {
      rawName: string;
      tradeName: string;
      strength?: string;
      form?: string;
      manufacturer?: string;
      pack?: string;
      bonus?: string;
      price: number;
      publicPrice?: number;
      available?: boolean;
      expiry?: string;
    }[] = [];

    if (!sheetData) return;
    if (nameCol === -1 || priceCol === -1) {
      warning('يجب اختيار عمود اسم الصنف وعمود السعر على الأقل.');
      return;
    }

    const mapped = processMappedRows({
      allRows: sheetData.allRows,
      startRow,
      nameColIdx: nameCol,
      strengthColIdx: strengthCol,
      formColIdx: formCol,
      packColIdx: packCol,
      manufacturerColIdx: manufacturerCol,
      bonusColIdx: bonusCol,
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
      tradeName: r.rawTradeName || r.rawName,
      strength: r.rawStrength,
      form: r.rawForm,
      manufacturer: r.rawManufacturer,
      pack: r.rawPack,
      bonus: r.rawBonus,
      price: r.rawPrice!,
      publicPrice: r.rawPublicPrice || undefined,
      available: r.rawAvailability ? !r.rawAvailability.includes('غير') && !r.rawAvailability.includes('نفد') : true,
      expiry: r.rawExpiry,
    }));

    // تشغيل محرك المطابقة (Fuse.js + Normalization)
    const matcher = new ProductMatcher(products);
    const results: RowMatchItem[] = rowsToMatch.map((row, idx) => {
      const matchResult = matcher.match(row.rawName, row.manufacturer);

      return {
        rowId: 'row_' + idx + '_' + Date.now(),
        originalName: row.rawName,
        tradeName: row.tradeName,
        strength: row.strength,
        form: row.form,
        manufacturer: row.manufacturer,
        pack: row.pack,
        bonus: row.bonus,
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
    setNewProdTradeName(row.tradeName || row.originalName);
    setNewProdActiveIngId('');
    setNewProdForm(row.form || '');
    setNewProdStrength(row.strength || '');
    setNewProdPack(row.pack || '');
    setNewProdManufacturer(row.manufacturer || '');
    setNewProdBarcode('');
    const detectedCategory = classifyProduct(row.tradeName || row.originalName);
    setNewProdType(detectedCategory === 'مستلزم طبي' ? 'medical_supply' : (row.strength || row.form || detectedCategory === 'دواء') ? 'medicine' : 'other');
    setNewProdCategory(detectedCategory === 'غير مصنف' ? 'عام' : detectedCategory);
    setIsNewProdModalOpen(true);
  };

  // حفظ الصنف الجديد وربطه فوراً بالصف
  const handleSaveNewProductAndLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdTradeName.trim()) {
      error('يرجى إدخال الاسم التجاري.');
      return;
    }
    if (!targetRowIdForNewProd) {
      error('تعذر تحديد صف السعر المطلوب ربطه. أغلق النافذة وافتحها من الصف مرة أخرى.');
      return;
    }

    setIsSavingNewProd(true);
    const resolvedType: NewProductKind = newProdType === 'medicine' && !newProdActiveIngId ? 'other' : newProdType;
    const isMedicine = resolvedType === 'medicine';
    const savedCategory = resolvedType === 'other' && newProdType === 'medicine' && !newProdActiveIngId && newProdCategory === 'دواء'
      ? 'عام'
      : newProdCategory.trim() || 'عام';
    try {
      const [savedProd] = await saveProductsBatch([{
        tradeName: newProdTradeName.trim(),
        normalizedName: normalizeArabic(newProdTradeName.trim()),
        activeIngredientId: isMedicine ? newProdActiveIngId : '',
        form: isMedicine ? newProdForm.trim() : '',
        strength: isMedicine ? newProdStrength.trim() : '',
        packSize: newProdPack.trim(),
        manufacturer: newProdManufacturer.trim(),
        category: savedCategory,
        barcode: newProdBarcode.trim(),
        productType: resolvedType,
      }]);

      setProducts((prev) => [savedProd, ...prev.filter((product) => product.id !== savedProd.id)]);
      setMatchRows((prev) => prev.map((row) => row.rowId === targetRowIdForNewProd
        ? { ...row, selectedProductId: savedProd.id, status: 'exact' }
        : row));
      setIsNewProdModalOpen(false);
      setTargetRowIdForNewProd(null);
      success(`تم إنشاء الصنف (${savedProd.tradeName}) وربطه بصف السعر.`);
      if (newProdType === 'medicine' && !newProdActiveIngId) {
        info('لم تُختر مادة فعالة؛ حُفظ الصنف كغير دوائي.');
      }
    } catch (err: any) {
      error('تعذر حفظ الصنف أو ربطه: ' + (err?.message || 'تحقق من الاتصال والصلاحيات ثم أعد المحاولة.'));
    } finally {
      setIsSavingNewProd(false);
    }
  };

  // إنشاء كل الأصناف غير المربوطة دفعة واحدة، مع تجنب الأسماء المكررة داخل الملف وقاعدة البيانات.
  const handleCreateAllUnlinked = async () => {
    const unlinked = matchRows.filter((row) => row.status === 'none' && !row.selectedProductId && row.originalName.trim());
    if (!unlinked.length) { info('لا توجد أصناف غير مربوطة لإضافتها.'); return; }

    setLoading(true);
    setBulkCreateProgress({ completed: 0, total: unlinked.length, status: 'running' });
    let completed = 0;
    try {
      const groupKey = (row: RowMatchItem) => [
        row.tradeName || row.originalName,
        row.strength || '',
        row.form || '',
        row.pack || '',
        row.manufacturer || '',
      ].map((value) => normalizeArabic(value)).join('|');
      const groupsByKey = new Map<string, { key: string; rows: RowMatchItem[] }>();
      unlinked.forEach((row) => {
        const key = groupKey(row);
        const group = groupsByKey.get(key) || { key, rows: [] };
        group.rows.push(row);
        groupsByKey.set(key, group);
      });
      const groups = [...groupsByKey.values()];
      const compatibleField = (incoming?: string, existing?: string) =>
        !incoming || !existing || normalizeArabic(incoming) === normalizeArabic(existing);
      const existingForGroup = (group: { rows: RowMatchItem[] }) => {
        const row = group.rows[0];
        const name = normalizeArabic(row.tradeName || row.originalName);
        return products.find((product) =>
          normalizeArabic(product.tradeName) === name &&
          compatibleField(row.strength, product.strength) &&
          compatibleField(row.form, product.form) &&
          compatibleField(row.pack, product.packSize) &&
          compatibleField(row.manufacturer, product.manufacturer)
        );
      };

      const linksByRowId = new Map<string, Product>();
      const pendingGroups: typeof groups = [];
      groups.forEach((group) => {
        const existing = existingForGroup(group);
        if (existing) {
          group.rows.forEach((row) => linksByRowId.set(row.rowId, existing));
          completed += group.rows.length;
        } else {
          pendingGroups.push(group);
        }
      });
      if (linksByRowId.size) {
        setMatchRows((prev) => prev.map((row) => {
          const product = linksByRowId.get(row.rowId);
          return product ? { ...row, selectedProductId: product.id, status: 'exact' } : row;
        }));
        setBulkCreateProgress({ completed, total: unlinked.length, status: 'running' });
      }

      const itemsToCreate = pendingGroups.map((group) => {
        const row = group.rows[0];
        const tradeName = (row.tradeName || row.originalName).trim();
        const category = classifyProduct(tradeName);
        const productType: NewProductKind = category === 'مستلزم طبي' ? 'medical_supply' : category === 'دواء' ? 'medicine' : 'other';
        return {
          tradeName,
          normalizedName: normalizeArabic(tradeName),
          activeIngredientId: '',
          form: row.form || '',
          strength: row.strength || '',
          packSize: row.pack || '',
          manufacturer: row.manufacturer || '',
          category,
          productType,
        };
      });

      await saveProductsBatch(itemsToCreate, (savedChunk, startIndex) => {
        const chunkGroups = pendingGroups.slice(startIndex, startIndex + savedChunk.length);
        const links = new Map<string, Product>();
        chunkGroups.forEach((group, index) => {
          const product = savedChunk[index];
          group.rows.forEach((row) => links.set(row.rowId, product));
          completed += group.rows.length;
        });
        setProducts((prev) => {
          const ids = new Set(savedChunk.map((product) => product.id));
          return [...savedChunk, ...prev.filter((product) => !ids.has(product.id))];
        });
        setMatchRows((prev) => prev.map((row) => {
          const product = links.get(row.rowId);
          return product ? { ...row, selectedProductId: product.id, status: 'exact' } : row;
        }));
        setBulkCreateProgress({ completed, total: unlinked.length, status: 'running' });
      }, 20);

      setBulkCreateProgress({ completed: unlinked.length, total: unlinked.length, status: 'done' });
      success(`اكتمل ربط ${unlinked.length} صفاً. تمت إضافة ${pendingGroups.length} صنف جديد وتحديث عداد المطابقة مباشرة.`);
    } catch (err: any) {
      setBulkCreateProgress({ completed, total: unlinked.length, status: 'error' });
      error(`توقفت الإضافة بعد ربط ${completed} من ${unlinked.length} صفاً. بقيت الصفوف غير المنجزة ظاهرة ويمكن إعادة المحاولة: ${err?.message || 'خطأ في الاتصال أو الصلاحيات'}`);
    } finally {
      setLoading(false);
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
        bonus: r.bonus,
        available: r.available,
        expiry: r.expiry,
      }));

      if (priceRecords.length >= 50) {
        const approval = await createPriceImportApproval({
          supplierId: selectedSupplierId,
          supplierName: selectedSupplier?.name || selectedSupplierId,
          fileName: currentFileName,
          priceRecords,
        });
        setCommitSummary({ batchId: approval.id, updatedCount: 0, newCount: 0, ignoredCount: matchRows.length - validCommitRows.length, approvalPending: true });
        setStep(4);
        success('أُرسل الاستيراد للمراجعة الثانية؛ لم تُحدّث الأسعار بعد.');
        return;
      }

      const res = await commitImportBatch({
        supplierId: selectedSupplierId,
        fileName: currentFileName,
        createdBy: user.name || 'مدير النظام',
        createdByUid: user.uid,
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
      try {
        await recordActivity({
          type: 'price_import_failed', actorId: user.uid, actorName: user.name || user.email, actorRole: user.role,
          message: `فشل استيراد الأسعار إلى ${selectedSupplier?.name || selectedSupplierId}`,
          metadata: { supplierId: selectedSupplierId, fileName: currentFileName, error: err?.message || String(err) },
        });
      } catch { /* preserve the original import error */ }
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
            <span>{isRepresentative ? `رفع أسعار ${selectedSupplier?.name || 'المستودع المرتبط'}` : 'رفع وتحديث أسعار المستودعات'}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isRepresentative ? 'استيراد Excel/CSV للمستودع المرتبط فقط؛ لا يسمح هذا الحساب بإنشاء أصناف أو التراجع عن دفعات الإدارة.' : 'استيراد ملفات Excel/CSV أو مسح القوائم بالذكاء الاصطناعي مع المطابقة الذكية والتراجع'}
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
              {isRepresentative ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-black text-emerald-900">{selectedSupplier?.name || 'لا يوجد مستودع نشط مرتبط'}</div> : <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full sm:w-96 px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 bg-white focus:outline-hidden focus:border-[#0f9d7a]"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.importTemplate ? '⭐ (لديه قالب محفوظ)' : ''}
                  </option>
                ))}
              </select>}
            </div>

            {/* طريقة الإدخال */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                اختر طريقة إدخال وتوريد الأسعار:
              </label>
              <div className="grid grid-cols-1 gap-4">
                <div className="p-5 rounded-2xl border border-[#0f9d7a] bg-emerald-50/40 ring-1 ring-[#0f9d7a] text-right flex flex-col justify-between">
                  <FileSpreadsheet className="w-8 h-8 mb-3 text-[#0f9d7a]" />
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">ملف Excel / CSV</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      يدعم ملفات .xlsx و .csv و .xls مع اختيار ورقة العمل وصف البداية
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* محتوى الإدخال بناءً على الطريقة */}
            <div className="pt-4 border-t border-slate-100">
              {(
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
                          <span>{formatGregorianDateTime(batch.createdAt)}</span>
                        </div>
                      </div>

                      {!isRepresentative && <button
                        onClick={() => {
                          setTargetRollbackBatchId(batch.id);
                          setIsRollbackOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold transition flex items-center gap-1.5 w-fit"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>التراجع عن هذه الدفعة</span>
                      </button>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================= الخطوة 2: ربط الأعمدة ======================= */}
      {step === 2 && (
        <div className="space-y-6">
          {sheetData && (
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

              {/* واجهة ربط الأعمدة الأساسية والاختيارية */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
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

                {/* أعمدة اختيارية لتوحيد أسماء الموردين */}
                {[['التركيز (اختياري)', strengthCol, setStrengthCol], ['الشكل (اختياري)', formCol, setFormCol], ['العبوة (اختياري)', packCol, setPackCol], ['الشركة (اختياري)', manufacturerCol, setManufacturerCol]].map(([label, value, setter]: any) => (
                  <div key={label as string}>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{label as string}</label>
                    <select value={value as number} onChange={(e) => setter(parseInt(e.target.value))} className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white">
                      <option value={-1}>-- غير محدد --</option>
                      {sheetData.columnHeaders.map((colLetter, idx) => { const headerText = sheetData.previewRows[0]?.cells[idx] || ''; return <option key={colLetter} value={idx}>العمود {colLetter} {headerText ? `(${headerText})` : ''}</option>; })}
                    </select>
                  </div>
                ))}
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
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">البونص / العرض (اختياري)</label>
                  <select value={bonusCol} onChange={(e) => setBonusCol(parseInt(e.target.value))} className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white">
                    <option value={-1}>-- غير محدد --</option>
                    {sheetData.columnHeaders.map((colLetter, idx) => { const headerText = sheetData.previewRows[0]?.cells[idx] || ''; return <option key={colLetter} value={idx}>العمود {colLetter} {headerText ? `(${headerText})` : ''}</option>; })}
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
                {!isRepresentative && <button
                  type="button"
                  onClick={handleCreateAllUnlinked}
                  disabled={loading || matchStats.none === 0}
                  className="px-3.5 py-2 rounded-xl bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>{bulkCreateProgress?.status === 'running' ? `جاري الإضافة (${bulkCreateProgress.completed}/${bulkCreateProgress.total})` : `إضافة كل الأصناف غير المربوطة (${matchStats.none})`}</span>
                </button>}
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
                  <span>{loading ? (bulkCreateProgress?.status === 'running' ? `ربط الأصناف (${bulkCreateProgress.completed}/${bulkCreateProgress.total})` : 'جاري الاعتماد...') : 'اعتماد الاستيراد وتحديث الأسعار'}</span>
                </button>
              </div>
            </div>

            {bulkCreateProgress && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3" role="status" aria-live="polite">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-indigo-900">
                  <span>{bulkCreateProgress.status === 'running' ? 'حفظ الأصناف وربطها جارٍ' : bulkCreateProgress.status === 'done' ? 'اكتمل ربط الصفوف' : 'توقفت العملية؛ يمكنك إعادة محاولة الصفوف المتبقية'}</span>
                  <span>{bulkCreateProgress.completed} / {bulkCreateProgress.total}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={bulkCreateProgress.total} aria-valuenow={bulkCreateProgress.completed}>
                  <div className="h-full rounded-full bg-[#0f9d7a] transition-all" style={{ width: `${Math.round((bulkCreateProgress.completed / bulkCreateProgress.total) * 100)}%` }} />
                </div>
                <p className="mt-2 text-[11px] text-indigo-800">يتحدّث عدّاد «غير موجود» و«مطابق تماماً» بعد اعتماد كل دفعة.</p>
              </div>
            )}

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
                            {!isRepresentative && row.status === 'none' && (
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

      {/* ======================= الخطوة 4: ملخص الاعتماد أو انتظار المراجعة ======================= */}
      {step === 4 && commitSummary && (
        <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center space-y-6">
          <div className={`w-20 h-20 rounded-3xl ${commitSummary.approvalPending ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-[#0f9d7a] border-emerald-200'} border flex items-center justify-center mx-auto shadow-sm`}>
            {commitSummary.approvalPending ? <Clock className="w-10 h-10" /> : <CheckCircle2 className="w-10 h-10" />}
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900">
              {commitSummary.approvalPending ? 'الدفعة بانتظار المراجعة الثانية' : 'تم اعتماد تحديث الأسعار بنجاح!'}
            </h2>
            <p className="text-xs text-slate-500">
              {commitSummary.approvalPending ? `لم تُطبّق الأسعار بعد. طلب الاعتماد ${commitSummary.batchId} أرسله مدير ثانٍ للمراجعة.` : `تم تسجيل التحديثات في قاعدة الأسعار وسجل التغييرات لـ (${selectedSupplier?.name})`}
            </p>
          </div>

          {!commitSummary.approvalPending && <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
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
          </div>}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setSheetData(null);
                setMatchRows([]);
                setCommitSummary(null);
              }}
              className="w-full sm:w-auto px-6 py-2.5 bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold rounded-xl transition shadow-xs"
            >
              استيراد دفعة أسعار أخرى
            </button>

            {!commitSummary.approvalPending && <button
              type="button"
              onClick={() => {
                setTargetRollbackBatchId(commitSummary.batchId);
                setIsRollbackOpen(true);
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>التراجع عن هذا الاستيراد</span>
            </button>}
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
              disabled={isSavingNewProd}
              onClick={() => setIsNewProdModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={isSavingNewProd}
              onClick={() => (document.getElementById('create-prod-form') as HTMLFormElement | null)?.requestSubmit()}
              className="px-5 py-2 text-xs font-bold text-white bg-[#0f9d7a] hover:bg-[#0b7a5e] rounded-xl shadow-xs disabled:opacity-50"
            >
              {isSavingNewProd ? 'جاري حفظ الصنف وربطه...' : 'إنشاء الصنف وربطه فوراً'}
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
            <label className="block text-xs font-bold text-slate-700 mb-1">نوع الصنف</label>
            <select
              value={newProdType}
              onChange={(e) => {
                const type = e.target.value as NewProductKind;
                setNewProdType(type);
                if (type !== 'medicine') {
                  setNewProdActiveIngId('');
                  setNewProdForm('');
                  setNewProdStrength('');
                }
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white focus:outline-hidden focus:border-[#0f9d7a]"
            >
              <option value="medicine">دواء</option>
              <option value="medical_supply">مستلزم طبي</option>
              <option value="other">غير دوائي</option>
            </select>
          </div>

          {newProdType === 'medicine' && (
            <>
              <SearchSelect
                label="المادة الفعالة (ابحث واختر من القائمة)"
                placeholder="اكتب للبحث في المواد الفعالة المخزنة..."
                options={ingredients.map((ingredient) => ({ id: ingredient.id, label: ingredient.name, subLabel: ingredient.category }))}
                value={newProdActiveIngId}
                onChange={setNewProdActiveIngId}
              />
              <p className="-mt-2 text-[11px] text-slate-500">إذا لم تختر مادة فعالة، فسيُحفظ الصنف كغير دوائي. أضف المادة من الإدارة أولاً إذا لم تكن موجودة.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الشكل الدوائي</label>
                  <input type="text" value={newProdForm} onChange={(e) => setNewProdForm(e.target.value)} placeholder="أقراص، شراب، حقن..." className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">التركيز</label>
                  <input type="text" value={newProdStrength} onChange={(e) => setNewProdStrength(e.target.value)} placeholder="مثال: 160/50 mg" className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a]" />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">حجم العبوة / عدد الوحدات</label>
            <input type="text" value={newProdPack} onChange={(e) => setNewProdPack(e.target.value)} placeholder="30 قرصاً، 5 أمبولات، 100 مل..." className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الشركة المصنعة</label>
              <input type="text" value={newProdManufacturer} onChange={(e) => setNewProdManufacturer(e.target.value)} placeholder="GSK..." className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">التصنيف</label>
              <input type="text" value={newProdCategory} onChange={(e) => setNewProdCategory(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a]" />
            </div>
          </div>

          {newProdType !== 'medicine' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الباركود (اختياري)</label>
              <input type="text" value={newProdBarcode} onChange={(e) => setNewProdBarcode(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:outline-hidden focus:border-[#0f9d7a]" />
            </div>
          )}
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
