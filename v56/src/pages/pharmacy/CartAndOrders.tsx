import React, { useState } from 'react';
import { ShoppingCart, ClipboardList } from 'lucide-react';
import { PharmacyCart } from './Cart';
import { MyOrders } from './MyOrders';

export const CartAndOrders: React.FC = () => {
  const [tab, setTab] = useState<'cart' | 'orders'>('cart');
  return <div dir="rtl" className="pb-24">
    <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur px-4 pt-4 pb-3 border-b border-slate-200">
      <div className="max-w-7xl mx-auto flex gap-2 rounded-2xl bg-white p-1.5 border border-slate-200 shadow-sm">
        <button onClick={() => setTab('cart')} className={`flex-1 min-h-11 rounded-xl text-xs font-black flex items-center justify-center gap-2 ${tab === 'cart' ? 'bg-[#0f9d7a] text-white' : 'text-slate-500'}`}><ShoppingCart className="w-4" /> سلة المشتريات</button>
        <button onClick={() => setTab('orders')} className={`flex-1 min-h-11 rounded-xl text-xs font-black flex items-center justify-center gap-2 ${tab === 'orders' ? 'bg-[#0f9d7a] text-white' : 'text-slate-500'}`}><ClipboardList className="w-4" /> طلباتي</button>
      </div>
    </div>
    {tab === 'cart' ? <PharmacyCart /> : <MyOrders />}
  </div>;
};
