// src/App.tsx
import React, { useEffect, useState } from 'react';
import { 
  BrowserRouter, 
  Routes, 
  Route, 
  Navigate, 
  useLocation, 
  Outlet 
} from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { ToastContainer } from './components/Toast';
import { Navbar } from './components/Navbar';
import { AdminSidebar } from './components/AdminSidebar';
import { PharmacyBottomNav } from './components/PharmacyBottomNav';
import { Spinner } from './components/Loader';
import { SubscriptionExpiredScreen } from './components/SubscriptionExpiredScreen';
import { SubscriptionWarningBanner } from './components/SubscriptionWarningBanner';

// Auth Pages
import { Login } from './pages/auth/Login';
import { PendingApproval } from './pages/auth/PendingApproval';

// Admin Pages
import { AdminDashboard } from './pages/admin/Dashboard';
import { ActiveIngredients } from './pages/admin/ActiveIngredients';
import { Products } from './pages/admin/Products';
import { Suppliers } from './pages/admin/Suppliers';
import { ImportPrices } from './pages/admin/ImportPrices';
import { Pharmacies } from './pages/admin/Pharmacies';
import { AdminOrders } from './pages/admin/Orders';

// Pharmacy Pages
import { PharmacyPrices } from './pages/pharmacy/Prices';
import { PharmacySuppliers } from './pages/pharmacy/Suppliers';
import { PharmacyCart } from './pages/pharmacy/Cart';
import { MyOrders } from './pages/pharmacy/MyOrders';
import { PharmacyProfile } from './pages/pharmacy/Profile';

// ======================= Admin Layout =======================
const AdminLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isSidebarOpen={isSidebarOpen}
      />
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <AdminSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

// ======================= Pharmacy Layout =======================
const PharmacyLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-16 md:pb-0">
      <Navbar />
      <SubscriptionWarningBanner />
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
      <PharmacyBottomNav />
    </div>
  );
};

// ======================= Protected Route Guards =======================
const ProtectedAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, initialized, loading } = useAuthStore();

  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Spinner text="جاري التحقق من الصلاحيات الإدارية..." />
      </div>
    );
  }

  // إذا لم يكن مسجلاً أو لم يكن مديراً، يتم تحويله لشاشة الدخول الموحدة
  if (!user || user.role !== 'admin') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const ProtectedPharmacyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, initialized, loading, isExpired } = useAuthStore();
  const location = useLocation();

  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner text="جاري التحميل..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // إذا كان المستخدم مديراً، يحول إلى لوحة الإدارة
  if (user.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  // إذا انتهت فترة التجربة أو الاشتراك، تظهر شاشة انتهاء الاشتراك كاملة
  if (isExpired()) {
    return <SubscriptionExpiredScreen />;
  }

  // إذا كانت الصيدلية بحالة pending (للحسابات القديمة إن وجدت)
  if (user.status === 'pending') {
    if (location.pathname !== '/app/pending') {
      return <Navigate to="/app/pending" replace />;
    }
  }

  // إذا كانت الصيدلية بحالة suspended
  if (user.status === 'suspended') {
    return <SubscriptionExpiredScreen />;
  }

  // إذا كان الحساب مفعلاً ولكن الملف الشخصي غير مكتمل -> فرض إكمال الملف الشخصي
  if (user.status === 'active' && !user.profileComplete) {
    if (location.pathname !== '/app/profile') {
      return <Navigate to="/app/profile" replace />;
    }
  }

  return <>{children}</>;
};

// توجيه الصفحة الرئيسية بناءً على دور المستخدم وحالته
const RootRedirect: React.FC = () => {
  const { user, initialized, loading } = useAuthStore();

  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner text="جاري التهيئة..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  if (user.status === 'pending') {
    return <Navigate to="/app/pending" replace />;
  }

  if (!user.profileComplete) {
    return <Navigate to="/app/profile" replace />;
  }

  return <Navigate to="/app/prices" replace />;
};

export default function App() {
  const { initializeAuth } = useAuthStore();

  useEffect(() => {
    const unsub = initializeAuth();
    return () => unsub();
  }, [initializeAuth]);

  return (
    <BrowserRouter>
      {/* حاوية الإشعارات العائمة */}
      <ToastContainer />

      <Routes>
        {/* المسار الجذري */}
        <Route path="/" element={<RootRedirect />} />

        {/* صفحة الدخول الموحدة بحساب Google */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Navigate to="/login" replace />} />

        {/* مدخل الإدارة محول تلقائياً إلى صفحة الدخول الموحدة */}
        <Route path="/admin/login" element={<Navigate to="/login" replace />} />

        {/* صفحة بانتظار التفعيل */}
        <Route
          path="/app/pending"
          element={
            <ProtectedPharmacyRoute>
              <PendingApproval />
            </ProtectedPharmacyRoute>
          }
        />

        {/* مسارات لوحة تحكم الأدمن (محمية ومخفية عن الصيادلة) */}
        <Route
          path="/admin"
          element={
            <ProtectedAdminRoute>
              <AdminLayout />
            </ProtectedAdminRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="ingredients" element={<ActiveIngredients />} />
          <Route path="products" element={<Products />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="import" element={<ImportPrices />} />
          <Route path="pharmacies" element={<Pharmacies />} />
          <Route path="orders" element={<AdminOrders />} />
        </Route>

        {/* مسارات تطبيق الصيدلية */}
        <Route
          path="/app"
          element={
            <ProtectedPharmacyRoute>
              <PharmacyLayout />
            </ProtectedPharmacyRoute>
          }
        >
          <Route index element={<Navigate to="/app/prices" replace />} />
          <Route path="prices" element={<PharmacyPrices />} />
          <Route path="suppliers" element={<PharmacySuppliers />} />
          <Route path="cart" element={<PharmacyCart />} />
          <Route path="orders" element={<MyOrders />} />
          <Route path="profile" element={<PharmacyProfile />} />
        </Route>

        {/* أي مسار غير معروف يحول للصفحة المناسبة */}
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}
