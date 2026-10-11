// src/pages/admin/Products.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  getProducts, 
  getActiveIngredients, 
  saveProduct, 
  deleteProducts, 
  updateProductsCategory, 
  saveActiveIngredient 
} from '../../services/dataStorage';
import { Product, ActiveIngredient } from '../../types';
import { normalizeArabic } from '../../utils/arabicNormalize';
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
  Building 
} from 'lucide-react';
import { Table, Column } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { SearchSelect, OptionItem } from '../../components/SearchSelect';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { BulkBar } from '../../components/BulkBar';
import { Pagination } from '../../components/Pagination';
import { EmptyState } from '../../components/EmptyState';
import { Spinner } from '../../components/Loader';

const DOSAGE_FORMS = [
  'أقراص',
  'كبسولات',
  'شراب',
  'شراب معلق',
  'حقن',
  'مرهم',
  'كريم',
  'قطرات فموية',
  'قطرات عين',
  'فوار',
  'بخاخ',
  'جل',
  'تحاميل',
];

export const Products: React.FC = () => {
  const { success, error, warning } = useToastStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<ActiveIngredient[]>([]);
  const [loading, setLoading] = useState(true);

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
  const [form, setForm] = useState(DOSAGE_FORMS[0]);
  const [strength, setStrength] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [category, setCategory] = useState('');
  const [barcode, setBarcode] = useState('');
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
      const [prods, ings] = await Promise.all([
        getProducts(),
        getActiveIngredients(),
      ]);
      setProducts(prods);
      setIngredients(ings);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

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

  // Options for SearchSelect
  const ingredientOptions: OptionItem[] = useMemo(() => {
    return ingredients.map((i) => ({
      id: i.id,
      label: i.name,
      subLabel: i.category,
    }));
  }, [ingredients]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    const norm = normalizeArabic(searchTerm.trim());
    return products.filter((p) => {
      if (norm) {
        const prodNorm = p.normalizedName || normalizeArabic(p.tradeName);
        const ing = ingredientsMap.get(p.activeIngredientId);
        const ingNorm = ing ? ing.normalizedName || normalizeArabic(ing.name) : '';
        const mfgNorm = normalizeArabic(p.manufacturer);
        if (!prodNorm.includes(norm) && !ingNorm.includes(norm) && !mfgNorm.includes(norm)) {
          return false;
        }
      }

      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (selectedIngredient !== 'all' && p.activeIngredientId !== selectedIngredient) return false;
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
    setForm(DOSAGE_FORMS[0]);
    setStrength('');
    setManufacturer('');
    setCategory(categories[0] || 'عام');
    setBarcode('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setTradeName(p.tradeName);
    setActiveIngredientId(p.activeIngredientId);
    setForm(p.form);
    setStrength(p.strength);
    setManufacturer(p.manufacturer);
    setCategory(p.category);
    setBarcode(p.barcode || '');
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeName.trim() || !activeIngredientId) {
      error('يرجى تعبئة اسم الصنف واختيار المادة الفعالة.');
      return;
    }

    setSubmitting(true);
    try {
      await saveProduct({
        id: editingProduct ? editingProduct.id : undefined,
        tradeName: tradeName.trim(),
        normalizedName: normalizeArabic(tradeName.trim()),
        activeIngredientId,
        form: form.trim(),
        strength: strength.trim(),
        manufacturer: manufacturer.trim(),
        category: category.trim() || 'عام',
        barcode: barcode.trim(),
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
      setActiveIngredientId(saved.id);
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
          <span className="font-extrabold text-slate-800">{item.tradeName}</span>
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
        const ing = ingredientsMap.get(item.activeIngredientId);
        return (
          <span className="text-xs font-bold text-[#0f9d7a]">
            {ing?.name || 'غير محددة'}
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

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-2 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة صنف تجاري جديد</span>
        </button>
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

      {/* الجدول والبيانات */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner text="جاري جلب الأصناف الدوائية..." />
        </div>
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
              const ing = ingredientsMap.get(item.activeIngredientId);
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
                      <h3 className="font-extrabold text-sm text-slate-800">{item.tradeName}</h3>
                    </div>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md">
                      {item.category}
                    </span>
                  </div>

                  <p className="text-xs text-[#0f9d7a] font-bold mb-2">
                    {ing?.name || 'غير محددة'}
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

          {/* قائمة البحث عن المادة الفعالة مع خيار إضافة جديدة مصغرة */}
          <div>
            <SearchSelect
              label="المادة الفعالة"
              required
              options={ingredientOptions}
              value={activeIngredientId}
              onChange={(id) => setActiveIngredientId(id)}
              onAddNewClick={() => setIsAddIngredientMiniOpen(true)}
              addNewText="+ إضافة مادة فعالة جديدة"
              placeholder="ابحث واختر المادة الفعالة..."
            />
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
            </div>
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
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم المادة الفعالة *</label>
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
