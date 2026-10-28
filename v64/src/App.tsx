// src/App.tsx
import React, { useEffect, useState, lazy, Suspense } from 'react';
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
  Outlet
} from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { useThemeStore } from './store/useThemeStore';
import { isFirebaseConfigured } from './firebase';
import { ToastContainer } from './components/Toast';
import { Navbar } from './components/Navbar';
import { AdminSidebar } from './components/AdminSidebar';
import { PharmacyBottomNav } from './components/PharmacyBottomNav';
import { RepresentativeBottomNav } from './components/RepresentativeBottomNav';
import { Spinner, PharmacyBrandLoader } from './components/Loader';
import { SubscriptionExpiredScreen } from './components/SubscriptionExpiredScreen';
import { SubscriptionWarningBanner } from './components/SubscriptionWarningBanner';
import { OfflineIndicator } from './components/OfflineIndicator';
import { invalidateCache } from './services/dataStorage';
import { clearProfileCacheForCurrentUser } from './store/useAuthStore';
import { PullToRefresh } from './components/PullToRefresh';
import { PageSkeleton } from './components/Skeleton';
import { OnboardingGuide } from './components/OnboardingGuide';
import { importWithRecovery } from './utils/lazyImport';

// Auth Pages
import { Login } from './pages/auth/Login';
const PendingApproval = lazy(() => importWithRecovery(() => import('./pages/auth/PendingApproval').then(m => ({ default: m.PendingApproval }))));

// Admin Pages (Lazy loaded to reduce initial bundle size)
const AdminDashboard = lazy(() => importWithRecovery(() => import('./pages/admin/Dashboard').then(m => ({ default: m.AdminDashboard }))));
const ActiveIngredients = lazy(() => importWithRecovery(() => import('./pages/admin/ActiveIngredients').then(m => ({ default: m.ActiveIngredients }))));
const DosageForms = lazy(() => importWithRecovery(() => import('./pages/admin/DosageForms').then(m => ({ default: m.DosageForms }))));
const Products = lazy(() => importWithRecovery(() => import('./pages/admin/Products').then(m => ({ default: m.Products }))));
const Suppliers = lazy(() => importWithRecovery(() => import('./pages/admin/Suppliers').then(m => ({ default: m.Suppliers }))));
const ImportPrices = lazy(() => importWithRecovery(() => import('./pages/admin/ImportPrices').then(m => ({ default: m.ImportPrices }))));
const Pharmacies = lazy(() => importWithRecovery(() => import('./pages/admin/Pharmacies').then(m => ({ default: m.Pharmacies }))));
const OrderStats = lazy(() => importWithRecovery(() => import('./pages/admin/OrderStats').then(m => ({ default: m.OrderStats }))));
const AdminOrders = lazy(() => importWithRecovery(() => import('./pages/admin/Orders').then(m => ({ default: m.AdminOrders }))));
const ControlCenter = lazy(() => importWithRecovery(() => import('./pages/admin/ControlCenter').then(m => ({ default: m.ControlCenter }))));
const CatalogImport = lazy(() => importWithRecovery(() => import('./pages/admin/CatalogImport').then(m => ({ default: m.CatalogImport }))));
const CatalogSnapshots = lazy(() => importWithRecovery(() => import('./pages/admin/CatalogSnapshots').then(m => ({ default: m.CatalogSnapshots }))));
const V18Operations = lazy(() => importWithRecovery(() => import('./pages/admin/V18Operations').then(m => ({ default: m.V18Operations }))));
const RepresentativeRequests = lazy(() => importWithRecovery(() => import('./pages/admin/RepresentativeRequests').then(m => ({ default: m.RepresentativeRequests }))));
const AuditLog = lazy(() => importWithRecovery(() => import('./pages/admin/AuditLog').then(m => ({ default: m.AuditLog }))));
const AdminOffers = lazy(() => importWithRecovery(() => import('./pages/admin/Offers').then(m => ({ default: m.Offers }))));
const SubscriptionPolicies = lazy(() => importWithRecovery(() => import('./pages/admin/SubscriptionPolicies').then(m => ({ default: m.SubscriptionPolicies }))));
const AdminPharmacyView = lazy(() => importWithRecovery(() => import('./pages/admin/AdminPharmacyView').then(m => ({ default: m.AdminPharmacyView }))));
const ProductQuality = lazy(() => importWithRecovery(() => import('./pages/admin/ProductQuality').then(m => ({ default: m.ProductQuality }))));
const CardSettings = lazy(() => importWithRecovery(() => import('./pages/admin/CardSettings').then(m => ({ default: m.CardSettings }))));
const CatalogAccess = lazy(() => importWithRecovery(() => import('./pages/admin/CatalogAccess').then(m => ({ default: m.CatalogAccess }))));
const QuickLink = lazy(() => importWithRecovery(() => import('./pages/admin/QuickLink').then(m => ({ default: m.QuickLink }))));
const UserActivity = lazy(() => importWithRecovery(() => import('./pages/admin/UserActivity').then(m => ({ default: m.UserActivity }))));
const PharmacyCatalogTools = lazy(() => importWithRecovery(() => import('./pages/pharmacy/CatalogTools').then(m => ({ default: m.CatalogTools }))));
const PharmacyPriceManagement = lazy(() => importWithRecovery(() => import('./pages/pharmacy/PharmacyPriceManagement').then(m => ({ default: m.PharmacyPriceManagement }))));
const UnifiedNotificationCenter = lazy(() => importWithRecovery(() => import('./pages/UnifiedNotificationCenter').then(m => ({ default: m.UnifiedNotificationCenter }))));

