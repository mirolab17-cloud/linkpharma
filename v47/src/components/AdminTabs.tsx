// src/components/AdminTabs.tsx — شريط تبويبات موحد لصفحات الإدارة
import React from 'react';

export interface AdminTab { id: string; label: string }

export const AdminTabs: React.FC<{ tabs: AdminTab[]; active: string; onChange: (id: string) => void }> = ({ tabs, active, onChange }) => (
  <div role="tablist" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1" dir="rtl">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={active === tab.id}
        onClick={() => onChange(tab.id)}
        className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-black transition ${active === tab.id ? 'bg-white text-[#0f9d7a] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);
