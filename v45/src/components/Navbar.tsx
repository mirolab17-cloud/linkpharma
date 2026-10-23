// src/components/Navbar.tsx
import React from 'react';
import { BrandMark } from './BrandLogo';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useCartStore } from '../store/useCartStore';
import {
  ShoppingCart,
  LogOut,
  Menu,
  X,
  User as UserIcon,
} from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { PWAInstallButton } from './PWAInstallButton';

interface NavbarProps {
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar, isSidebarOpen }) => {
  const { user, logout } = useAuthStore();
  const cartItemsCount = useCartStore((s) => s.getTotalItemsCount());
  const navigate = useNavigate();
  const homePath = user?.role === 'admin' ? '/admin' : user?.role === 'representative' ? '/app/representative' : '/app/home';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 app-header bg-white/95 backdrop-blur border-b border-slate-200 transition-colors duration-200">
      <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 h-16 min-h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* الجانب الأيمن: زر القائمة والشعار */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {user?.role === 'admin' && onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition"
              aria-label="القائمة الجانبية"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}

          <Link to={homePath} className="flex items-center gap-2.5 min-w-0">
            <BrandMark size={40} />
            <div>
              <span className="font-extrabold text-sm sm:text-lg text-slate-900 tracking-tight block leading-tight truncate max-w-[7.5rem] sm:max-w-none">
                فارما لينك
              </span>
              <span className="text-[10px] text-slate-500 font-medium hidden sm:block">
                منصة ربط الصيدليات بالمستودعات
              </span>
            </div>
          </Link>
        </div>

        {/* الجانب الأوسط: روابط الصيدلية على الشاشات الكبيرة */}
        {user?.role === 'pharmacy' && user?.status === 'active' && user?.profileComplete && (
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl">
            <Link
              to="/app/home"
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:text-[#0f9d7a] hover:bg-white transition"
            >
              الرئيسية
            </Link>
            <Link
              to="/app/prices"
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:text-[#0f9d7a] hover:bg-white transition"
            >
              الأسعار والعروض
            </Link>
            <Link
              to="/app/suppliers"
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:text-[#0f9d7a] hover:bg-white transition"
            >
              دليل الموردين
            </Link>
            <Link
              to="/app/cart"
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:text-[#0f9d7a] hover:bg-white transition flex items-center gap-1.5"
            >
              <span>السلة</span>
              {cartItemsCount > 0 && (
                <span className="bg-[#0f9d7a] text-white text-[10px] px-1.5 py-0.2 rounded-full">
                  {cartItemsCount}
                </span>
              )}
            </Link>
            <Link
              to="/app/suggestions"
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:text-[#0f9d7a] hover:bg-white transition"
            >
              الاقتراحات
            </Link>
            <Link
              to="/app/orders"
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:text-[#0f9d7a] hover:bg-white transition"
            >
              طلباتي
            </Link>
            <Link
              to="/app/profile"
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:text-[#0f9d7a] hover:bg-white transition"
            >
              الملف الشخصي
            </Link>
          </nav>
        )}

        {/* الجانب الأيسر: الإشعارات والسلة ومعلومات الحساب وتثبيت التطبيق */}
        <div className="flex items-center gap-1 sm:gap-3 shrink-0">

          {/* زر تثبيت PWA */}
          <PWAInstallButton />

          {/* جرس الإشعارات والتنبيهات المباشرة */}
          {user && <NotificationBell />}

          {/* أيقونة السلة للصيدلية */}
          {user?.role === 'pharmacy' && user?.status === 'active' && (
            <Link
              to="/app/cart"
              className="relative p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-[#0f9d7a] hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="سلة الطلبات"
            >
              <ShoppingCart className="w-5 h-5" />
              {cartItemsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#0f9d7a] text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-xs">
                  {cartItemsCount}
                </span>
              )}
            </Link>
          )}

          {/* الملف الشخصي على الجوال (أُزيل من الشريط السفلي) */}
          {user?.role === 'pharmacy' && user?.status === 'active' && (
            <Link
              to="/app/profile"
              className="md:hidden p-2.5 rounded-xl text-slate-600 hover:text-[#0f9d7a] hover:bg-slate-100 transition"
              aria-label="الملف الشخصي"
            >
              <UserIcon className="w-5 h-5" />
            </Link>
          )}
          {user?.role === 'representative' && user?.status === 'active' && <Link to="/app/representative" className="hidden md:inline-flex items-center px-3 py-2 rounded-xl text-xs font-bold text-[#0f9d7a] bg-emerald-50">مساحة المندوب</Link>}

          {/* معلومات المستخدم الحالي */}
          {user && (
            <div className="flex items-center gap-2.5 pr-2 border-r border-slate-200 dark:border-slate-800">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">
                  {user.pharmacyName && user.pharmacyName !== 'صيدليتي' ? user.pharmacyName : user.name}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 justify-end">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      user.role === 'admin'
                        ? 'bg-purple-500'
                        : user.status === 'active'
                        ? 'bg-emerald-500'
                        : 'bg-amber-500'
                    }`}
                  />
                  <span>
                    {user.role === 'admin'
                      ? 'مدير'
                      : user.role === 'representative'
                      ? 'مندوب مستودع'
                      : user.status === 'active'
                      ? 'صيدلية معتمدة'
                      : 'قيد التفعيل'}
                  </span>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                title="تسجيل الخروج"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
