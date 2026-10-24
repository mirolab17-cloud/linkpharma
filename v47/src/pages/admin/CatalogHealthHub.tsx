// src/pages/admin/CatalogHealthHub.tsx — جودة الكتالوج (التكرار) + كفاءته (النسخ المخزنة) في صفحة واحدة
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProductQuality } from './ProductQuality';
import { CatalogSnapshots } from './CatalogSnapshots';
import { AdminTabs } from '../../components/AdminTabs';

const TABS = [
  { id: 'quality', label: 'فحص التكرار والباركود' },
  { id: 'snapshots', label: 'كفاءة الكتالوج (النسخ المخزنة)' },
];

export const CatalogHealthHub: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'snapshots' ? 'snapshots' : 'quality';
  return (
    <div className="space-y-4" dir="rtl">
      <AdminTabs tabs={TABS} active={tab} onChange={(id) => setParams(id === 'quality' ? {} : { tab: id }, { replace: true })} />
      {tab === 'quality' ? <ProductQuality /> : <CatalogSnapshots />}
    </div>
  );
};
