// src/components/PharmacyBottomNav.tsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useCartStore } from '../store/useCartStore';
import { Home, Search, ShoppingCart, ClipboardList } from 'lucide-react';

export const PharmacyBottomNav: React.FC = () => {
  const cartItemsCount = useCartStore((s) => s.getTotalItemsCount());

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 md:hidden pb-safe">
      <div className="grid grid-cols-4 h-16">
        <NavLink
          to="/app/home"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 text-[10px] font-bold transition ${
              isActive ? 'text-[#0f9d7a]' : 'text-slate-500 hover:text-slate-800'
            }`
          }
        >
          <Home className="w-5 h-5" />
          <span>الرئيسية</span>
        </NavLink>

        <NavLink
          to="/app/prices"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 text-[10px] font-bold transition ${
              isActive ? 'text-[#0f9d7a]' : 'text-slate-500 hover:text-slate-800'
            }`
          }
        >
          <Search className="w-5 h-5" />
          <span>الأسعار</span>
        </NavLink>

        <NavLink
          to="/app/cart"
          className={({ isActive }) =>
            `relative flex flex-col items-center justify-center gap-1 text-[10px] font-bold transition ${
              isActive ? 'text-[#0f9d7a]' : 'text-slate-500 hover:text-slate-800'
            }`
          }
        >
          <div className="relative">
            <ShoppingCart className="w-5 h-5" />
            {cartItemsCount > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-[#0f9d7a] text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold animate-pulse shadow-2xs">
                {cartItemsCount}
              </span>
            )}
          </div>
          <span>السلة</span>
        </NavLink>

        <NavLink
          to="/app/orders"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 text-[10px] font-bold transition ${
              isActive ? 'text-[#0f9d7a]' : 'text-slate-500 hover:text-slate-800'
            }`
          }
        >
          <ClipboardList className="w-5 h-5" />
          <span>طلباتي</span>
        </NavLink>
      </div>
    </nav>
  );
};