// Pharmacy Pages (Prices loaded directly or fast-suspensed)
const PharmacyPrices = lazy(() => importWithRecovery(() => import('./pages/pharmacy/Prices').then(m => ({ default: m.PharmacyPrices }))));
const PharmacyHome = lazy(() => importWithRecovery(() => import('./pages/pharmacy/Home').then(m => ({ default: m.PharmacyHome }))));
const PharmacySuppliers = lazy(() => importWithRecovery(() => import('./pages/pharmacy/Suppliers').then(m => ({ default: m.PharmacySuppliers }))));
const PharmacyCart = lazy(() => importWithRecovery(() => import('./pages/pharmacy/Cart').then(m => ({ default: m.PharmacyCart }))));
const CartAndOrders = lazy(() => importWithRecovery(() => import('./pages/pharmacy/CartAndOrders').then(m => ({ default: m.CartAndOrders }))));
const MyOrders = lazy(() => importWithRecovery(() => import('./pages/pharmacy/MyOrders').then(m => ({ default: m.MyOrders }))));
const PharmacySuggestions = lazy(() => importWithRecovery(() => import('./pages/pharmacy/Suggestions').then(m => ({ default: m.Suggestions }))));
const PharmacyProfile = lazy(() => importWithRecovery(() => import('./pages/pharmacy/Profile').then(m => ({ default: m.PharmacyProfile }))));
const PharmacyProfileEdit = lazy(() => importWithRecovery(() => import('./pages/pharmacy/ProfileEdit').then(m => ({ default: m.PharmacyProfileEdit }))));
const RepresentativeRequestPage = lazy(() => importWithRecovery(() => import('./pages/representative/RepresentativeRequestPage').then(m => ({ default: m.RepresentativeRequestPage }))));
const ProductDetails = lazy(() => importWithRecovery(() => import('./pages/pharmacy/ProductDetails').then(m => ({ default: m.ProductDetails }))));
const RepresentativeWorkspace = lazy(() => importWithRecovery(() => import('./pages/representative/RepresentativeWorkspace').then(m => ({ default: m.RepresentativeWorkspace }))));
const RepresentativeProfile = lazy(() => importWithRecovery(() => import('./pages/representative/RepresentativeProfile').then(m => ({ default: m.RepresentativeProfile }))));

const ProfilePage: React.FC = () => {
  const { user } = useAuthStore();
  const clearSessionCache = () => {
    if (!window.confirm('سيتم مسح الكاش المحلي وبيانات الجلسة المخزنة لهذا المتصفح فقط. لن يُحذف حسابك ولن يتم تسجيل خروج الأجهزة الأخرى. هل تريد المتابعة؟')) return;
    clearProfileCacheForCurrentUser();
    invalidateCache();
    try {
      Object.keys(localStorage).filter((key) => key.startsWith('linkpharma_catalog_snapshot_') || key.startsWith('pharma_db_')).forEach((key) => localStorage.removeItem(key));
      sessionStorage.removeItem('linkpharma_auth_session_v1');
    } catch {}
    window.alert('تم مسح الكاش المحلي. بقي حسابك محفوظاً ولم يتم حذف أي بيانات سحابية.');
  };
  return <><div dir="rtl" className="mx-auto max-w-4xl px-3 pt-4"><section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-black text-slate-900">الجلسة وبيانات هذا الجهاز</h2><p className="mt-1 text-xs leading-6 text-slate-600">يمسح هذا الخيار الكاش وبيانات التطبيق المحلية لهذا المتصفح فقط؛ لا يحذف الحساب أو البيانات السحابية ولا يسجل خروج الأجهزة الأخرى.</p><button onClick={clearSessionCache} className="mt-3 rounded-xl border border-amber-300 px-4 py-2 text-xs font-black text-amber-900 hover:bg-amber-50">مسح بيانات الجلسة / الكاش</button></section></div>{user?.role === 'representative' ? <RepresentativeProfile /> : <PharmacyProfile />}</>;
};

// Page Loading Fallback
const PageFallback: React.FC = () => (
  <div className="flex-1 min-h-[60vh] flex items-center justify-center p-8" dir="rtl">
    <PharmacyBrandLoader size="md" text="جاري التحميل..." />
  </div>
);

