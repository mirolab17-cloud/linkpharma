// src/App.tsx
import React, { useEffect, useState, lazy, Suspense } from 'react';
import { 
  HashRouter, 
  Routes, 
  Route, 
  Navigate, 
  useLocation, 
  Outlet 
} from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { useThemeStore } from './store/useThemeStore';
import { isFirebaseConfigured } from './firebase';
import { ToastContainer } from './components/Toast';
import { Navbar } from './components/Navbar';
import { AdminSidebar } from './components/AdminSidebar';
import { PharmacyBottomNav } from './components/PharmacyBottomNav';
import { Spinner, PharmacyBrandLoader } from './components/Loader';
import { SubscriptionExpiredScreen } from './components/SubscriptionExpiredScreen';
import { SubscriptionWarningBanner } from './components/SubscriptionWarningBanner';
import { OfflineIndicator } from './components/OfflineIndicator';
import { initPush } from './services/push';
import { invalidateCache } from './services/dataStorage';
import { PullToRefresh } from './components/PullToRefresh';
import { PageSkeleton } from './components/Skeleton';
import { OnboardingGuide } from './components/OnboardingGuide';

// Auth Pages
import { Login } from './pages/auth/Login';
const PendingApproval = lazy(() => import('./pages/auth/PendingApproval').then(m => ({ default: m.PendingApproval })));

// Admin Pages (Lazy loaded to reduce initial bundle size)
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard').then(m => ({ default: m.AdminDashboard })));
const ActiveIngredients = lazy(() => import('./pages/admin/ActiveIngredients').then(m => ({ default: m.ActiveIngredients })));
const Products = lazy(() => import('./pages/admin/Products').then(m => ({ default: m.Products })));
const Suppliers = lazy(() => import('./pages/admin/Suppliers').then(m => ({ default: m.Suppliers })));
const ImportPrices = lazy(() => import('./pages/admin/ImportPrices').then(m => ({ default: m.ImportPrices })));
const Pharmacies = lazy(() => import('./pages/admin/Pharmacies').then(m => ({ default: m.Pharmacies })));
const AdminOrders = lazy(() => import('./pages/admin/Orders').then(m => ({ default: m.AdminOrders })));

// Pharmacy Pages (Prices loaded directly or fast-suspensed)
import { PharmacyPrices } from './pages/pharmacy/Prices';
const PharmacyHome = lazy(() => import('./pages/pharmacy/Home').then(m => ({ default: m.PharmacyHome })));
const PharmacySuppliers = lazy(() => import('./pages/pharmacy/Suppliers').then(m => ({ default: m.PharmacySuppliers })));
const PharmacyCart = lazy(() => import('./pages/pharmacy/Cart').then(m => ({ default: m.PharmacyCart })));
const MyOrders = lazy(() => import('./pages/pharmacy/MyOrders').then(m => ({ default: m.MyOrders })));
const PharmacyProfile = lazy(() => import('./pages/pharmacy/Profile').then(m => ({ default: m.PharmacyProfile })));

// Page Loading Fallback
const PageFallback: React.FC = () => (
  <div className="flex-1 min-h-[60vh] flex items-center justify-center p-8" dir="rtl">
    <PharmacyBrandLoader size="md" text="جاري التحميل..." />
  </div>
);

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
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
};

// ======================= Pharmacy Layout =======================
const PharmacyLayout: React.FC = () => {
  const { user } = useAuthStore();
  // السحب للتحديث: نفرغ الكاش ثم نعيد تركيب الصفحة الحالية ليعاد جلب بياناتها
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = React.useCallback(async () => {
    invalidateCache();
    setRefreshKey((k) => k + 1);
    await new Promise((resolve) => setTimeout(resolve, 700));
  }, []);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen bg-slate-50 flex flex-col pb-16 md:pb-0">
        <Navbar />
        <SubscriptionWarningBanner />
        <main className="flex-1 min-w-0">
          <Suspense fallback={<PageSkeleton />}>
            <div key={refreshKey}>
              <Outlet />
            </div>
          </Suspense>
        </main>
        <PharmacyBottomNav />
        {user?.role === 'pharmacy' && user.profileComplete && <OnboardingGuide />}
      </div>
    </PullToRefresh>
  );
};

// ======================= Protected Route Guards =======================
const ProtectedAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, initialized, loading } = useAuthStore();

  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900" dir="rtl">
        <PharmacyBrandLoader
          size="lg"
          text="جاري التحقق من الصلاحيات الإدارية..."
          subtext="منظومة إدارة مستودعات وتسعير الأدوية"
          className="text-white"
        />
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <PharmacyBrandLoader
          size="lg"
          text="جاري فتح صيدليتك وتحديث الأسعار..."
          subtext="الربط مع مستودعات الأدوية المعتمدة"
        />
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <PharmacyBrandLoader
          size="lg"
          text="جاري تهيئة المنصة الموحدة..."
          subtext="كشف الأسعار والعروض المحدثة لآلاف الأصناف"
        />
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

  return <Navigate to="/app/home" replace />;
};

export default function App() {
  const { initializeAuth } = useAuthStore();
  const { initializeTheme } = useThemeStore();

  useEffect(() => {
    initPush().catch(() => {});
    initializeTheme();
    const unsub = initializeAuth();
    return () => unsub();
  }, [initializeAuth, initializeTheme]);

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200/90 p-6 sm:p-8 text-center">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200 shadow-xs">
            <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
            إعدادات Firebase غير مكتملة
          </h1>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            لم يتم العثور على مفاتيح الاتصال بقاعدة بيانات Firebase (مثل مفتاح الـ API أو معرّف المشروع). يرجى التأكد من ضبط متغيرات البيئة أو مفاتيح الإعدادات لتشغيل المنصة بنجاح.
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 text-right space-y-1.5 font-mono dir-ltr">
            <div>VITE_FIREBASE_API_KEY: {import.meta.env.VITE_FIREBASE_API_KEY ? '✓ متوفر' : '✗ غير متوفر (يستخدم القيمة الافتراضية)'}</div>
            <div>VITE_FIREBASE_PROJECT_ID: {import.meta.env.VITE_FIREBASE_PROJECT_ID ? '✓ متوفر' : '✗ غير متوفر (يستخدم القيمة الافتراضية)'}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      {/* حاوية الإشعارات العائمة ومؤشر عدم الاتصال */}
      <ToastContainer />
      <OfflineIndicator />

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
          <Route index element={<Navigate to="/app/home" replace />} />
          <Route path="home" element={<PharmacyHome />} />
          <Route path="prices" element={<PharmacyPrices />} />
          <Route path="suppliers" element={<PharmacySuppliers />} />
          <Route path="cart" element={<PharmacyCart />} />
          <Route path="orders" element={<MyOrders />} />
          <Route path="profile" element={<PharmacyProfile />} />
        </Route>

        {/* أي مسار غير معروف يحول للصفحة المناسبة */}
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </HashRouter>
  );
}
