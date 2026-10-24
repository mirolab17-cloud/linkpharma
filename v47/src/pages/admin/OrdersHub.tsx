// src/pages/admin/OrdersHub.tsx — الطلبيات + الإحصائيات في صفحة واحدة بتبويبين
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminOrders } from './Orders';
import { OrderStats } from './OrderStats';
import { AdminTabs } from '../../components/AdminTabs';

const TABS = [
  { id: 'orders', label: 'الطلبيات الواردة' },
  { id: 'stats', label: 'الإحصائيات اليومية' },
];

export const OrdersHub: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'stats' ? 'stats' : 'orders';
  return (
    <div className="space-y-4" dir="rtl">
      <AdminTabs tabs={TABS} active={tab} onChange={(id) => setParams(id === 'orders' ? {} : { tab: id }, { replace: true })} />
      {tab === 'orders' ? <AdminOrders /> : <OrderStats />}
    </div>
  );
};
