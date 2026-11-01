// src/pages/admin/Products.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useLiveCollections } from '../../hooks/useLiveCollections';
import {
  getProducts,
  getActiveIngredients,
  saveProduct,
  deleteProducts,
  updateProductsCategory,
  saveActiveIngredient,
  getPricesForProductIds,
  getSuppliers,
  getDosageForms,
} from '../../services/dataStorage';
import { Product, ActiveIngredient } from '../../types';
import { normalizeArabic } from '../../utils/arabicNormalize';
import { MigrationChange, planProductIdentityMigration } from '../../utils/productIdentity';
import { getProductActiveIngredientIds } from '../../utils/catalogImport';
import { productCompactName } from '../../utils/productCatalog';
import { useToastStore } from '../../store/useToastStore';
import {
  Pill,
  Plus,
  Search,
  Edit,
  Trash2,
  Filter,
  Layers,
  RotateCcw,
  Tag,
  Building,
} from 'lucide-react';
import { Table, Column } from '../../components/Table';
import { ExportActions, ExportColumn } from '../../components/admin/ExportActions';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { BulkBar } from '../../components/BulkBar';
import { Pagination } from '../../components/Pagination';
import { EmptyState } from '../../components/EmptyState';
import { Spinner, TableSkeleton } from '../../components/Loader';

const DEFAULT_DOSAGE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Oral Suspension',
  'Injection',
  'Ointment',
  'Cream',
  'Oral Drops',
  'Eye Drops',
  'Effervescent Tablet',
  'Spray',
  'Gel',
  'Suppository',
];

type ProductExportRecord = Product & { supplierPrices?: string };

