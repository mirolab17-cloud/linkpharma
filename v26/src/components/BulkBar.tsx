// src/components/BulkBar.tsx
import React from 'react';
import { CheckSquare, Trash2, X } from 'lucide-react';

interface BulkBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onDeleteSelected?: () => void;
  deleteLabel?: string;
  customActions?: React.ReactNode;
}

export const BulkBar: React.FC<BulkBarProps> = ({
  selectedCount,
  onClearSelection,
  onDeleteSelected,
  deleteLabel = 'حذف المحدد',
  customActions,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[92%] bg-slate-900/95 backdrop-blur text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-slate-700/60 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-[#0f9d7a] text-white flex items-center justify-center font-bold text-xs">
          {selectedCount}
        </div>
        <span className="text-sm font-medium text-slate-200 hidden sm:inline">
          عناصر محددة
        </span>
      </div>

      <div className="flex items-center gap-2">
        {customActions}

        {onDeleteSelected && (
          <button
            onClick={onDeleteSelected}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-semibold transition active:scale-95"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{deleteLabel}</span>
          </button>
        )}

        <button
          onClick={onClearSelection}
          className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          title="إلغاء التحديد"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
