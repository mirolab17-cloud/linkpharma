// src/components/PharmacyGlobalSearch.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Product, ActiveIngredient, Supplier, PriceRecord } from '../types';
import { normalizeArabic } from '../utils/arabicNormalize';
import { formatCurrency } from '../utils/formatPrice';
import { 
  Search, 
  X, 
  Pill, 
  Building2, 
  FlaskConical, 
  Sparkles, 
  Loader2, 
  ArrowRight,
  SlidersHorizontal,
  ChevronDown,
  Tag
} from 'lucide-react';

export type SearchScope = 'all' | 'tradeName' | 'ingredient' | 'manufacturer';

interface PharmacyGlobalSearchProps {
  products: Product[];
  ingredientsMap: Map<string, ActiveIngredient>;
  productPricesMap: Map<string, PriceRecord[]>;
  onFilterChange: (query: string, scope: SearchScope) => void;
  initialQuery?: string;
  initialScope?: SearchScope;
  totalFilteredCount?: number;
  onClearAll?: () => void;
}

export const PharmacyGlobalSearch: React.FC<PharmacyGlobalSearchProps> = ({
  products,
  ingredientsMap,
  productPricesMap,
  onFilterChange,
  initialQuery = '',
  initialScope = 'all',
  totalFilteredCount,
  onClearAll,
}) => {
  const [inputValue, setInputValue] = useState(initialQuery);
  const [scope, setScope] = useState<SearchScope>(initialScope);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [isOpenDropdown, setIsOpenDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // تحديث القيمة عند تغير initialQuery خارجياً
  useEffect(() => {
    setInputValue(initialQuery);
  }, [initialQuery]);

  // Debounced filter effect: 250ms
  useEffect(() => {
    setIsDebouncing(true);
    const handler = setTimeout(() => {
      onFilterChange(inputValue.trim(), scope);
      setIsDebouncing(false);
    }, 250);

    return () => {
      clearTimeout(handler);
    };
  }, [inputValue, scope, onFilterChange]);

  // اختصار لوحة المفاتيح '/' أو 'Ctrl+K' للتركيز على البحث
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === '/' || (e.ctrlKey && e.key === 'k')) && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // إغلاق القائمة المنسدلة عند النقر بالخارج
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpenDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // استخراج اقتراحات البحث الحية مصنفة
  const categorizedSuggestions = useMemo(() => {
    const query = inputValue.trim();
    if (!query || query.length < 2) {
      return { medicines: [], ingredients: [], manufacturers: [] };
    }

    const normQuery = normalizeArabic(query);

    // 1) أدوية بالاسم التجاري
    const matchingMedicines = products.filter((p) => {
      if (scope === 'ingredient' || scope === 'manufacturer') return false;
      const tradeNorm = p.normalizedName || normalizeArabic(p.tradeName);
      return tradeNorm.includes(normQuery);
    }).slice(0, 5);

    // 2) مواد فعالة مطابقة
    const matchingIngredientsMap = new Map<string, { ingredient: ActiveIngredient; count: number }>();
    if (scope === 'all' || scope === 'ingredient') {
      ingredientsMap.forEach((ing) => {
        const ingNorm = ing.normalizedName || normalizeArabic(ing.name);
        if (ingNorm.includes(normQuery)) {
          // حساب كم صنف يحتوي هذه المادة
          const count = products.filter((p) => p.activeIngredientId === ing.id).length;
          matchingIngredientsMap.set(ing.id, { ingredient: ing, count });
        }
      });
    }
    const matchingIngredients = Array.from(matchingIngredientsMap.values()).slice(0, 3);

    // 3) شركات أدوية مصنعة مطابقة
    const manufacturersMap = new Map<string, number>();
    if (scope === 'all' || scope === 'manufacturer') {
      products.forEach((p) => {
        if (p.manufacturer) {
          const mfgNorm = normalizeArabic(p.manufacturer);
          if (mfgNorm.includes(normQuery)) {
            manufacturersMap.set(p.manufacturer, (manufacturersMap.get(p.manufacturer) || 0) + 1);
          }
        }
      });
    }
    const matchingManufacturers = Array.from(manufacturersMap.entries())
      .map(([name, count]) => ({ name, count }))
      .slice(0, 3);

    return {
      medicines: matchingMedicines,
      ingredients: matchingIngredients,
      manufacturers: matchingManufacturers,
    };
  }, [inputValue, scope, products, ingredientsMap]);

  const hasSuggestions = 
    categorizedSuggestions.medicines.length > 0 ||
    categorizedSuggestions.ingredients.length > 0 ||
    categorizedSuggestions.manufacturers.length > 0;

  const handleSelectSuggestion = (val: string, newScope?: SearchScope) => {
    setInputValue(val);
    if (newScope) setScope(newScope);
    setIsOpenDropdown(false);
  };

  const handleClear = () => {
    setInputValue('');
    if (onClearAll) onClearAll();
    inputRef.current?.focus();
  };

  return (
    <div className="w-full relative" ref={containerRef}>
      {/* شريط البحث الرئيسي */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 hover:border-[#0f9d7a]/50 focus-within:border-[#0f9d7a] focus-within:ring-4 focus-within:ring-[#0f9d7a]/10 transition-all shadow-xs overflow-hidden">
        {/* صف الإدخال الرئيسي */}
        <div className="flex items-center px-4 py-2.5 gap-3">
          <div className="text-slate-400 shrink-0">
            {isDebouncing ? (
              <Loader2 className="w-5 h-5 text-[#0f9d7a] animate-spin" />
            ) : (
              <Search className="w-5 h-5 text-slate-400" />
            )}
          </div>

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setIsOpenDropdown(true);
            }}
            onFocus={() => setIsOpenDropdown(true)}
            placeholder="ابحث عن دواء بالاسم التجاري، المادة الفعالة، أو الشركة المصنعة..."
            className="w-full text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-hidden bg-transparent"
          />

          {inputValue && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition shrink-0"
              title="مسح البحث"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* اختصار لوحة المفاتيح */}
          <div className="hidden sm:flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md shrink-0 border border-slate-200">
            <span>/</span>
            <span>للبحث</span>
          </div>
        </div>

        {/* أزرار تحديد نطاق البحث (الاسم التجاري / المادة الفعالة / الشركة) */}
        <div className="bg-slate-50/70 border-t border-slate-100 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            <span className="text-[11px] font-bold text-slate-400 ml-1 flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3" />
              <span>نطاق البحث:</span>
            </span>

            {[
              { id: 'all', label: 'كل الحقول' },
              { id: 'tradeName', label: 'الاسم التجاري' },
              { id: 'ingredient', label: 'المادة الفعالة' },
              { id: 'manufacturer', label: 'الشركة المصنعة' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setScope(s.id as SearchScope)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  scope === s.id
                    ? 'bg-[#0f9d7a] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* عدد النتائج الحالية */}
          {totalFilteredCount !== undefined && (
            <div className="text-[11px] font-bold text-slate-500">
              المطابق: <strong className="text-slate-800">{totalFilteredCount}</strong> صنف
            </div>
          )}
        </div>
      </div>

      {/* قائمة الاقتراحات المنسدلة الحية مصنفة */}
      {isOpenDropdown && hasSuggestions && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 z-40 overflow-hidden divide-y divide-slate-100 max-h-[380px] overflow-y-auto animate-in fade-in slide-in-from-top-1 text-right">
          {/* قسم الأدوية بالاسم التجاري */}
          {categorizedSuggestions.medicines.length > 0 && (
            <div className="p-2">
              <div className="px-2.5 py-1 text-[11px] font-black text-slate-400 flex items-center gap-1.5">
                <Pill className="w-3.5 h-3.5 text-[#0f9d7a]" />
                <span>أدوية مطابقة بالاسم التجاري</span>
              </div>
              <div className="space-y-1 mt-1">
                {categorizedSuggestions.medicines.map((prod) => {
                  const ing = ingredientsMap.get(prod.activeIngredientId);
                  const pPrices = (productPricesMap.get(prod.id) || []).filter((p) => p.available);
                  const minPrice = pPrices.length > 0 ? Math.min(...pPrices.map((p) => p.price)) : null;

                  return (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => handleSelectSuggestion(prod.tradeName, 'tradeName')}
                      className="w-full px-3 py-2 rounded-xl text-right hover:bg-emerald-50/50 flex items-center justify-between gap-2 transition group"
                    >
                      <div className="min-w-0">
                        <div className="font-extrabold text-xs text-slate-800 group-hover:text-[#0f9d7a] truncate">
                          {prod.tradeName}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          {ing && <span>{ing.name}</span>}
                          <span>•</span>
                          <span>{prod.form} {prod.strength}</span>
                        </div>
                      </div>

                      <div className="text-left shrink-0">
                        {minPrice !== null ? (
                          <span className="text-xs font-black text-[#0f9d7a]">
                            يبدأ من {formatCurrency(minPrice)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">غير متوفر</span>
                        )}
                        <div className="text-[10px] text-slate-400">
                          {prod.manufacturer}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* قسم المواد الفعالة */}
          {categorizedSuggestions.ingredients.length > 0 && (
            <div className="p-2 bg-slate-50/50">
              <div className="px-2.5 py-1 text-[11px] font-black text-slate-400 flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-teal-600" />
                <span>مواد فعالة علمية مطابقة</span>
              </div>
              <div className="space-y-1 mt-1">
                {categorizedSuggestions.ingredients.map(({ ingredient, count }) => (
                  <button
                    key={ingredient.id}
                    type="button"
                    onClick={() => handleSelectSuggestion(ingredient.name, 'ingredient')}
                    className="w-full px-3 py-2 rounded-xl text-right hover:bg-teal-50 flex items-center justify-between gap-2 transition group"
                  >
                    <div>
                      <span className="font-bold text-xs text-slate-800 group-hover:text-teal-700">
                        {ingredient.name}
                      </span>
                      <span className="text-[10px] text-slate-400 mr-2">
                        ({ingredient.category})
                      </span>
                    </div>
                    <span className="text-[10px] bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded-md">
                      {count} أدوية
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* قسم الشركات المصنعة */}
          {categorizedSuggestions.manufacturers.length > 0 && (
            <div className="p-2">
              <div className="px-2.5 py-1 text-[11px] font-black text-slate-400 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                <span>شركات أدوية ومصانع</span>
              </div>
              <div className="space-y-1 mt-1">
                {categorizedSuggestions.manufacturers.map(({ name, count }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleSelectSuggestion(name, 'manufacturer')}
                    className="w-full px-3 py-2 rounded-xl text-right hover:bg-blue-50 flex items-center justify-between gap-2 transition group"
                  >
                    <span className="font-bold text-xs text-slate-800 group-hover:text-blue-700">
                      {name}
                    </span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-md">
                      {count} أصناف
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
