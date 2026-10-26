// src/pages/admin/ImportPrices.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { formatCatalogName } from '../../utils/catalogNameFormat';
import {
  getSuppliers,
  getProducts,
  getActiveIngredients,
  saveSupplier,
  getProductAliases,
  getGlobalProductAliases,
  saveProductAlias,
  saveGlobalProductAliasesBatch,
  deleteProductAlias,
  saveProduct,
  saveProductsBatch,
  commitImportBatch,
  getImportBatches,
  rollbackImportBatch,
  getPrices,
  getSystemSettings
} from '../../services/dataStorage';
import { Supplier, Product, ProductAlias, ActiveIngredient, ImportBatch, PriceRecord } from '../../types';
import { parseSpreadsheetFile, processMappedRows, SheetParseResult, MappedPriceRow } from '../../services/import';
import { ProductMatcher } from '../../utils/fuzzyMatch';
import { normalizeArabic } from '../../utils/arabicNormalize';
import { getProductActiveIngredientIds } from '../../utils/catalogImport';
import { classifyProduct } from '../../services/importQuality';
import { formatCurrency } from '../../utils/formatPrice';
import { formatGregorianDateTime } from '../../utils/formatDate';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import { recordActivity } from '../../services/v18Features';
import { saveSupplierImportTemplate } from '../../services/representatives';
import {
  UploadCloud,
  Download,
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
  X,
  Clock,
  History,
  Building,
  Key,
  Pencil
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { SearchSelect } from '../../components/SearchSelect';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Spinner } from '../../components/Loader';
import { PriceReviewPanel } from '../../components/PriceReviewPanel';

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
  barcode?: string;
  bonus?: string;
  price: number;
  publicPrice?: number;
  available: boolean;
  expiry?: string;
  status: 'exact' | 'fuzzy' | 'none' | 'ignored';
  selectedProductId: string | null;
  suggestions: { product: Product; score: number }[];
}

interface RowEditDraft {
  originalName: string;
  strength: string;
  form: string;
  pack: string;
  manufacturer: string;
  barcode: string;
  price: string;
  publicPrice: string;
  available: boolean;
  expiry: string;
  bonus: string;
}

interface ProductEditDraft {
  id: string;
  tradeName: string;
  activeIngredientId: string;
  activeIngredientIds: string[];
  form: string;
  strength: string;
  packSize: string;
  manufacturer: string;
  category: string;
  barcode: string;
  productType: NewProductKind;
}