export const Products: React.FC = () => {
  const { success, error, warning } = useToastStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<ActiveIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [dosageFormNames, setDosageFormNames] = useState<string[]>([]);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedIngredient, setSelectedIngredient] = useState<string>('all');
  const [selectedForm, setSelectedForm] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Pagination state (50 items per page as requested)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 50;

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form Fields
  const [tradeName, setTradeName] = useState('');
  const [activeIngredientId, setActiveIngredientId] = useState('');
  const [selectedActiveIngredientIds, setSelectedActiveIngredientIds] = useState<string[]>([]);
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [form, setForm] = useState(DEFAULT_DOSAGE_FORMS[0]);
  const [strength, setStrength] = useState('');
  const [packSize, setPackSize] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [category, setCategory] = useState('');
  const [barcode, setBarcode] = useState('');
  const [showStrength, setShowStrength] = useState(false);
  const [isMigrationOpen, setIsMigrationOpen] = useState(false);
  const [migrationStrip, setMigrationStrip] = useState(true);
  const [migrationSkipped, setMigrationSkipped] = useState<Set<string>>(new Set());
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Mini-modal inside modal: Add new active ingredient inline
  const [isAddIngredientMiniOpen, setIsAddIngredientMiniOpen] = useState(false);
  const [newIngName, setNewIngName] = useState('');
  const [newIngCategory, setNewIngCategory] = useState('');

  // Bulk Edit Category Modal
  const [isBulkCategoryOpen, setIsBulkCategoryOpen] = useState(false);
  const [bulkNewCategory, setBulkNewCategory] = useState('');

  // Delete Confirm Dialog
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [targetDeleteIds, setTargetDeleteIds] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prods, ings, forms] = await Promise.all([
        getProducts(),
        getActiveIngredients(),
        getDosageForms().catch(() => []),
      ]);
      setProducts(prods);
      setIngredients(ings);
      setDosageFormNames(forms.map((f) => f.name).sort((a, b) => a.localeCompare(b)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useLiveCollections(['products', 'activeIngredients', 'dosageForms'], () => {
    void Promise.all([getProducts(), getActiveIngredients(), getDosageForms().catch(() => [])]).then(([prods, ings, forms]) => {
      setProducts(prods);
      setIngredients(ings);
      setDosageFormNames(forms.map((f) => f.name).sort((a, b) => a.localeCompare(b)));
    }).catch(() => undefined);
  });

  const DOSAGE_FORMS = useMemo(() => {
    const base = dosageFormNames.length ? dosageFormNames : DEFAULT_DOSAGE_FORMS;
    const known = new Set(base.map((f) => f.toLowerCase()));
    const extra = Array.from(new Set(products.map((p) => (p.form || '').trim()).filter((f) => f && !known.has(f.toLowerCase()))));
    return [...base, ...extra];
  }, [dosageFormNames, products]);

  const ingredientsMap = useMemo(() => {
    const map = new Map<string, ActiveIngredient>();
    ingredients.forEach((i) => map.set(i.id, i));
    return map;
  }, [ingredients]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  }, [products]);

  const filteredIngredientOptions = useMemo(() => {
    const query = normalizeArabic(ingredientSearch.trim());
    return ingredients.filter((ingredient) => !query || normalizeArabic(ingredient.name).includes(query) || normalizeArabic(ingredient.category).includes(query));
  }, [ingredients, ingredientSearch]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    const norm = normalizeArabic(searchTerm.trim());
    return products.filter((p) => {
      if (norm) {
        const prodNorm = p.normalizedName || normalizeArabic(p.tradeName);
        const ingNorm = getProductActiveIngredientIds(p)
          .map((id) => ingredientsMap.get(id))
          .filter(Boolean)
          .map((ing) => ing!.normalizedName || normalizeArabic(ing!.name))
          .join(' ');
        const mfgNorm = normalizeArabic(p.manufacturer);
        if (!prodNorm.includes(norm) && !ingNorm.includes(norm) && !mfgNorm.includes(norm)) {
          return false;
        }
      }

      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (selectedIngredient !== 'all' && !getProductActiveIngredientIds(p).includes(selectedIngredient)) return false;
      if (selectedForm !== 'all' && p.form !== selectedForm) return false;

      return true;
    });
  }, [
    products,
    searchTerm,
    selectedCategory,
    selectedIngredient,
    selectedForm,
    ingredientsMap,
  ]);

  const productExportColumns: ExportColumn<ProductExportRecord>[] = [
    { key: 'id', label: 'معرّف الصنف' },
    { key: 'tradeName', label: 'الاسم التجاري' },
    { key: 'activeIngredientIds', label: 'المواد الفعالة', value: (p) => getProductActiveIngredientIds(p).map((id) => ingredientsMap.get(id)?.name).filter(Boolean).join(' + ') || 'غير محددة' },
    { key: 'form', label: 'الشكل الدوائي' }, { key: 'strength', label: 'التركيز' },
    { key: 'packSize', label: 'حجم العبوة' }, { key: 'manufacturer', label: 'الشركة المصنعة' },
    { key: 'category', label: 'التصنيف' }, { key: 'barcode', label: 'الباركود' },
    { key: 'supplierPrices', label: 'أسعار الموردين', value: (p) => p.supplierPrices || 'لا توجد أسعار محفوظة' },
  ];
  const prepareProductExport = async (data: ProductExportRecord[]): Promise<ProductExportRecord[]> => {
    const [prices, suppliers] = await Promise.all([
      getPricesForProductIds(data.map((product) => product.id), undefined, true),
      getSuppliers(),
    ]);
    const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
    const byProduct = new Map<string, string[]>();
    prices.forEach((price) => {
      const current = byProduct.get(price.productId) || [];
      current.push(`${supplierNames.get(price.supplierId) || price.supplierId}: ${price.price} ₪${price.bonus ? ` (بونص ${price.bonus})` : ''}${price.available ? '' : ' — غير متوفر'}`);
      byProduct.set(price.productId, current);
    });
    return data.map((product) => ({ ...product, supplierPrices: (byProduct.get(product.id) || []).join(' | ') }));
  };
  // Paginated Products
  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, currentPage]);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setTradeName('');
    setActiveIngredientId(ingredients[0]?.id || '');
    setSelectedActiveIngredientIds(ingredients[0]?.id ? [ingredients[0].id] : []);
    setIngredientSearch('');
    setForm(DOSAGE_FORMS[0]);
    setStrength('');
    setPackSize('');
    setManufacturer('');
    setCategory(categories[0] || 'عام');
    setBarcode('');
    setShowStrength(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setTradeName(p.tradeName);
    setActiveIngredientId(p.activeIngredientId);
    setSelectedActiveIngredientIds(getProductActiveIngredientIds(p));
    setIngredientSearch('');
    setForm(p.form);
    setStrength(p.strength);
    setPackSize(p.packSize || '');
    setManufacturer(p.manufacturer);
    setCategory(p.category);
    setBarcode(p.barcode || '');
    setShowStrength(p.showStrength === true);
    setIsModalOpen(true);
  };

  const migrationPlanAll = useMemo<MigrationChange[]>(
    () => (isMigrationOpen ? planProductIdentityMigration(products, { stripFromName: migrationStrip }) : []),
    [isMigrationOpen, products, migrationStrip],
  );
  const migrationPlan = useMemo(() => migrationPlanAll.slice(0, 300), [migrationPlanAll]);
  const migrationSelected = migrationPlan.filter((change) => !migrationSkipped.has(change.id));

  const handleRunMigration = async () => {
    if (!migrationSelected.length) return;
    setMigrationRunning(true);
    let done = 0;
    const failed: string[] = [];
    for (const change of migrationSelected) {
      const current = products.find((item) => item.id === change.id);
      if (!current) continue;
      try {
        await saveProduct({
          ...current,
          tradeName: change.after.tradeName,
          normalizedName: normalizeArabic(change.after.tradeName),
          strength: change.after.strength,
          form: change.after.form,
          packSize: change.after.packSize,
        });
        done += 1;
      } catch (err: any) {
        failed.push(`${change.before.tradeName}: ${err?.message || 'خطأ'}`);
      }
    }
    setMigrationRunning(false);
    if (done) success(`تم ترحيل ${done} صنف.`);
    if (failed.length) warning(`تعذر ترحيل ${failed.length} صنف (غالباً تكرار): ${failed.slice(0, 2).join(' | ')}`);
    setIsMigrationOpen(false);
    setMigrationSkipped(new Set());
    await loadData();
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeName.trim()) {
      error('يرجى تعبئة اسم الصنف. المادة الفعالة اختيارية للأصناف غير الدوائية.');
      return;
    }

    setSubmitting(true);
    try {
      await saveProduct({
        // نحافظ على الحقول التي لا يعدلها هذا النموذج (ظهور الصنف، نوعه) بدل مسحها عند إعادة الكتابة.
        ...(editingProduct || {}),
        id: editingProduct ? editingProduct.id : undefined,
        tradeName: tradeName.trim(),
        normalizedName: normalizeArabic(tradeName.trim()),
        activeIngredientId: selectedActiveIngredientIds[0] || activeIngredientId || '',
        activeIngredientIds: selectedActiveIngredientIds,
        form: form.trim(),
        strength: strength.trim(),
        packSize: packSize.trim(),
        manufacturer: manufacturer.trim(),
        category: category.trim() || 'عام',
        barcode: barcode.trim(),
        showStrength,
        createdAt: editingProduct ? editingProduct.createdAt : new Date().toISOString(),
      });

      success(editingProduct ? 'تم تحديث الصنف بنجاح' : 'تمت إضافة الصنف بنجاح');
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      error('فشل حفظ الصنف: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // إضافة مادة فعالة جديدة مصغرة فوراً
  const handleSaveMiniIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIngName.trim()) return;

    try {
      const saved = await saveActiveIngredient({
        name: newIngName.trim(),
        category: newIngCategory.trim() || 'عام',
      });
      // تحديث قائمة المواد واختيارها فوراً
      setIngredients((prev) => [saved, ...prev]);
      setSelectedActiveIngredientIds((prev) => prev.includes(saved.id) ? prev : [...prev, saved.id]);
      setActiveIngredientId((prev) => prev || saved.id);
      setIsAddIngredientMiniOpen(false);
      setNewIngName('');
      setNewIngCategory('');
      success(`تمت إضافة المادة الفعالة (${saved.name}) واختيارها بنجاح.`);
    } catch (err: any) {
      error('تعذر إضافة المادة الفعالة: ' + err.message);
    }
  };


  // حذف فردي أو جماعي
  const confirmDelete = (ids: string[]) => {
    setTargetDeleteIds(ids);
    setIsConfirmOpen(true);
  };

  const executeDelete = async () => {
    try {
      await deleteProducts(targetDeleteIds);
      success('تم حذف الأصناف المحددة بنجاح.');
      setSelectedIds((prev) => prev.filter((id) => !targetDeleteIds.includes(id)));
      setIsConfirmOpen(false);
      await loadData();
    } catch (err: any) {
      error('تعذر الحذف: ' + err.message);
    }
  };

  // تعديل التصنيف جماعياً
  const handleBulkCategorySave = async () => {
    if (!bulkNewCategory.trim() || selectedIds.length === 0) return;
    try {
      await updateProductsCategory(selectedIds, bulkNewCategory.trim());
      success(`تم تحديث تصنيف ${selectedIds.length} صنف إلى (${bulkNewCategory}).`);
      setIsBulkCategoryOpen(false);
      setBulkNewCategory('');
      setSelectedIds([]);
      await loadData();
    } catch (err: any) {
      error('تعذر تحديث التصنيف: ' + err.message);
    }
  };

  const columns: Column<Product>[] = [
    {
      key: 'tradeName',
      header: 'الاسم التجاري',
      sortable: true,
      render: (item) => (
        <div>
          <span className="font-extrabold text-slate-800">{productCompactName(item)}</span>
          {item.barcode && (
            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
              باركود: {item.barcode}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'activeIngredientId',
      header: 'المادة الفعالة',
      render: (item) => {
        const names = getProductActiveIngredientIds(item)
          .map((id) => ingredientsMap.get(id)?.name)
          .filter(Boolean);
        return (
          <span className="text-xs font-bold text-[#0f9d7a]">
            {names.join(' + ') || 'غير محددة'}
          </span>
        );
      },
    },
    {
      key: 'form',
      header: 'الشكل والتركيز',
      render: (item) => (
        <div className="text-xs text-slate-600">
          <span className="font-semibold">{item.form}</span>
          {item.strength && <span className="text-slate-400 mr-1.5 font-normal">({item.strength})</span>}
          {item.packSize && <span className="mt-1 block text-emerald-700">العبوة: {item.packSize}</span>}
        </div>
      ),
    },
    {
      key: 'manufacturer',
      header: 'الشركة المصنعة',
      sortable: true,
      render: (item) => (
        <span className="text-xs font-semibold text-slate-700">{item.manufacturer}</span>
      ),
    },
    {
      key: 'category',
      header: 'التصنيف',
      sortable: true,
      render: (item) => (
        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg">
          {item.category}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      render: (item) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleOpenEdit(item)}
            className="p-1.5 text-slate-500 hover:text-[#0f9d7a] hover:bg-emerald-50 rounded-lg transition"
            title="تعديل"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => confirmDelete([item.id])}
            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
            title="حذف"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Pill className="w-6 h-6 text-[#0f9d7a]" />
            <span>الأصناف التجارية (Products)</span>
            <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-bold">
              {products.length} صنف
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            دليل الأدوية التجاري الموحد للمنصة، المربوط بالمواد الفعالة وقوائم أسعار الموردين
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { setMigrationSkipped(new Set()); setIsMigrationOpen(true); }}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 transition flex items-center gap-2 active:scale-95"
          >
            <Layers className="w-4 h-4" />
            <span>ترحيل الأصناف القديمة</span>
          </button>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2.5 bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-2 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة صنف تجاري جديد</span>
          </button>
        </div>
      </div>

      {/* شريط البحث والفلاتر المتقدمة */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="بحث بالاسم التجاري، المادة الفعالة، أو الشركة المصنعة..."
            className="w-full pr-10 pl-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:border-[#0f9d7a]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1">التصنيف</label>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-hidden focus:border-[#0f9d7a]"
            >
              <option value="all">كل التصنيفات ({categories.length})</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1">المادة الفعالة</label>
            <select
              value={selectedIngredient}
              onChange={(e) => {
                setSelectedIngredient(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-hidden focus:border-[#0f9d7a]"
            >
              <option value="all">كل المواد الفعالة ({ingredients.length})</option>
              <option value="">بدون مادة فعالة / صنف غير دوائي</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1">الشكل الدوائي</label>
            <select
              value={selectedForm}
              onChange={(e) => {
                setSelectedForm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-hidden focus:border-[#0f9d7a]"
            >
              <option value="all">كل الأشكال الدوائية</option>
              {DOSAGE_FORMS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <ExportActions title="قائمة الأصناف التجارية" filename="الأصناف-التجارية" data={filteredProducts} columns={productExportColumns} prepareData={prepareProductExport} />
      {/* الجدول والبيانات */}
      {loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          icon={<Pill className="w-8 h-8" />}
          title="لا توجد أصناف مطابقة"
          description="لم يتم العثور على أدوية بالمعايير المحددة."
          actionText="إضافة صنف جديد"
          onAction={handleOpenAdd}
        />
      ) : (
        <>
          <Table
            columns={columns}
            data={paginatedProducts}
            keyExtractor={(item) => item.id}
            selectedIds={selectedIds}
            onSelectRow={(id) => {
              setSelectedIds((prev) =>
                prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
              );
            }}
            onSelectAll={() => {
              if (selectedIds.length === paginatedProducts.length) {
                setSelectedIds([]);
              } else {
                setSelectedIds(paginatedProducts.map((p) => p.id));
              }
            }}
            mobileCardRender={(item, isSelected, onToggle) => {
              const ingredientNames = getProductActiveIngredientIds(item)
                .map((id) => ingredientsMap.get(id)?.name)
                .filter(Boolean);
              return (
                <div
                  className={`bg-white p-4 rounded-2xl border transition-all ${
                    isSelected ? 'border-[#0f9d7a] bg-emerald-50/20' : 'border-slate-200 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={onToggle}
                        className="w-4 h-4 rounded text-[#0f9d7a] accent-[#0f9d7a]"
                      />
                      <h3 className="font-extrabold text-sm text-slate-800">{productCompactName(item)}</h3>
                    </div>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md">
                      {item.category}
                    </span>
                  </div>

                  <p className="text-xs text-[#0f9d7a] font-bold mb-2">
                    {ingredientNames.join(' + ') || 'غير محددة'}
                  </p>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <span>
                      {item.form} • {item.strength || 'بدون تركيز'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="p-1.5 text-slate-600 hover:text-[#0f9d7a] hover:bg-emerald-50 rounded-lg"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => confirmDelete([item.id])}
                        className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }}
          />

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredProducts.length}
            pageSize={PAGE_SIZE}
            onPageChange={(page) => {
              setCurrentPage(page);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      )}

      {/* شريط الإجراءات الجماعية */}
      <BulkBar
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
        onDeleteSelected={() => confirmDelete(selectedIds)}
        deleteLabel={`حذف الأصناف (${selectedIds.length})`}
        customActions={
          <button
            onClick={() => setIsBulkCategoryOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition"
          >
            <Tag className="w-3.5 h-3.5" />
            <span>تعديل التصنيف جماعياً</span>
          </button>
        }
      />

      {/* نافذة الإضافة والتعديل */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProduct ? 'تعديل صنف تجاري' : 'إضافة صنف تجاري جديد'}
        maxWidth="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="product-form"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold text-white bg-[#0f9d7a] hover:bg-[#0b7a5e] rounded-xl shadow-xs"
            >
              {submitting ? 'جاري الحفظ...' : 'حفظ الصنف'}
            </button>
          </>
        }
      >
        <form id="product-form" onSubmit={handleSaveProduct} className="space-y-4 text-right">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              الاسم التجاري (Trade Name) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              placeholder="مثال: Panadol Extra 500mg"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a]"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-bold text-slate-700">المواد الفعالة (يمكن اختيار أكثر من مادة)</label>
              <button type="button" onClick={() => setIsAddIngredientMiniOpen(true)} className="text-[11px] font-bold text-emerald-700">+ إضافة مادة</button>
            </div>
            <input value={ingredientSearch} onChange={(event) => setIngredientSearch(event.target.value)} placeholder="ابحث عن مادة فعالة..." className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs" />
            <div className="mt-2 max-h-44 overflow-auto space-y-1 rounded-xl bg-slate-50 p-2">
              {filteredIngredientOptions.map((ingredient) => <label key={ingredient.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white">
                <input type="checkbox" checked={selectedActiveIngredientIds.includes(ingredient.id)} onChange={(event) => {
                  const next = event.target.checked
                    ? [...selectedActiveIngredientIds, ingredient.id]
                    : selectedActiveIngredientIds.filter((id) => id !== ingredient.id);
                  setSelectedActiveIngredientIds(next);
                  setActiveIngredientId(next[0] || '');
                }} />
                <span className="font-semibold">{ingredient.name}</span><small className="text-slate-500">{ingredient.category}</small>
              </label>)}
              {filteredIngredientOptions.length === 0 && <p className="p-2 text-center text-xs text-slate-400">لا توجد مواد مطابقة.</p>}
            </div>
            <p className="mt-2 text-[10px] text-slate-500">المحدد: {selectedActiveIngredientIds.map((id) => ingredientsMap.get(id)?.name).filter(Boolean).join(' + ') || 'لا توجد مادة محددة'}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                الشكل الدوائي (Dosage Form)
              </label>
              <select
                value={form}
                onChange={(e) => setForm(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a] bg-white"
              >
                {DOSAGE_FORMS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">التركيز</label>
              <input
                type="text"
                value={strength}
                onChange={(e) => setStrength(e.target.value)}
                placeholder="مثال: 500mg أو 10mg/5ml"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a]"
              />
              <label className="mt-2 flex min-h-11 items-center gap-2 text-[11px] font-semibold text-slate-600">
                <input type="checkbox" checked={showStrength} onChange={(event) => setShowStrength(event.target.checked)} />
                إظهار التركيز مع اسم الصنف للصيدليات والمندوبين
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">حجم العبوة (اختياري)</label>
            <input
              type="text"
              value={packSize}
              onChange={(e) => setPackSize(e.target.value)}
              placeholder="مثال: 20 قرصاً، 5 أمبولات، 10 تحاميل"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a]"
            />
            <p className="mt-1 text-[11px] text-slate-500">اكتب عدد الوحدات داخل العبوة؛ يُدخل سعر الصنف لاحقاً على أساس العبوة.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">الشركة المصنعة</label>
              <input
                type="text"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="مثال: GSK أو SPIMACO"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                التصنيف (يمكن إضافة تصنيف جديد)
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="مثال: مسكنات أو جهاز هضمي"
                list="category-options-list"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a]"
              />
              <datalist id="category-options-list">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">الباركود (Barcode)</label>
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="مثال: 628100100001"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a] font-mono"
            />
          </div>
        </form>
      </Modal>

      {/* نموذج مصغر لإضافة مادة فعالة جديدة داخل نافذة الصنف */}
      <Modal
        isOpen={isAddIngredientMiniOpen}
        onClose={() => setIsAddIngredientMiniOpen(false)}
        title="إضافة مادة فعالة جديدة فورية"
        maxWidth="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsAddIngredientMiniOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="mini-ingredient-form"
              className="px-5 py-2 text-xs font-bold text-white bg-[#0f9d7a] hover:bg-[#0b7a5e] rounded-xl shadow-xs"
            >
              حفظ واختيار
            </button>
          </>
        }
      >
        <form id="mini-ingredient-form" onSubmit={handleSaveMiniIngredient} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم المادة الفعالة (اختياري)</label>
            <input
              type="text"
              required
              autoFocus
              value={newIngName}
              onChange={(e) => setNewIngName(e.target.value)}
              placeholder="مثال: Ibuprofen (إيبوبروفين)"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">التصنيف الدوائي</label>
            <input
              type="text"
              value={newIngCategory}
              onChange={(e) => setNewIngCategory(e.target.value)}
              placeholder="مثال: مسكنات ومضادات التهاب"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#0f9d7a]"
            />
          </div>
        </form>
      </Modal>

      {/* نافذة تعديل التصنيف جماعياً */}
      <Modal
        isOpen={isBulkCategoryOpen}
        onClose={() => setIsBulkCategoryOpen(false)}
        title={`تعديل تصنيف ${selectedIds.length} صنف محدد`}
        maxWidth="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsBulkCategoryOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleBulkCategorySave}
              className="px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs"
            >
              تطبيق التعديل
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-700 mb-1">
            اختر أو اكتب التصنيف الجديد:
          </label>
          <input
            type="text"
            required
            value={bulkNewCategory}
            onChange={(e) => setBulkNewCategory(e.target.value)}
            placeholder="مثال: أدوية القلب"
            list="bulk-category-list"
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-purple-600"
          />
          <datalist id="bulk-category-list">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </Modal>

      {/* ترحيل الأصناف القديمة: يملأ التركيز والشكل والعبوة الفارغة من الاسم التجاري */}
      <Modal
        isOpen={isMigrationOpen}
        onClose={() => !migrationRunning && setIsMigrationOpen(false)}
        title="ترحيل الأصناف القديمة"
        maxWidth="4xl"
        footer={
          <>
            <button type="button" disabled={migrationRunning} onClick={() => setIsMigrationOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">إلغاء</button>
            <button type="button" disabled={migrationRunning || !migrationSelected.length} onClick={handleRunMigration} className="px-5 py-2 text-xs font-bold text-white bg-[#0f9d7a] hover:bg-[#0b7a5e] disabled:opacity-50 rounded-xl shadow-xs">
              {migrationRunning ? 'جاري الترحيل...' : `تطبيق على ${migrationSelected.length} صنف`}
            </button>
          </>
        }
      >
        <div className="space-y-3" dir="rtl">
          <p className="text-xs text-slate-600">يقرأ التركيز والشكل والعبوة من الاسم التجاري ويملأ الحقول الفارغة فقط. لا يستبدل أي قيمة موجودة. راجع المعاينة وأزل علامة أي صنف لا تريد تغييره.</p>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <input type="checkbox" checked={migrationStrip} onChange={(event) => setMigrationStrip(event.target.checked)} />
            احذف التركيز والشكل من الاسم التجاري بعد نقلهما لحقولهما
          </label>
          {migrationPlan.length === 0 ? (
            <p className="rounded-xl bg-emerald-50 p-3 text-center text-xs font-bold text-emerald-800">لا توجد أصناف تحتاج ترحيلاً.</p>
          ) : (
            <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full text-right text-[11px]">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr><th className="p-2 w-8"></th><th className="p-2">قبل</th><th className="p-2">بعد</th></tr>
                </thead>
                <tbody>
                  {migrationPlan.map((change) => (
                    <tr key={change.id} className="border-t border-slate-100 align-top">
                      <td className="p-2"><input type="checkbox" checked={!migrationSkipped.has(change.id)} onChange={(event) => setMigrationSkipped((prev) => { const next = new Set(prev); if (event.target.checked) next.delete(change.id); else next.add(change.id); return next; })} /></td>
                      <td className="p-2 text-slate-600"><div className="font-bold">{change.before.tradeName}</div><div>{[change.before.strength, change.before.form, change.before.packSize].filter(Boolean).join(' · ') || 'بدون تركيز/شكل/عبوة'}</div></td>
                      <td className="p-2 text-slate-800"><div className="font-bold">{change.after.tradeName}</div><div>{[change.after.strength, change.after.form, change.after.packSize].filter(Boolean).join(' · ')}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {migrationPlanAll.length > 300 && <p className="text-[11px] text-slate-500">يعرض ويطبق أول 300 صنف من {migrationPlanAll.length}؛ كرر العملية بعد التطبيق للباقي.</p>}
        </div>
      </Modal>

      {/* نافذة تأكيد الحذف */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={executeDelete}
        title="تأكيد حذف الأصناف"
        message={`هل أنت متأكد من حذف ${targetDeleteIds.length} صنف تجاري من قاعدة البيانات؟`}
        confirmText="تأكيد الحذف"
      />
    </div>
  );
};
