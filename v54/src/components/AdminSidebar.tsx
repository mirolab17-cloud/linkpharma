import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Activity, BadgePercent, BarChart3, Bell, Building2, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Command, CopyCheck, CreditCard, Database, Eye, FlaskConical, LayoutDashboard, Pill, LayoutTemplate, ScrollText, ShieldCheck, Truck, UploadCloud, UserRoundCheck } from 'lucide-react';

interface AdminSidebarProps { isOpen: boolean; onClose: () => void; collapsed: boolean; onToggleCollapse: () => void; }
type MenuItem = { to: string; label: string; icon: React.ElementType; end?: boolean };
const groups: Array<{ id: string; title: string; icon: React.ElementType; items: MenuItem[] }> = [
  { id: 'daily', title: 'العمل اليومي والحسابات', icon: Building2, items: [
    { to: '/admin/orders', label: 'الطلبيات الواردة', icon: ClipboardList },
    { to: '/admin/pharmacies', label: 'إدارة الصيدليات والاشتراكات', icon: Building2 },
    { to: '/admin/catalog-access', label: 'صلاحيات الكتالوج والأسعار', icon: ShieldCheck },
    { to: '/admin/representatives', label: 'طلبات المندوبين', icon: UserRoundCheck },
    { to: '/admin/notifications', label: 'مركز الإشعارات', icon: Bell },
    { to: '/admin/pharmacy-view', label: 'معاينة حساب صيدلية', icon: Eye },
  ]},
  { id: 'supply', title: 'الموردون والأسعار', icon: Truck, items: [
    { to: '/admin/suppliers', label: 'الموردون والمستودعات', icon: Truck },
    { to: '/admin/import', label: 'رفع وتحديث الأسعار', icon: UploadCloud },
    { to: '/admin/offers', label: 'عروض المستودعات', icon: BadgePercent },
    { to: '/admin/operations', label: 'التشغيل والتوصيل والظهور', icon: Activity },
  ]},
  { id: 'catalog', title: 'الكتالوج الدوائي', icon: Pill, items: [
    { to: '/admin/products', label: 'الأصناف التجارية', icon: Pill },
    { to: '/admin/ingredients', label: 'المواد الفعالة', icon: FlaskConical },
    { to: '/admin/catalog-import', label: 'استيراد الكتالوج', icon: UploadCloud },
    { to: '/admin/product-quality', label: 'جودة الكتالوج والتكرار', icon: CopyCheck },
  ]},
  { id: 'plans', title: 'الباقات والاشتراكات', icon: CreditCard, items: [
    { to: '/admin/subscription-policies', label: 'محتوى الباقات المعروضة', icon: CreditCard },
  ]},
  { id: 'reports', title: 'التقارير والسجل', icon: BarChart3, items: [
    { to: '/admin/order-stats', label: 'إحصائيات الطلبات', icon: BarChart3 },
    { to: '/admin/audit-log', label: 'سجل التدقيق', icon: ScrollText },
  ]},
  { id: 'settings', title: 'إعدادات النظام', icon: Command, items: [
    { to: '/admin/control-center', label: 'الإعدادات والنسخ الاحتياطي', icon: Command },
    { to: '/admin/card-settings', label: 'تخصيص كرت الصنف واسم الإدارة', icon: LayoutTemplate },
  ]},
  { id: 'advanced', title: 'أدوات متقدمة', icon: Database, items: [
    { to: '/admin/catalog-snapshots', label: 'صيانة كفاءة الكتالوج', icon: Database },
  ]},
];

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ isOpen, onClose, collapsed, onToggleCollapse }) => {
  const location = useLocation();
  const activeGroup = groups.find((group) => group.items.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)));
  const [openGroups, setOpenGroups] = useState<string[]>(activeGroup ? [activeGroup.id] : ['daily']);
  useEffect(() => { if (activeGroup && !openGroups.includes(activeGroup.id)) setOpenGroups((old) => [...old, activeGroup.id]); }, [activeGroup?.id]);
  const toggleGroup = (id: string) => setOpenGroups((old) => old.includes(id) ? old.filter((item) => item !== id) : [...old, id]);
  const itemClass = (active: boolean) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold transition ${active ? 'bg-emerald-50 text-[#0f9d7a] shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`;
  return <>
    {isOpen && <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden" onClick={onClose}/>}
    <aside className={`fixed lg:sticky top-16 z-40 flex h-[calc(100vh-4rem)] flex-col justify-between border-l border-slate-200 bg-white transition-all duration-300 ${isOpen ? 'right-0 w-[min(19rem,calc(100vw-1rem))]' : '-right-[19rem] lg:right-0'} ${collapsed ? 'lg:w-20' : 'lg:w-72'}`}>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        <NavLink to="/admin" end onClick={onClose} className={({ isActive }) => itemClass(isActive)} title={collapsed ? 'الرئيسية' : undefined}><LayoutDashboard className="h-5 w-5 shrink-0"/>{!collapsed && <span>الرئيسية</span>}</NavLink>
        {groups.map((group) => {
          const GroupIcon = group.icon; const open = openGroups.includes(group.id) || collapsed;
          return <section key={group.id} className="pt-1">
            {!collapsed && <button onClick={() => toggleGroup(group.id)} className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-right text-[10px] font-black uppercase tracking-wide text-slate-400 hover:bg-slate-50 hover:text-slate-700"><span className="flex items-center gap-2"><GroupIcon className="h-4 w-4"/>{group.title}</span><ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`}/></button>}
            {open && <div className={`${collapsed ? 'space-y-1 border-t border-slate-100 pt-2' : 'space-y-1 pr-1'}`}>{group.items.map((item) => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} end={item.end} onClick={onClose} title={collapsed ? item.label : undefined} className={({ isActive }) => itemClass(isActive)}><Icon className="h-4 w-4 shrink-0"/>{!collapsed && <span className="truncate">{item.label}</span>}</NavLink>; })}</div>}
          </section>;
        })}
      </div>
      <div className="hidden border-t border-slate-100 p-3 lg:block"><button onClick={onToggleCollapse} className="flex w-full items-center justify-center rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" title={collapsed ? 'توسيع القائمة' : 'طي القائمة'}>{collapsed ? <ChevronLeft className="h-5 w-5"/> : <ChevronRight className="h-5 w-5"/>}</button></div>
    </aside>
  </>;
};