// ======================= Admin Layout =======================
const AdminLayout: React.FC = () => {
  const { user } = useAuthStore();
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
        <main className="flex-1 p-3 sm:p-6 lg:p-8 min-w-0 overflow-x-hidden">
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
  const { user, isPharmacyPreview, exitPharmacyPreview } = useAuthStore();
  const navigate = useNavigate();
  // السحب للتحديث: نفرغ الكاش ثم نعيد تركيب الصفحة الحالية ليعاد جلب بياناتها
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = React.useCallback(async () => {
    invalidateCache();
    setRefreshKey((k) => k + 1);
    await new Promise((resolve) => setTimeout(resolve, 700));
  }, []);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen bg-slate-50 flex flex-col app-pharmacy-shell">
        <Navbar />
        {isPharmacyPreview && (
          <div dir="rtl" className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-slate-950 px-4 py-2.5 text-white shadow-lg">
            <span className="text-[11px] font-bold sm:text-xs">أنت الآن داخل تجربة الصيدلية كمدير · الاشتراك متجاوز للمعاينة فقط</span>
            <button onClick={() => { exitPharmacyPreview(); navigate('/admin/pharmacy-view'); }} className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-[11px] font-black hover:bg-white/25">العودة إلى الإدارة</button>
          </div>
        )}
        {user?.role === 'pharmacy' && <SubscriptionWarningBanner />}
        <main className="flex-1 min-w-0">
          <Suspense fallback={<PageSkeleton />}>
            <div key={refreshKey}>
              <Outlet />
            </div>
          </Suspense>
        </main>
        {user?.role === 'pharmacy' && <PharmacyBottomNav />}
        {user?.role === 'representative' && <RepresentativeBottomNav />}
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

  // المدير الذي اختار صيدلية يدخل واجهة الصيدلية نفسها، مع تجاوز الاشتراك داخل المعاينة فقط.
  if (user.role === 'admin' && !useAuthStore.getState().isPharmacyPreview) {
    return <Navigate to="/admin" replace />;
  }

  if (user.role !== 'pharmacy' && user.role !== 'representative') {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'representative') {
    if (user.status === 'suspended') return <SubscriptionExpiredScreen />;
    if (!['/app/representative', '/app/profile', '/app/profile/edit', '/app/representative-request'].includes(location.pathname)) {
      return <Navigate to="/app/representative" replace />;
    }
    return <>{children}</>;
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
    if (location.pathname !== '/app/profile' && location.pathname !== '/app/profile/edit') {
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

  if (user.role === 'representative') {
    return <Navigate to="/app/representative" replace />;
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
          <Route path="dosage-forms" element={<DosageForms />} />
          <Route path="products" element={<Products />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="import" element={<ImportPrices />} />
          <Route path="quick-link" element={<QuickLink />} />
          <Route path="pharmacies" element={<Pharmacies />} />
          <Route path="pharmacy-view" element={<AdminPharmacyView />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="order-stats" element={<OrderStats />} />
          <Route path="control-center" element={<ControlCenter />} />
              <Route path="operations" element={<V18Operations />} />
          <Route path="catalog-import" element={<CatalogImport />} />
          <Route path="catalog-snapshots" element={<CatalogSnapshots />} />
          <Route path="representatives" element={<RepresentativeRequests />} />
          <Route path="audit-log" element={<AuditLog />} />
          <Route path="offers" element={<AdminOffers />} />
          <Route path="subscription-policies" element={<SubscriptionPolicies />} />
          <Route path="product-quality" element={<ProductQuality />} />
          <Route path="catalog-access" element={<CatalogAccess />} />
          <Route path="card-settings" element={<CardSettings />} />
          <Route path="notifications" element={<UnifiedNotificationCenter />} />
          <Route path="user-activity" element={<UserActivity />} />
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
          <Route path="representative" element={<RepresentativeWorkspace />} />
          <Route path="home" element={<PharmacyHome />} />
          <Route path="prices" element={<PharmacyPrices />} />
          <Route path="prices/:productId" element={<ProductDetails />} />
          <Route path="manage-prices" element={<PharmacyPriceManagement />} />
          <Route path="catalog-tools" element={<PharmacyCatalogTools />} />
          <Route path="suppliers" element={<PharmacySuppliers />} />
          <Route path="cart" element={<CartAndOrders />} />
          <Route path="orders" element={<Navigate to="/app/cart" replace />} />
          <Route path="suggestions" element={<PharmacySuggestions />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="profile/edit" element={<PharmacyProfileEdit />} />
          <Route path="representative-request" element={<RepresentativeRequestPage />} />
          <Route path="notifications" element={<UnifiedNotificationCenter />} />
        </Route>

        {/* أي مسار غير معروف يحول للصفحة المناسبة */}
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </HashRouter>
  );
}