export const ImportPrices: React.FC = () => {
  const { user } = useAuthStore();
  const isRepresentative = user?.role === 'representative';
  const isAdmin = user?.role === 'admin';
  const isPharmacy = user?.role === 'pharmacy';
  const canCreateProducts = isAdmin || (isPharmacy && user?.pharmacyCatalogPermissions?.createProducts === true);
  const { success, error, warning, info } = useToastStore();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<ActiveIngredient[]>([]);
  const [recentBatches, setRecentBatches] = useState<ImportBatch[]>([]);
  const [existingPrices, setExistingPrices] = useState<PriceRecord[]>([]);
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);

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
  const [barcodeCol, setBarcodeCol] = useState<number>(-1);
  const [bonusCol, setBonusCol] = useState<number>(-1);
  const [priceCol, setPriceCol] = useState<number>(-1);
  const [publicPriceCol, setPublicPriceCol] = useState<number>(-1);
  const [availCol, setAvailCol] = useState<number>(-1);
  const [expiryCol, setExpiryCol] = useState<number>(-1);

  // Matching State
  const [matchRows, setMatchRows] = useState<RowMatchItem[]>([]);
  const [matchingProgress, setMatchingProgress] = useState<{ completed: number; total: number; status: 'running' | 'done' | 'error' } | null>(null);
  const [commitProgress, setCommitProgress] = useState<{ completed: number; total: number; status: 'running' | 'done' | 'error' } | null>(null);
  const [supplierAliases, setSupplierAliases] = useState<ProductAlias[]>([]);
  const [globalAliases, setGlobalAliases] = useState<ProductAlias[]>([]);
  const [loadingGlobalAliases, setLoadingGlobalAliases] = useState(true);
  const supplierAliasCacheRef = useRef<Map<string, ProductAlias[]>>(new Map());
  const [loadingSupplierAliases, setLoadingSupplierAliases] = useState(false);
  const [isAliasManagerOpen, setIsAliasManagerOpen] = useState(false);
  const [filterMatchStatus, setFilterMatchStatus] = useState<'all' | 'exact' | 'fuzzy' | 'none' | 'ignored'>('all');
  const [matchSearchTerm, setMatchSearchTerm] = useState('');
  const [matchPage, setMatchPage] = useState(1);

  // تحرير صف السعر قبل الاعتماد
  const [isRowEditModalOpen, setIsRowEditModalOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rowEditDraft, setRowEditDraft] = useState<RowEditDraft | null>(null);

  // تحرير الصنف المرتبط من شاشة المطابقة
  const [isProductEditModalOpen, setIsProductEditModalOpen] = useState(false);
  const [productEditDraft, setProductEditDraft] = useState<ProductEditDraft | null>(null);
  const [isSavingProductEdit, setIsSavingProductEdit] = useState(false);

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
    rolledBack?: boolean;
  } | null>(null);

  // Rollback Confirm
  const [isRollbackOpen, setIsRollbackOpen] = useState(false);
  const [targetRollbackBatchId, setTargetRollbackBatchId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoredDraftKeyRef = useRef<string>('');
  const [draftRecoveryReady, setDraftRecoveryReady] = useState(false);
  const [draftRecovered, setDraftRecovered] = useState(false);
  const draftStorageKey = user?.uid && selectedSupplierId
    ? `linkpharma_price_import_draft_v51:${user.uid}:${selectedSupplierId}`
    : '';

  // استعادة مسودة الاستيراد بعد إعادة فتح الصفحة أو انقطاع الاتصال.
  useEffect(() => {
    if (!draftStorageKey || products.length === 0) {
      setDraftRecoveryReady(false);
      return;
    }
    if (restoredDraftKeyRef.current === draftStorageKey) return;
    restoredDraftKeyRef.current = draftStorageKey;
    setDraftRecoveryReady(false);
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft?.version === 1 && draft?.sheetData && Array.isArray(draft?.matchRows)) {
          setSheetData(draft.sheetData);
          setCurrentFileName(String(draft.currentFileName || ''));
          setSelectedSheetName(String(draft.selectedSheetName || draft.sheetData.selectedSheet || ''));
          setStartRow(Number(draft.startRow) || 2);
          setNameCol(Number.isInteger(draft.nameCol) ? draft.nameCol : -1);
          setStrengthCol(Number.isInteger(draft.strengthCol) ? draft.strengthCol : -1);
          setFormCol(Number.isInteger(draft.formCol) ? draft.formCol : -1);
          setPackCol(Number.isInteger(draft.packCol) ? draft.packCol : -1);
          setManufacturerCol(Number.isInteger(draft.manufacturerCol) ? draft.manufacturerCol : -1);
          setBarcodeCol(Number.isInteger(draft.barcodeCol) ? draft.barcodeCol : -1);
          setBonusCol(Number.isInteger(draft.bonusCol) ? draft.bonusCol : -1);
          setPriceCol(Number.isInteger(draft.priceCol) ? draft.priceCol : -1);
          setPublicPriceCol(Number.isInteger(draft.publicPriceCol) ? draft.publicPriceCol : -1);
          setAvailCol(Number.isInteger(draft.availCol) ? draft.availCol : -1);
          setExpiryCol(Number.isInteger(draft.expiryCol) ? draft.expiryCol : -1);
          const restoredRows: RowMatchItem[] = draft.matchRows.map((row: any) => ({
            ...row,
            suggestions: (Array.isArray(row.suggestions) ? row.suggestions : [])
              .map((suggestion: any) => {
                const product = products.find((item) => item.id === (suggestion.productId || suggestion.product?.id));
                return product ? { product, score: Number(suggestion.score) || 0 } : null;
              }).filter(Boolean),
          }));
          setMatchRows(restoredRows);
          setStep(draft.step === 3 && restoredRows.length ? 3 : 2);
          setDraftRecovered(true);
          info(`استعدنا مسودة الاستيراد: ${restoredRows.length || draft.sheetData.allRows?.length || 0} صفاً. راجعها وأكمل من حيث توقفت.`);
        }
      }
    } catch (restoreError) {
      console.error('تعذر استعادة مسودة استيراد الأسعار', restoreError);
      warning('تعذر قراءة مسودة الاستيراد المحفوظة؛ الملف الأصلي لم يتغير.');
    } finally {
      setDraftRecoveryReady(true);
    }
  }, [draftStorageKey, products.length]);

  // حفظ المسودة محلياً بعد كل تغيير مهم، ولا يشمل هذا اعتماد الأسعار في قاعدة البيانات.
  useEffect(() => {
    if (!draftRecoveryReady || !draftStorageKey || !sheetData || step < 2 || step > 3) return;
    try {
      const draft = {
        version: 1,
        savedAt: new Date().toISOString(),
        step,
        supplierId: selectedSupplierId,
        currentFileName,
        sheetData,
        selectedSheetName,
        startRow,
        nameCol, strengthCol, formCol, packCol, manufacturerCol, barcodeCol,
        bonusCol, priceCol, publicPriceCol, availCol, expiryCol,
        matchRows: matchRows.map((row) => ({
          ...row,
          suggestions: row.suggestions.map((suggestion) => ({ productId: suggestion.product.id, score: suggestion.score })),
        })),
      };
      localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    } catch (saveError) {
      console.error('تعذر حفظ مسودة استيراد الأسعار', saveError);
    }
  }, [draftRecoveryReady, draftStorageKey, step, sheetData, currentFileName, selectedSheetName, startRow,
    nameCol, strengthCol, formCol, packCol, manufacturerCol, barcodeCol, bonusCol, priceCol,
    publicPriceCol, availCol, expiryCol, matchRows, selectedSupplierId]);

  useEffect(() => {
    loadBaseData();
  }, [user?.role, user?.supplierId, user?.pharmacyCatalogPermissions?.priceSupplierIds?.join(',')]);

  useEffect(() => {
    if (!selectedSupplierId) { setExistingPrices([]); return; }
    void getPrices([selectedSupplierId], true).then(setExistingPrices).catch(() => setExistingPrices([]));
    setReviewAcknowledged(false);
  }, [selectedSupplierId]);

  const loadBaseData = async () => {
    try {
      setLoadingGlobalAliases(true);
      const [sups, prods, ings, batches, settings, platformAliases] = await Promise.all([
        getSuppliers(),
        getProducts(),
        getActiveIngredients(),
        getImportBatches(),
        getSystemSettings(),
        getGlobalProductAliases().catch((aliasError) => {
          console.error('تعذر تحميل قاموس الأسماء العام', aliasError);
          warning('تعذر تحميل القاموس العام حالياً؛ ستعمل المطابقة بالأسماء الأساسية وروابط المورد المحفوظة فقط.');
          return [] as ProductAlias[];
        }),
      ]);
      const pharmacySupplierIds = user?.role === 'pharmacy' && user.pharmacyCatalogPermissions?.managePrices ? user.pharmacyCatalogPermissions.priceSupplierIds || [] : [];
      const scopedSuppliers = user?.role === 'representative' ? sups.filter((supplier) => supplier.id === user.supplierId) : user?.role === 'pharmacy' ? sups.filter((supplier) => pharmacySupplierIds.includes(supplier.id) && supplier.status === 'active') : sups;
      setSuppliers(scopedSuppliers);
      setProducts(prods);
      setIngredients(ings);
      setRecentBatches(batches);
      setGlobalAliases(platformAliases);
      const preferredSupplierId = user?.role === 'representative' ? user.supplierId : user?.role === 'pharmacy' ? (scopedSuppliers.some((supplier) => supplier.id === selectedSupplierId) ? selectedSupplierId : scopedSuppliers[0]?.id) : selectedSupplierId || scopedSuppliers[0]?.id;
      if (preferredSupplierId && scopedSuppliers.some((supplier) => supplier.id === preferredSupplierId)) setSelectedSupplierId(preferredSupplierId);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingGlobalAliases(false);
    }
  };

  const selectedSupplier = useMemo(() => {
    return suppliers.find((s) => s.id === selectedSupplierId);
  }, [suppliers, selectedSupplierId]);

  // لا نخلط aliases بين الموردين: لكل مورد cache مستقل داخل هذه الشاشة.
  useEffect(() => {
    let cancelled = false;
    if (!selectedSupplierId) {
      setSupplierAliases([]);
      setLoadingSupplierAliases(false);
      return;
    }
    const cached = supplierAliasCacheRef.current.get(selectedSupplierId);
    if (cached) {
      setSupplierAliases(cached);
      setLoadingSupplierAliases(false);
      return;
    }
    setLoadingSupplierAliases(true);
    getProductAliases(selectedSupplierId)
      .then((rows) => {
        if (cancelled) return;
        supplierAliasCacheRef.current.set(selectedSupplierId, rows);
        setSupplierAliases(rows);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setSupplierAliases([]);
          warning('تعذر تحميل أسماء هذا المورد البديلة؛ ستبقى المطابقة اليدوية لهذه الدفعة فقط.');
          console.error(err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSupplierAliases(false);
      });
    return () => { cancelled = true; };
  }, [selectedSupplierId]);

  const productMatcher = useMemo(
    () => new ProductMatcher(products, [...supplierAliases, ...globalAliases], selectedSupplierId),
    [products, supplierAliases, globalAliases, selectedSupplierId]
  );

  const productOptions = useMemo(() => products.map((product) => ({
    id: product.id,
    label: product.tradeName,
    subLabel: [
      product.strength || 'بدون تركيز',
      product.form || 'بدون شكل',
      product.packSize || 'بدون عبوة',
      product.manufacturer || 'بدون شركة',
    ].join(' • '),
  })), [products]);

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
        } else if (norm.includes('باركود') || norm.includes('barcode') || norm.includes('ean') || norm.includes('gtin')) {
          if (barcodeCol === -1) setBarcodeCol(idx);
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
  const handleProceedToMatching = async () => {
    if (loadingSupplierAliases || loadingGlobalAliases) {
      warning('انتظر اكتمال تحميل قاموس الأسماء العام وأسماء المورد قبل بدء المطابقة.');
      return;
    }
    let rowsToMatch: {
      rawName: string;
      tradeName: string;
      strength?: string;
      form?: string;
      manufacturer?: string;
      pack?: string;
      barcode?: string;
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
      barcode: barcodeCol >= 0 ? sheetData.allRows.find((sourceRow) => sourceRow.rowNumber === r.rowNumber)?.cells[barcodeCol]?.trim() || undefined : undefined,
      bonus: r.rawBonus,
      price: r.rawPrice!,
      publicPrice: r.rawPublicPrice || undefined,
      available: r.rawAvailability ? !r.rawAvailability.includes('غير') && !r.rawAvailability.includes('نفد') : true,
      expiry: r.rawExpiry,
    }));

    setLoading(true);
    setMatchingProgress({ completed: 0, total: rowsToMatch.length, status: 'running' });
    try {
      const results: RowMatchItem[] = [];
      for (let idx = 0; idx < rowsToMatch.length; idx++) {
        const row = rowsToMatch[idx];
        const matchResult = productMatcher.match(row.rawName, row.manufacturer, {
          tradeName: row.tradeName,
          strength: row.strength,
          form: row.form,
          packSize: row.pack,
          barcode: row.barcode,
        });
        results.push({
          rowId: `row_${idx}_${Date.now()}`,
          originalName: row.rawName,
          tradeName: row.tradeName,
          strength: row.strength,
          form: row.form,
          manufacturer: row.manufacturer,
          pack: row.pack,
          barcode: row.barcode,
          bonus: row.bonus,
          price: row.price,
          publicPrice: row.publicPrice,
          available: row.available ?? true,
          expiry: row.expiry,
          status: matchResult.status,
          selectedProductId: matchResult.matchedProduct ? matchResult.matchedProduct.id : null,
          suggestions: matchResult.suggestions,
        });
        if ((idx + 1) % 30 === 0 || idx + 1 === rowsToMatch.length) {
          setMatchingProgress({ completed: idx + 1, total: rowsToMatch.length, status: 'running' });
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      }
      setMatchRows(results);
      setReviewAcknowledged(false);
      setMatchPage(1);
      setStep(3);
      setMatchingProgress({ completed: results.length, total: results.length, status: 'done' });
      info(`تمت مطابقة ${results.length} صفاً. يرجى مراجعة الحالات.`);
    } catch (err: any) {
      setMatchingProgress((current) => current ? { ...current, status: 'error' } : null);
      error(`تعذرت المطابقة: ${err?.message || 'خطأ غير متوقع'}`);
    } finally {
      setLoading(false);
      window.setTimeout(() => setMatchingProgress((current) => current?.status === 'done' ? null : current), 2200);
    }
  };

  const handleDeleteAlias = async (alias: ProductAlias) => {
    if (!window.confirm(`فك ربط الاسم "${alias.rawName}"؟ ستحتاج لربطه يدوياً مرة أخرى عند ظهوره في ملف هذا المورد.`)) return;
    try {
      await deleteProductAlias(alias.supplierId, alias.id);
      setSupplierAliases((prev) => {
        const next = prev.filter((item) => item.id !== alias.id);
        supplierAliasCacheRef.current.set(alias.supplierId, next);
        return next;
      });
      success('تم فك الربط. سيُعاد فحص الاسم في الدفعات القادمة.');
    } catch (err: any) {
      error(err?.message || 'تعذر فك الربط.');
    }
  };

  const handleSmartRematch = async () => {
    if (!matchRows.length) return;
    setLoading(true);
    setMatchingProgress({ completed: 0, total: matchRows.length, status: 'running' });
    const nextRows: RowMatchItem[] = [];
    try {
      for (let index = 0; index < matchRows.length; index++) {
        const row = matchRows[index];
        if (row.selectedProductId || row.status === 'ignored') nextRows.push(row);
        else {
          const result = productMatcher.match(row.originalName, row.manufacturer, {
            tradeName: row.tradeName,
            strength: row.strength,
            form: row.form,
            packSize: row.pack,
            barcode: row.barcode,
          });
          nextRows.push({ ...row, status: result.status, selectedProductId: result.matchedProduct?.id || null, suggestions: result.suggestions });
        }
        if ((index + 1) % 30 === 0 || index + 1 === matchRows.length) {
          setMatchingProgress({ completed: index + 1, total: matchRows.length, status: 'running' });
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      }
    } catch (err: any) {
      setMatchingProgress((current) => current ? { ...current, status: 'error' } : null);
      error(`تعذرت إعادة المطابقة: ${err?.message || 'خطأ غير متوقع'}`);
      setLoading(false);
      return;
    }
    setMatchRows(nextRows);
    setReviewAcknowledged(false);
    setMatchingProgress({ completed: nextRows.length, total: nextRows.length, status: 'done' });
    setLoading(false);
    window.setTimeout(() => setMatchingProgress((current) => current?.status === 'done' ? null : current), 2200);
    success(`اكتملت المطابقة الذكية مجدداً. تمت المحافظة على اختياراتك اليدوية، وأعيد فحص ${nextRows.filter((row) => !row.selectedProductId && row.status !== 'ignored').length} صف غير مربوط.`);
  };

  const handleOpenRowEditor = (row: RowMatchItem) => {
    setEditingRowId(row.rowId);
    setRowEditDraft({
      originalName: row.originalName || '',
      strength: row.strength || '',
      form: row.form || '',
      pack: row.pack || '',
      manufacturer: row.manufacturer || '',
      barcode: row.barcode || '',
      price: String(row.price ?? ''),
      publicPrice: row.publicPrice === undefined ? '' : String(row.publicPrice),
      available: row.available,
      expiry: row.expiry || '',
      bonus: row.bonus || '',
    });
    setIsRowEditModalOpen(true);
  };

  const handleSaveRowEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRowId || !rowEditDraft) return;
    const price = Number(rowEditDraft.price.replace(/,/g, '').trim());
    const publicPriceText = rowEditDraft.publicPrice.replace(/,/g, '').trim();
    const publicPrice = publicPriceText ? Number(publicPriceText) : undefined;
    if (!Number.isFinite(price) || price <= 0) {
      error('يرجى إدخال سعر شراء صحيح أكبر من صفر.');
      return;
    }
    if (publicPriceText && (!Number.isFinite(publicPrice) || (publicPrice as number) < 0)) {
      error('السعر العام غير صالح. اتركه فارغاً أو أدخل رقماً صحيحاً.');
      return;
    }

    const currentRow = matchRows.find((row) => row.rowId === editingRowId);
    const originalName = rowEditDraft.originalName.trim();
    // عند تعديل القوة/العبوة فقط يبقى الاسم التجاري الأساسي، ولا نعيد استخدام الاسم المركب القديم كاسم تجاري.
    const tradeName = currentRow && originalName === currentRow.originalName
      ? (currentRow.tradeName || originalName)
      : originalName;
    const identity = {
      strength: rowEditDraft.strength.trim() || undefined,
      form: rowEditDraft.form.trim() || undefined,
      packSize: rowEditDraft.pack.trim() || undefined,
      barcode: rowEditDraft.barcode.trim() || undefined,
    };
    const matchResult = productMatcher.match(
      originalName,
      rowEditDraft.manufacturer.trim() || undefined,
      {
        ...identity,
        tradeName,
        manufacturer: rowEditDraft.manufacturer.trim() || undefined,
      }
    );

    setMatchRows((prev) => prev.map((row) => row.rowId === editingRowId ? {
      ...row,
      originalName,
      tradeName,
      strength: identity.strength,
      form: identity.form,
      pack: identity.packSize,
      manufacturer: rowEditDraft.manufacturer.trim() || undefined,
      barcode: identity.barcode,
      price,
      publicPrice,
      available: rowEditDraft.available,
      expiry: rowEditDraft.expiry.trim() || undefined,
      bonus: rowEditDraft.bonus.trim() || undefined,
      status: matchResult.status,
      selectedProductId: matchResult.matchedProduct?.id || null,
      suggestions: matchResult.suggestions,
    } : row));
    setIsRowEditModalOpen(false);
    setEditingRowId(null);
    setRowEditDraft(null);
    success('تم حفظ بيانات الصف وإعادة بناء المطابقة فوراً.');
  };

  const handleManualProductSelect = async (row: RowMatchItem, productId: string) => {
    const selectedProduct = products.find((product) => product.id === productId);
    setMatchRows((prev) => prev.map((item) => item.rowId === row.rowId ? {
      ...item,
      selectedProductId: selectedProduct?.id || null,
      status: selectedProduct ? 'exact' : 'none',
    } : item));
    if (!selectedProduct) return;
    const rawName = row.originalName.trim();
    if (!selectedSupplierId || !rawName) {
      info('تم الربط لهذه الدفعة فقط لأن الاسم الأصلي فارغ.');
      return;
    }
    try {
      const outcome = await saveGlobalProductAliasesBatch([{ productId: selectedProduct.id, rawName }]).catch(() => null);
      if (outcome && (outcome.saved || outcome.alreadyLinked)) {
        setGlobalAliases(await getGlobalProductAliases().catch(() => globalAliases));
        success('تم ربط الصنف وحفظ الاسم في القاموس العام لكل الموردين.');
        return;
      }
      const alias = await saveProductAlias({
        supplierId: selectedSupplierId,
        productId: selectedProduct.id,
        rawName,
        manufacturer: row.manufacturer?.trim() || undefined,
        strength: row.strength?.trim() || undefined,
        form: row.form?.trim() || undefined,
        packSize: row.pack?.trim() || undefined,
        barcode: row.barcode?.trim() || undefined,
      });
      setSupplierAliases((prev) => {
        const next = [...prev.filter((item) => item.id !== alias.id), alias];
        supplierAliasCacheRef.current.set(selectedSupplierId, next);
        return next;
      });
      success('تم ربط الصنف وحفظ الاسم الأصلي كاسم بديل لهذا المورد.');
    } catch (err: any) {
      warning(`تم الربط لهذه الدفعة فقط؛ تعذر حفظ الاسم البديل: ${err?.message || 'خطأ غير معروف'}`);
    }
  };

  const handleOpenProductEditor = (product: Product) => {
    setProductEditDraft({
      id: product.id,
      tradeName: product.tradeName || '',
      activeIngredientId: product.activeIngredientId || '',
      activeIngredientIds: getProductActiveIngredientIds(product),
      form: product.form || '',
      strength: product.strength || '',
      packSize: product.packSize || '',
      manufacturer: product.manufacturer || '',
      category: product.category || '',
      barcode: product.barcode || '',
      productType: product.productType || (product.activeIngredientId ? 'medicine' : 'other'),
    });
    setIsProductEditModalOpen(true);
  };

  const handleSaveProductEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productEditDraft) return;
    if (!productEditDraft.tradeName.trim()) {
      error('يرجى إدخال الاسم التجاري للصنف.');
      return;
    }
    const effectiveType: NewProductKind = productEditDraft.productType === 'medicine' && productEditDraft.activeIngredientIds.length === 0
      ? 'other'
      : productEditDraft.productType;
    setIsSavingProductEdit(true);
    try {
      const existing = products.find((product) => product.id === productEditDraft.id);
      const saved = await saveProduct({
        ...(existing || {}),
        id: productEditDraft.id,
        tradeName: productEditDraft.tradeName.trim(),
        normalizedName: normalizeArabic(productEditDraft.tradeName.trim()),
        activeIngredientId: effectiveType === 'medicine' ? productEditDraft.activeIngredientIds[0] || '' : '',
        activeIngredientIds: effectiveType === 'medicine' ? productEditDraft.activeIngredientIds : [],
        form: productEditDraft.form.trim(),
        strength: productEditDraft.strength.trim(),
        packSize: productEditDraft.packSize.trim(),
        manufacturer: productEditDraft.manufacturer.trim(),
        category: productEditDraft.category.trim() || 'عام',
        barcode: productEditDraft.barcode.trim() || undefined,
        productType: effectiveType,
      });
      const nextProducts = [saved, ...products.filter((product) => product.id !== saved.id)];
      const latestMatcher = new ProductMatcher(nextProducts, [...supplierAliases, ...globalAliases], selectedSupplierId);
      setProducts(nextProducts);
      setMatchRows((prev) => prev.map((row) => {
        if (row.status === 'ignored') return row;
        const matchResult = latestMatcher.match(row.originalName, row.manufacturer, {
          tradeName: row.tradeName || row.originalName,
          strength: row.strength,
          form: row.form,
          packSize: row.pack,
          barcode: row.barcode,
        });
        // اختيار المستخدم/الربط السابق مقصود، فلا نستبدله باقتراح تقريبي بعد تعديل المنتج.
        if (row.selectedProductId) {
          return {
            ...row,
            status: 'exact',
            suggestions: matchResult.suggestions,
          };
        }
        return {
          ...row,
          status: matchResult.status,
          selectedProductId: matchResult.matchedProduct?.id || null,
          suggestions: matchResult.suggestions,
        };
      }));
      setIsProductEditModalOpen(false);
      setProductEditDraft(null);
      success('تم حفظ تعديل الصنف مع الحفاظ على معرفه وربطه الحالي.');
      if (productEditDraft.productType === 'medicine' && !productEditDraft.activeIngredientId) {
        info('لم تُختر مادة فعالة؛ حُفظ الصنف كغير دوائي.');
      }
    } catch (err: any) {
      error('تعذر حفظ تعديل الصنف: ' + (err?.message || 'تحقق من الاتصال والصلاحيات ثم أعد المحاولة.'));
    } finally {
      setIsSavingProductEdit(false);
    }
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
    setCommitProgress({ completed: 0, total: validCommitRows.length, status: 'running' });
    try {
      const priceRecords = validCommitRows.map((r) => ({
        productId: r.selectedProductId!,
        price: r.price,
        publicPrice: r.publicPrice,
        bonus: r.bonus,
        available: r.available,
        expiry: r.expiry,
      }));

      const res = await commitImportBatch({
        supplierId: selectedSupplierId,
        fileName: currentFileName,
        createdBy: user.name || 'مدير النظام',
        createdByUid: user.uid,
        priceRecords,
        onProgress: (completed, total) => setCommitProgress({ completed, total, status: 'running' }),
      });

      await recordActivity({
        type: 'price_import_published', actorId: user.uid, actorName: user.name || user.email, actorRole: user.role,
        message: `تم نشر دفعة أسعار بعد مراجعة الفرق لمورد ${selectedSupplier?.name || selectedSupplierId}`,
        metadata: { supplierId: selectedSupplierId, fileName: currentFileName, updatedCount: res.updatedCount, newCount: res.newCount, reviewed: true },
      });

      const ignoredCount = matchRows.filter((r) => r.status === 'ignored' || !r.selectedProductId).length;

      setCommitSummary({
        batchId: res.batchId,
        updatedCount: res.updatedCount,
        newCount: res.newCount,
        ignoredCount,
      });

      setStep(4);
      setCommitProgress({ completed: validCommitRows.length, total: validCommitRows.length, status: 'done' });
      if (draftStorageKey) localStorage.removeItem(draftStorageKey);
      setDraftRecovered(false);
      success(`تم اعتماد الاستيراد بنجاح! تم تحديث ${res.updatedCount} صنفاً وإضافة ${res.newCount} جديداً.`);
      await loadBaseData();
    } catch (err: any) {
      setCommitProgress((current) => current ? { ...current, status: 'error' } : null);
      try {
        await recordActivity({
          type: 'price_import_failed', actorId: user.uid, actorName: user.name || user.email, actorRole: user.role,
          message: `فشل استيراد الأسعار إلى ${selectedSupplier?.name || selectedSupplierId}`,
          metadata: { supplierId: selectedSupplierId, fileName: currentFileName, error: err?.message || String(err) },
        });
      } catch { /* preserve the original import error */ }
      await loadBaseData();
      error('فشل اعتماد الاستيراد: ' + err.message);
    } finally {
      setLoading(false);
      window.setTimeout(() => setCommitProgress((current) => current?.status === 'done' ? null : current), 2500);
    }
  };

  // التراجع عن دفعة استيراد سابقة
  const executeRollback = async () => {
    if (!targetRollbackBatchId) return;
    setLoading(true);
    try {
      const ok = await rollbackImportBatch(targetRollbackBatchId);
      if (ok) {
        setCommitSummary((current) => current?.batchId === targetRollbackBatchId
          ? { ...current, rolledBack: true }
          : current);
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
  const matchPageSize = 50;
  const matchPageCount = Math.max(1, Math.ceil(displayedMatchRows.length / matchPageSize));
  const safeMatchPage = Math.min(matchPage, matchPageCount);
  const visibleMatchRows = useMemo(() => displayedMatchRows.slice((safeMatchPage - 1) * matchPageSize, safeMatchPage * matchPageSize), [displayedMatchRows, safeMatchPage]);

  // إحصاءات المطابقة
  /** تصدير الأصناف غير المربوطة بصيغة ملف الربط، لإرسالها للذكاء الاصطناعي ثم رفعها في صفحة القاموس. */
  const exportUnlinkedRows = () => {
    const list = matchRows.filter((row) => (row.status === 'none' || row.status === 'fuzzy') && !row.selectedProductId && row.originalName.trim());
    if (!list.length) { info('لا توجد أصناف غير مربوطة للتصدير.'); return; }
    const sheet = XLSX.utils.json_to_sheet(list.map((row) => ({
      'الصنف في النظام': row.suggestions[0]?.product ? formatCatalogName(row.suggestions[0].product) : '',
      'اسم الصنف في الملف': row.originalName,
      'نسبة الثقة': '',
      'العبوة': row.pack || '',
      'السعر': row.price,
      'ملاحظة': row.status === 'fuzzy' ? 'اقتراح تلقائي يحتاج مراجعة' : 'غير موجود في الكتالوج',
    })));
    sheet['!cols'] = [{ wch: 42 }, { wch: 42 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 28 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'الربط الكامل');
    XLSX.writeFile(book, 'اصناف_غير_مربوطة.xlsx');
    success(`تم تصدير ${list.length} صنفاً غير مربوط.`);
  };

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
            <span>{isRepresentative ? `رفع أسعار ${selectedSupplier?.name || 'المستودع المرتبط'}` : isPharmacy ? 'رفع وتحديث الأسعار المصرّح بها' : 'رفع وتحديث أسعار المستودعات'}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isRepresentative ? 'استيراد Excel/CSV للمستودع المرتبط فقط؛ لا يسمح هذا الحساب بإنشاء أصناف أو التراجع عن دفعات الإدارة.' : isPharmacy ? 'استيراد Excel/CSV للموردين الذين حددتهم الإدارة فقط؛ لا يسمح هذا الحساب بحذف دفعات الأسعار أو تغيير بيانات مورد.' : 'استيراد ملفات Excel/CSV أو مسح القوائم بالذكاء الاصطناعي مع المطابقة الذكية والتراجع'}
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

      {matchingProgress && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3" role="status" aria-live="polite">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-indigo-900">
            <span>{matchingProgress.status === 'running' ? 'جارٍ تحليل ومطابقة الأصناف دون إيقاف الصفحة' : matchingProgress.status === 'done' ? 'اكتملت المطابقة' : 'توقفت المطابقة بسبب خطأ'}</span>
            <span>{matchingProgress.completed} / {matchingProgress.total}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={matchingProgress.total} aria-valuenow={matchingProgress.completed}>
            <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${Math.round((matchingProgress.completed / matchingProgress.total) * 100)}%` }} />
          </div>
        </div>
      )}
      {commitProgress && (
        <div className={`rounded-2xl border px-4 py-3 ${commitProgress.status === 'error' ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`} role="status" aria-live="polite">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-slate-800">
            <span>{commitProgress.status === 'running' ? 'جارٍ حفظ الأسعار على دفعات؛ يمكنك إبقاء الصفحة مفتوحة' : commitProgress.status === 'done' ? 'اكتمل حفظ الأسعار' : 'توقف حفظ الأسعار؛ راجع سجل الدفعات قبل إعادة الاعتماد'}</span>
            <span>{commitProgress.completed} / {commitProgress.total}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={commitProgress.total} aria-valuenow={commitProgress.completed}>
            <div className={`h-full rounded-full transition-all ${commitProgress.status === 'error' ? 'bg-rose-600' : 'bg-emerald-600'}`} style={{ width: `${Math.round((commitProgress.completed / commitProgress.total) * 100)}%` }} />
          </div>
        </div>
      )}

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
              {loadingSupplierAliases && selectedSupplierId && <p className="mt-1.5 text-[11px] text-slate-500">جاري تحميل أسماء هذا المورد البديلة...</p>}
              {loadingGlobalAliases ? <p className="mt-1.5 text-[11px] text-slate-500">جاري تحميل قاموس الأسماء العام...</p> : <p className="mt-1.5 text-[11px] font-bold text-emerald-700">قاموس الأسماء العام للمنصة: {globalAliases.length} اسماً — يطبق على جميع الموردين.</p>}
              {user?.role === 'admin' && selectedSupplierId && !loadingSupplierAliases && (
                <button type="button" onClick={() => setIsAliasManagerOpen(true)} className="mt-2 text-[11px] font-bold text-sky-700 hover:underline">
                  الأسماء البديلة المحفوظة لهذا المورد ({supplierAliases.length}) · فك الربط
                </button>
              )}
              <Modal isOpen={isAliasManagerOpen} onClose={() => setIsAliasManagerOpen(false)} title="الأسماء البديلة المحفوظة" maxWidth="2xl">
                <div className="space-y-2" dir="rtl">
                  <p className="text-[11px] text-slate-500">كل اسم هنا رُبط يدوياً بصنف، ويُربط تلقائياً عند ظهوره في ملف هذا المورد. فك الربط لتصحيح ربط خاطئ.</p>
                  {supplierAliases.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500">لا توجد أسماء بديلة محفوظة لهذا المورد.</p>}
                  <div className="max-h-[55vh] space-y-1.5 overflow-auto">
                    {supplierAliases.map((alias) => {
                      const linked = products.find((item) => item.id === alias.productId);
                      return (
                        <div key={alias.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-2.5 text-xs">
                          <div className="min-w-0">
                            <div className="truncate font-bold text-slate-800">{alias.rawName}</div>
                            <div className="truncate text-slate-500">← {linked ? [linked.tradeName, linked.strength, linked.form].filter(Boolean).join(' ') : 'صنف محذوف'}</div>
                          </div>
                          <button type="button" onClick={() => handleDeleteAlias(alias)} className="shrink-0 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100">فك الربط</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Modal>
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
                  const progressAt = Date.parse(batch.progressUpdatedAt || batch.createdAt);
                  const progressIsFresh = !Number.isFinite(progressAt) || Date.now() - progressAt < 5 * 60 * 1000;
                  const isImportActive = batch.importStatus === 'in_progress' && progressIsFresh;
                  const isRollbackActive = batch.importStatus === 'rolling_back' && progressIsFresh;
                  const isActive = isImportActive || isRollbackActive;
                  const isRolledBack = batch.importStatus === 'rolled_back';
                  const isIncomplete = batch.importStatus === 'interrupted' ||
                    ((batch.importStatus === 'in_progress' || batch.importStatus === 'rolling_back') && !isActive);
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
                          <span>{batch.writtenRowsCount ?? batch.rowsCount} / {batch.rowsCount} صنفاً</span>
                          <span className={`rounded-full px-2 py-0.5 font-bold ${isActive ? 'bg-sky-50 text-sky-700' : isIncomplete ? 'bg-amber-50 text-amber-700' : isRolledBack ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>
                            {isImportActive ? 'قيد الاستيراد' : isRollbackActive ? 'قيد التراجع' : isIncomplete ? 'غير مكتملة — يمكن استكمال التراجع' : isRolledBack ? 'تم التراجع' : 'مكتملة'}
                          </span>
                          <span>•</span>
                          <span>بواسطة: {batch.createdBy}</span>
                          <span>•</span>
                          <span>{formatGregorianDateTime(batch.createdAt)}</span>
                        </div>
                      </div>

                      {isAdmin && !isRolledBack && <button
                        disabled={isActive}
                        onClick={() => {
                          setTargetRollbackBatchId(batch.id);
                          setIsRollbackOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold transition flex items-center gap-1.5 w-fit disabled:opacity-40 disabled:cursor-not-allowed"
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

                  {!isPharmacy && <button
                    onClick={handleSaveSupplierTemplate}
                    className="px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-bold border border-purple-200 transition flex items-center gap-1.5"
                    title="حفظ ترتيب هذه الأعمدة في مستند المورد لتطبيقه تلقائياً في المرات القادمة"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>حفظ هذا الترتيب لهذا المورد</span>
                  </button>}
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
                {[['التركيز (اختياري)', strengthCol, setStrengthCol], ['الشكل (اختياري)', formCol, setFormCol], ['العبوة (اختياري)', packCol, setPackCol], ['الشركة (اختياري)', manufacturerCol, setManufacturerCol], ['الباركود (اختياري)', barcodeCol, setBarcodeCol]].map(([label, value, setter]: any) => (
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
                  disabled={loadingSupplierAliases || loadingGlobalAliases || loading}
                  className="px-6 py-2.5 rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold transition shadow-xs flex items-center gap-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>{loadingGlobalAliases || loadingSupplierAliases ? 'جاري تحميل قاموس الأسماء...' : matchingProgress?.status === 'running' ? `المطابقة ${matchingProgress.completed}/${matchingProgress.total}` : 'متابعة لمطابقة الأصناف'}</span>
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
                  onClick={handleSmartRematch}
                  disabled={loading || matchRows.every((row) => row.selectedProductId || row.status === 'ignored')}
                  className="px-3.5 py-2 rounded-xl bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                  title="إعادة فحص الصفوف غير المربوطة مع الحفاظ على الاختيارات اليدوية"
                >
                  <Search className="w-4 h-4" />
                  إعادة المطابقة الذكية
                </button>
                {canCreateProducts && <button
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
                  onClick={handleCommitImport}
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold transition shadow-xs flex items-center gap-2 active:scale-95 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{commitProgress?.status === 'running' ? `اعتماد الأسعار (${commitProgress.completed}/${commitProgress.total})` : loading ? (bulkCreateProgress?.status === 'running' ? `ربط الأصناف (${bulkCreateProgress.completed}/${bulkCreateProgress.total})` : 'جارٍ العمل...') : 'اعتماد الاستيراد وتحديث الأسعار'}</span>
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
            {(matchStats.none > 0 || matchStats.fuzzy > 0) && (
              <button type="button" onClick={exportUnlinkedRows} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 px-3 py-2 text-[11px] font-black text-sky-700 hover:bg-sky-100">
                <Download className="h-3.5 w-3.5" /> تصدير الأصناف غير المربوطة (للربط في القاموس)
              </button>
            )}

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
                  {visibleMatchRows.map((row) => {
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

                        {/* 4) الصنف المرتبط أو الاختيار اليدوي */}
                        <td className="py-3 px-4 min-w-[240px]">
                          <div className="space-y-2">
                            <SearchSelect
                              placeholder="ابحث واربط بصنف موجود في النظام..."
                              options={productOptions}
                              value={row.selectedProductId || ''}
                              onChange={(value) => { void handleManualProductSelect(row, value); }}
                            />
                            {row.status === 'fuzzy' && row.suggestions.length > 0 && (
                              <p className="text-[10px] text-amber-700">اقتراحات تقريبية فقط؛ اختر يدوياً ولا يعتمد أي اقتراح تلقائياً.</p>
                            )}
                            {matchedProd && (
                              <div className="flex items-start justify-between gap-2 rounded-lg bg-emerald-50/60 px-2 py-1.5">
                                <div className="min-w-0">
                                  <span className="font-bold text-[#0f9d7a] block truncate">{matchedProd.tradeName}</span>
                                  <span className="text-[10px] text-slate-500 block">{[matchedProd.strength, matchedProd.form, matchedProd.packSize, matchedProd.manufacturer].filter(Boolean).join(' • ') || 'بيانات الهوية غير مكتملة'}</span>
                                </div>
                                {isAdmin && <button type="button" onClick={() => handleOpenProductEditor(matchedProd)} className="shrink-0 p-1 rounded-lg text-slate-500 hover:text-[#0f9d7a] hover:bg-white" title="تعديل الصنف المحدد">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 5) الإجراءات (إنشاء صنف جديد، تجاهل) */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenRowEditor(row)}
                              className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg font-bold text-[11px] transition flex items-center gap-1"
                              title="تحرير بيانات صف السعر قبل الاعتماد"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>تحرير الصف</span>
                            </button>

                            {canCreateProducts && row.status === 'none' && (
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

            {displayedMatchRows.length > matchPageSize && (
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs">
                <span className="font-semibold text-slate-500">عرض {(safeMatchPage - 1) * matchPageSize + 1}–{Math.min(safeMatchPage * matchPageSize, displayedMatchRows.length)} من {displayedMatchRows.length} صفاً</span>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={safeMatchPage <= 1} onClick={() => setMatchPage((page) => Math.max(1, page - 1))} className="min-h-10 rounded-lg border px-3 font-bold disabled:opacity-40">السابق</button>
                  <span className="font-black text-slate-700">{safeMatchPage} / {matchPageCount}</span>
                  <button type="button" disabled={safeMatchPage >= matchPageCount} onClick={() => setMatchPage((page) => Math.min(matchPageCount, page + 1))} className="min-h-10 rounded-lg border px-3 font-bold disabled:opacity-40">التالي</button>
                </div>
              </div>
            )}

            <PriceReviewPanel
              rows={matchRows}
              products={products}
              existingPrices={existingPrices.filter((price) => price.supplierId === selectedSupplierId)}
              onContinue={() => { setReviewAcknowledged(true); info('تم تسجيل مراجعة فرق الأسعار؛ يمكنك الآن اعتماد الاستيراد.'); }}
            />

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
                disabled={loading || !reviewAcknowledged}
                  className="px-6 py-2.5 rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold transition shadow-xs flex items-center gap-2 active:scale-95 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{commitProgress?.status === 'running' ? `اعتماد الأسعار (${commitProgress.completed}/${commitProgress.total})` : loading ? 'جارٍ الاعتماد...' : reviewAcknowledged ? 'اعتماد الاستيراد وتحديث الأسعار' : 'راجع الفرق أولاً'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================= الخطوة 4: ملخص الاعتماد أو انتظار المراجعة ======================= */}
      {step === 4 && commitSummary && (
        <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-emerald-50 text-[#0f9d7a] border-emerald-200 border flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900">
              تم اعتماد تحديث الأسعار بنجاح!
            </h2>
            <p className="text-xs text-slate-500">
              {`تم تسجيل التحديثات في قاعدة الأسعار وسجل التغييرات لـ (${selectedSupplier?.name})`}
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
                setMatchRows([]);
                setCommitSummary(null);
                if (draftStorageKey) localStorage.removeItem(draftStorageKey);
                setDraftRecovered(false);
              }}
              className="w-full sm:w-auto px-6 py-2.5 bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold rounded-xl transition shadow-xs"
            >
              استيراد دفعة أسعار أخرى
            </button>

            {commitSummary.rolledBack ? (
              <span className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold">
                تم التراجع عن هذا الاستيراد
              </span>
            ) : (<button
              type="button"
              onClick={() => {
                setTargetRollbackBatchId(commitSummary.batchId);
                setIsRollbackOpen(true);
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>التراجع عن هذا الاستيراد</span>
            </button>)}
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

      {/* نافذة تحرير صف السعر قبل الاعتماد */}
      <Modal
        isOpen={isRowEditModalOpen}
        onClose={() => { setIsRowEditModalOpen(false); setEditingRowId(null); setRowEditDraft(null); }}
        title="تحرير بيانات صف السعر"
        maxWidth="lg"
        footer={
          <>
            <button type="button" onClick={() => { setIsRowEditModalOpen(false); setEditingRowId(null); setRowEditDraft(null); }} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">إلغاء</button>
            <button type="button" onClick={() => (document.getElementById('edit-price-row-form') as HTMLFormElement | null)?.requestSubmit()} className="px-5 py-2 text-xs font-bold text-white bg-[#0f9d7a] hover:bg-[#0b7a5e] rounded-xl shadow-xs">حفظ وإعادة المطابقة</button>
          </>
        }
      >
        {rowEditDraft && (
          <form id="edit-price-row-form" onSubmit={handleSaveRowEdit} className="space-y-4">
            <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-[11px] text-sky-800">يمكن تعديل بيانات هذا الصف فقط قبل الاعتماد؛ لا تتغير بقية البيانات الخام في الملف.</div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الاسم التجاري الأصلي</label>
              <input type="text" value={rowEditDraft.originalName} onChange={(e) => setRowEditDraft({ ...rowEditDraft, originalName: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                ['التركيز', 'strength'], ['الشكل', 'form'], ['العبوة', 'pack'], ['الشركة المصنعة', 'manufacturer'], ['الباركود', 'barcode'], ['تاريخ الانتهاء', 'expiry'], ['البونص', 'bonus'],
              ] as const).map(([label, key]) => (
                <div key={key}>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{label}</label>
                  <input type="text" value={rowEditDraft[key]} onChange={(e) => setRowEditDraft({ ...rowEditDraft, [key]: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a]" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">السعر</label>
                <input type="text" inputMode="decimal" value={rowEditDraft.price} onChange={(e) => setRowEditDraft({ ...rowEditDraft, price: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold focus:outline-hidden focus:border-[#0f9d7a]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">السعر العام</label>
                <input type="text" inputMode="decimal" value={rowEditDraft.publicPrice} onChange={(e) => setRowEditDraft({ ...rowEditDraft, publicPrice: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold focus:outline-hidden focus:border-[#0f9d7a]" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <input type="checkbox" checked={rowEditDraft.available} onChange={(e) => setRowEditDraft({ ...rowEditDraft, available: e.target.checked })} className="accent-[#0f9d7a]" />
              متوفر لدى المورد
            </label>
          </form>
        )}
      </Modal>

      {/* نافذة تحرير الصنف المرتبط مع الحفاظ على المعرّف */}
      <Modal
        isOpen={isProductEditModalOpen}
        onClose={() => { if (!isSavingProductEdit) { setIsProductEditModalOpen(false); setProductEditDraft(null); } }}
        title="تحرير الصنف المرتبط"
        maxWidth="lg"
        footer={
          <>
            <button type="button" disabled={isSavingProductEdit} onClick={() => { setIsProductEditModalOpen(false); setProductEditDraft(null); }} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl disabled:opacity-50">إلغاء</button>
            <button type="button" disabled={isSavingProductEdit} onClick={() => (document.getElementById('edit-linked-product-form') as HTMLFormElement | null)?.requestSubmit()} className="px-5 py-2 text-xs font-bold text-white bg-[#0f9d7a] hover:bg-[#0b7a5e] rounded-xl shadow-xs disabled:opacity-50">{isSavingProductEdit ? 'جاري الحفظ...' : 'حفظ تعديل الصنف'}</button>
          </>
        }
      >
        {productEditDraft && (
          <form id="edit-linked-product-form" onSubmit={handleSaveProductEdit} className="space-y-4">
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">سيُحفظ التعديل على الصنف نفسه (المعرّف: {productEditDraft.id}) ولن يتغير ربط الصفوف الحالي.</div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الاسم التجاري *</label>
              <input required type="text" value={productEditDraft.tradeName} onChange={(e) => setProductEditDraft({ ...productEditDraft, tradeName: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نوع المنتج</label>
              <select value={productEditDraft.productType} onChange={(e) => setProductEditDraft({ ...productEditDraft, productType: e.target.value as NewProductKind, activeIngredientId: e.target.value === 'medicine' ? productEditDraft.activeIngredientId : '', activeIngredientIds: e.target.value === 'medicine' ? productEditDraft.activeIngredientIds : [] })} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white focus:outline-hidden focus:border-[#0f9d7a]">
                <option value="medicine">دواء</option>
                <option value="medical_supply">مستلزم طبي</option>
                <option value="other">غير دوائي</option>
              </select>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <label className="block text-xs font-bold text-slate-700 mb-2">المواد الفعالة (اختر واحدة أو أكثر)</label>
              <div className="max-h-36 overflow-auto space-y-1">{ingredients.map((ingredient) => <label key={ingredient.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50">
                <input type="checkbox" checked={productEditDraft.activeIngredientIds.includes(ingredient.id)} onChange={(event) => {
                  const next = event.target.checked ? [...productEditDraft.activeIngredientIds, ingredient.id] : productEditDraft.activeIngredientIds.filter((id) => id !== ingredient.id);
                  setProductEditDraft({ ...productEditDraft, activeIngredientIds: next, activeIngredientId: next[0] || '' });
                }} />{ingredient.name}<small className="text-slate-400">{ingredient.category}</small>
              </label>)}</div>
              <p className="mt-2 text-[10px] text-slate-500">المحدد: {productEditDraft.activeIngredientIds.map((id) => ingredients.find((ingredient) => ingredient.id === id)?.name).filter(Boolean).join(' + ') || 'لا توجد مادة'}</p>
            </div>
            <p className="-mt-2 text-[11px] text-slate-500">يمكن للصنف أن يحتوي على أكثر من مادة فعالة؛ اترك القائمة فارغة للمستلزمات أو غير الدوائي.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                ['التركيز', 'strength'], ['الشكل', 'form'], ['العبوة', 'packSize'], ['الشركة المصنعة', 'manufacturer'], ['التصنيف', 'category'], ['الباركود', 'barcode'],
              ] as const).map(([label, key]) => (
                <div key={key}>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{label}</label>
                  <input type="text" value={productEditDraft[key]} onChange={(e) => setProductEditDraft({ ...productEditDraft, [key]: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a]" />
                </div>
              ))}
            </div>
          </form>
        )}
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
