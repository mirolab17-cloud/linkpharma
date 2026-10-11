// src/components/SearchSelect.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Plus, Check, X } from 'lucide-react';

export interface OptionItem {
  id: string;
  label: string;
  subLabel?: string;
}

interface SearchSelectProps {
  label?: string;
  placeholder?: string;
  options: OptionItem[];
  value: string;
  onChange: (id: string) => void;
  onAddNewClick?: () => void;
  addNewText?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
}

export const SearchSelect: React.FC<SearchSelectProps> = ({
  label,
  placeholder = 'اختر...',
  options,
  value,
  onChange,
  onAddNewClick,
  addNewText = '+ إضافة خيار جديد',
  required = false,
  disabled = false,
  error,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.id === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (opt.subLabel && opt.subLabel.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="relative text-right w-full" ref={containerRef}>
      {label && (
        <label className="block text-xs font-bold text-slate-700 mb-1.5">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {/* حقل الاختيار الرئيسي */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm text-right transition bg-white ${
          error
            ? 'border-rose-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
            : 'border-slate-300 focus:border-[#0f9d7a] focus:ring-1 focus:ring-[#0f9d7a]'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:border-slate-400'}`}
      >
        <span className={selectedOption ? 'text-slate-800 font-medium' : 'text-slate-400'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180 text-[#0f9d7a]' : ''}`}
        />
      </button>

      {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}

      {/* القائمة المنسدلة */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
          {/* شريط البحث */}
          <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث هنا..."
              className="w-full text-xs bg-transparent border-none focus:outline-hidden text-slate-800 placeholder-slate-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* خيار إضافة عنصر جديد إن وُجد */}
          {onAddNewClick && (
            <div className="p-1.5 border-b border-slate-100 bg-emerald-50/50">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onAddNewClick();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-[#0f9d7a] hover:bg-emerald-100/60 rounded-lg transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{addNewText}</span>
              </button>
            </div>
          )}

          {/* قائمة الخيارات */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-50">
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">لا توجد نتائج مطابقة</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.id === value;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange(opt.id);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs text-right transition hover:bg-slate-50 ${
                      isSelected ? 'bg-emerald-50 text-[#0f9d7a] font-bold' : 'text-slate-700'
                    }`}
                  >
                    <div>
                      <div>{opt.label}</div>
                      {opt.subLabel && (
                        <div className="text-[10px] text-slate-400 font-normal">{opt.subLabel}</div>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-[#0f9d7a]" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
