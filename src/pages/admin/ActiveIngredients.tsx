// src/pages/admin/ActiveIngredients.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  getActiveIngredients, 
  getProducts, 
  saveActiveIngredient, 
  deleteActiveIngredients 
} from '../../services/dataStorage';
import { ActiveIngredient, Product } from '../../types';
import { normalizeArabic } from '../../utils/arabicNormalize';
import { useToastStore } from '../../store/useToastStore';
import { 
  FlaskConical, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  AlertCircle,
  Filter,
  Check,
  X
} from 'lucide-react';
import { Table, Column } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { BulkBar } from '../../components/BulkBar';
import { EmptyState } from '../../components/EmptyState';
import { Spinner } from '../../components/Loader';

export const ActiveIngredients: React.FC = () => {
  const { success, error, warning } = useToastStore();

  const [ingredients, setIngredients] = useState<ActiveIngredient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<ActiveIngredient | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Delete Confirm Dialog
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [targetDeleteIds, setTargetDeleteIds] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ings, prods] = await Promise.all([
        getActiveIngredients(),
        getProducts(),
      ]);
      setIngredients(ings);
      setProducts(prods);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // احتساب عدد الأصناف المرتبطة بكل مادة فعالة
  const productCountMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => {
      map.set(p.activeIngredientId, (map.get(p.activeIngredientId) || 0) + 1);
    });
    return map;
  }, [products]);

  // قائمة التصنيفات
  const categories = useMemo(() => {
    const cats = new Set<string>();
    ingredients.forEach((i) => {
      if (i.category) cats.add(i.category);
    });
    return Array.from(cats);
  }, [ingredients]);

  // الفلترة والبحث الفوري
  const filteredIngredients = useMemo(() => {
    const norm = normalizeArabic(searchTerm.trim());
    return ingredients.filter((item) => {
      if (norm) {
        const itemNorm = item.normalizedName || normalizeArabic(item.name);
        const catNorm = normalizeArabic(item.category);
        if (!itemNorm.includes(norm) && !catNorm.includes(norm)) {
          return false;
        }
      }
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      return true;
    });
  }, [ingredients, searchTerm, selectedCategory]);

  const handleOpenAdd = () => {
    setEditingIngredient(null);
    setFormName('');
    setFormCategory(categories[0] || 'عام');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: ActiveIngredient) => {
    setEditingIngredient(item);
    setFormName(item.name);
    setFormCategory(item.category);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formCategory.trim()) {
      error('يرجى ملء جميع الحقول.');
      return;
    }

    const norm = normalizeArabic(formName.trim());

    // التحقق من منع التكرار بعد التطبيع
    const isDuplicate = ingredients.some((ing) => {
      if (editingIngredient && ing.id === editingIngredient.id) return false;
      const existingNorm = ing.normalizedName || normalizeArabic(ing.name);
      return existingNorm === norm;
    });

    if (isDuplicate) {
      error('توجد مادة فعالة أخرى مسجلة بنفس الاسم (أو اسم مطابق بعد التطبيع).');
      return;
    }

    setSubmitting(true);
    try {
      await saveActiveIngredient({
        id: editingIngredient ? editingIngredient.id : undefined,
        name: formName.trim(),
        normalizedName: norm,
        category: formCategory.trim(),
        createdAt: editingIngredient ? editingIngredient.createdAt : new Date().toISOString(),
      });

      success(editingIngredient ? 'تم تعديل المادة الفعالة بنجاح' : 'تمت إضافة المادة الفعالة بنجاح');
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      error('حدث خطأ أثناء الحفظ: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // التحقق قبل الحذف (منع حذف مادة مرتبطة بأصناف)
  const confirmDelete = (ids: string[]) => {
    const blockedList = ids.filter((id) => (productCountMap.get(id) || 0) > 0);

    if (blockedList.length > 0) {
      const blockedNames = blockedList
        .map((id) => ingredients.find((i) => i.id === id)?.name)
        .filter(Boolean)
        .join('، ');
      warning(
        `لا يمكن حذف (${blockedNames}) لوجود أصناف تجارية مرتبطة بها! احذف الأصناف المرتبطة أو انقلها أولاً.`
      );
      return;
    }

    setTargetDeleteIds(ids);
    setIsConfirmOpen(true);
  };

  const executeDelete = async () => {
    try {
      await deleteActiveIngredients(targetDeleteIds);
      success('تم الحذف بنجاح.');
      setSelectedIds((prev) => prev.filter((id) => !targetDeleteIds.includes(id)));
      setIsConfirmOpen(false);
      await loadData();
    } catch (err: any) {
      error('تعذر الحذف: ' + err.message);
    }
  };

  // تعريف أعمدة الجدول
  const columns: Column<ActiveIngredient>[] = [
    {
      key: 'name',
      header: 'اسم المادة الفعالة',
      sortable: true,
      render: (item) => (
        <div>
          <span className="font-extrabold text-slate-800">{item.name}</span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            تاريخ الإضافة: {item.createdAt ? new Date(item.createdAt).toLocaleDateString('ar-SA') : '-'}
          </span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'التصنيف الدوائي',
      sortable: true,
      render: (item) => (
        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg">
          {item.category}
        </span>
      ),
    },
    {
      key: 'productCount',
      header: 'الأصناف المرتبطة',
      render: (item) => {
        const count = productCountMap.get(item.id) || 0;
        return (
          <span
            className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
              count > 0 ? 'bg-emerald-50 text-[#0f9d7a]' : 'bg-slate-100 text-slate-400'
            }`}
          >
            {count} صنف
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      render: (item) => (
        <div className="flex items-center gap-2">
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
            <FlaskConical className="w-6 h-6 text-[#0f9d7a]" />
            <span>المواد الفعالة (Active Ingredients)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            إدارة المواد الفعالة الدوائية وتصنيفاتها ومنع تكرارها لربطها بالأصناف التجارية
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-2 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة مادة فعالة جديدة</span>
        </button>
      </div>

      {/* شريط البحث والفلترة */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث فوري بالاسم أو التصنيف..."
            className="w-full pr-9 pl-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:border-[#0f9d7a]"
          />
        </div>

        <div className="w-full sm:w-auto flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-hidden focus:border-[#0f9d7a]"
          >
            <option value="all">كل التصنيفات ({categories.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* الجدول والبيانات */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner text="جاري جلب المواد الفعالة..." />
        </div>
      ) : filteredIngredients.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="w-8 h-8" />}
          title="لا توجد مواد فعالة مطابقة"
          description="لم يتم العثور على أي مادة فعالة تطابق معايير البحث الحالية."
          actionText="إضافة مادة جديدة"
          onAction={handleOpenAdd}
        />
      ) : (
        <Table
          columns={columns}
          data={filteredIngredients}
          keyExtractor={(item) => item.id}
          selectedIds={selectedIds}
          onSelectRow={(id) => {
            setSelectedIds((prev) =>
              prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
            );
          }}
          onSelectAll={() => {
            if (selectedIds.length === filteredIngredients.length) {
              setSelectedIds([]);
            } else {
              setSelectedIds(filteredIngredients.map((i) => i.id));
            }
          }}
          mobileCardRender={(item, isSelected, onToggle) => (
            <div
              className={`bg-white p-4 rounded-2xl border transition-all ${
                isSelected ? 'border-[#0f9d7a] bg-emerald-50/20' : 'border-slate-200 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={onToggle}
                    className="w-4 h-4 rounded text-[#0f9d7a] accent-[#0f9d7a]"
                  />
                  <h3 className="font-extrabold text-sm text-slate-800">{item.name}</h3>
                </div>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md">
                  {item.category}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                <span>
                  الأصناف المرتبطة: <strong>{productCountMap.get(item.id) || 0}</strong>
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
          )}
        />
      )}

      {/* شريط الإجراءات الجماعية */}
      <BulkBar
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
        onDeleteSelected={() => confirmDelete(selectedIds)}
        deleteLabel={`حذف المحدد (${selectedIds.length})`}
      />

      {/* نافذة الإضافة والتعديل */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingIngredient ? 'تعديل مادة فعالة' : 'إضافة مادة فعالة جديدة'}
        maxWidth="md"
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
              form="ingredient-form"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold text-white bg-[#0f9d7a] hover:bg-[#0b7a5e] rounded-xl shadow-xs"
            >
              {submitting ? 'جاري الحفظ...' : 'حفظ'}
            </button>
          </>
        }
      >
        <form id="ingredient-form" onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              اسم المادة الفعالة <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="مثال: Paracetamol (باراسيتامول)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a]"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              يُفضل إدخال الاسم العلمي بالإنجليزية مع الترجمة العربية لتسهيل المطابقة التلقائية.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              التصنيف الدوائي <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              placeholder="مثال: مسكنات وخافضات حرارة"
              list="category-suggestions"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a]"
            />
            <datalist id="category-suggestions">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </form>
      </Modal>

      {/* نافذة تأكيد الحذف */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={executeDelete}
        title="تأكيد حذف المواد الفعالة"
        message={`هل أنت متأكد من حذف ${targetDeleteIds.length} مادة فعالة؟`}
        confirmText="تأكيد الحذف"
      />
    </div>
  );
};
