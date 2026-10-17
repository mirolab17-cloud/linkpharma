// src/components/AdminSidebar.tsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FlaskConical,
  Pill,
  Truck,
  UploadCloud,
  Building2,
  ClipboardList,
  Command,
  Activity,
  UserRoundCheck,
  ClipboardCheck,
  ScrollText,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  isOpen,
  onClose,
  collapsed,
  onToggleCollapse,
}) => {
  const menuItems = [
    { to: '/admin', label: 'الرئيسية', icon: LayoutDashboard, end: true },
    { to: '/admin/ingredients', label: 'المواد الفعالة', icon: FlaskConical },
    { to: '/admin/products', label: 'الأصناف التجارية', icon: Pill },
    { to: '/admin/suppliers', label: 'الموردون والمستودعات', icon: Truck },
    { to: '/admin/representatives', label: 'طلبات المندوبين', icon: UserRoundCheck, highlight: true },
    { to: '/admin/approvals', label: 'اعتماد التغييرات الحساسة', icon: ClipboardCheck, highlight: true },
    { to: '/admin/audit-log', label: 'سجل التدقيق', icon: ScrollText },
    { to: '/admin/import', label: 'رفع أسعار مورد', icon: UploadCloud, highlight: true },
    { to: '/admin/catalog-import', label: 'استيراد الكتالوج', icon: UploadCloud, highlight: true },
    { to: '/admin/pharmacies', label: 'إدارة الصيدليات', icon: Building2 },
    { to: '/admin/orders', label: 'الطلبيات الواردة', icon: ClipboardList },
    { to: '/admin/control-center', label: 'مركز القيادة v4', icon: Command, highlight: true },
    { to: '/admin/operations', label: 'مركز التشغيل v18', icon: Activity, highlight: true },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:sticky top-16 z-40 h-[calc(100vh-4rem)] bg-white border-l border-slate-200 transition-all duration-300 flex flex-col justify-between ${
          isOpen ? 'right-0 w-[min(18rem,calc(100vw-1rem))]' : '-right-[18rem] lg:right-0'
        } ${collapsed ? 'lg:w-20' : 'lg:w-64'}`}
      >
        <div className="p-3.5 space-y-1.5 overflow-y-auto flex-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition group ${
                    isActive
                      ? 'bg-emerald-50 text-[#0f9d7a] shadow-xs'
                      : item.highlight
                      ? 'text-slate-700 hover:bg-emerald-50/50 hover:text-[#0f9d7a]'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <Icon
                  className={`w-5 h-5 shrink-0 transition group-hover:scale-105 ${
                    item.highlight ? 'text-[#0f9d7a]' : ''
                  }`}
                />
                {!collapsed && (
                  <span className="truncate flex-1 flex items-center justify-between">
                    <span>{item.label}</span>
                    {item.highlight && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-emerald-100 text-[#0f9d7a] font-black">
                        مهم
                      </span>
                    )}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Toggle Collapse Button for Desktop */}
        <div className="p-3 border-t border-slate-100 hidden lg:block">
          <button
            onClick={onToggleCollapse}
            className="w-full flex items-center justify-center p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
            title={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
          >
            {collapsed ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>
      </aside>
    </>
  );
};
