// src/components/AdminSidebar.tsx — v47: قائمة مرتبة بستة أقسام
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
  Settings2,
  Activity,
  UserRoundCheck,
  ScrollText,
  BadgePercent,
  CreditCard,
  Eye,
  ChevronLeft,
  ChevronRight,
  Bell,
  CopyCheck,
  EyeOff,
  KeyRound,
  FileSpreadsheet,
  type LucideIcon,
} from 'lucide-react';

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface MenuItem { to: string; label: string; icon: LucideIcon; end?: boolean }
interface MenuGroup { title?: string; items: MenuItem[] }

export const ADMIN_MENU: MenuGroup[] = [
  { items: [{ to: '/admin', label: 'الرئيسية', icon: LayoutDashboard, end: true }] },
  { title: 'الطلبات', items: [
    { to: '/admin/orders', label: 'الطلبيات والإحصائيات', icon: ClipboardList },
  ] },
  { title: 'الكتالوج', items: [
    { to: '/admin/ingredients', label: 'المواد الفعالة', icon: FlaskConical },
    { to: '/admin/products', label: 'الأصناف التجارية', icon: Pill },
    { to: '/admin/product-visibility', label: 'ظهور الأصناف للصيدليات', icon: EyeOff },
    { to: '/admin/catalog-import', label: 'استيراد الكتالوج', icon: FileSpreadsheet },
    { to: '/admin/product-quality', label: 'جودة وكفاءة الكتالوج', icon: CopyCheck },
  ] },
  { title: 'المستودعات', items: [
    { to: '/admin/suppliers', label: 'الموردون والمستودعات', icon: Truck },
    { to: '/admin/import', label: 'رفع أسعار مورد', icon: UploadCloud },
    { to: '/admin/offers', label: 'إدارة العروض', icon: BadgePercent },
    { to: '/admin/operations', label: 'التوصيل وظهور الأسعار', icon: Activity },
    { to: '/admin/representatives', label: 'طلبات المندوبين', icon: UserRoundCheck },
  ] },
  { title: 'الصيدليات', items: [
    { to: '/admin/pharmacies', label: 'الحسابات والاشتراكات', icon: Building2 },
    { to: '/admin/pharmacy-permissions', label: 'صلاحيات الصيدليات', icon: KeyRound },
    { to: '/admin/subscription-policies', label: 'الباقات وتجربة الاشتراك', icon: CreditCard },
    { to: '/admin/pharmacy-view', label: 'عرض كصيدلية', icon: Eye },
  ] },
  { title: 'النظام', items: [
    { to: '/admin/control-center', label: 'الإعدادات والنسخ الاحتياطي', icon: Settings2 },
    { to: '/admin/notifications', label: 'مركز الإشعارات', icon: Bell },
    { to: '/admin/audit-log', label: 'سجل التدقيق', icon: ScrollText },
  ] },
];

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  isOpen,
  onClose,
  collapsed,
  onToggleCollapse,
}) => {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed lg:sticky top-16 z-40 h-[calc(100vh-4rem)] bg-white border-l border-slate-200 transition-all duration-300 flex flex-col justify-between ${
          isOpen ? 'right-0 w-[min(18rem,calc(100vw-1rem))]' : '-right-[18rem] lg:right-0'
        } ${collapsed ? 'lg:w-20' : 'lg:w-64'}`}
      >
        <nav className="p-3 overflow-y-auto flex-1" aria-label="قائمة الإدارة">
          {ADMIN_MENU.map((group, index) => (
            <div key={group.title || 'home'} className={index ? 'mt-3' : ''}>
              {group.title && (
                collapsed
                  ? <div className="mx-3 mb-1.5 hidden border-t border-slate-200 lg:block" />
                  : <p className="px-3.5 pb-1.5 text-[10px] font-black tracking-wide text-slate-400">{group.title}</p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={onClose}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition group ${
                          isActive
                            ? 'bg-emerald-50 text-[#0f9d7a] shadow-xs'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`
                      }
                    >
                      <Icon className="w-5 h-5 shrink-0 transition group-hover:scale-105" />
                      {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

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
