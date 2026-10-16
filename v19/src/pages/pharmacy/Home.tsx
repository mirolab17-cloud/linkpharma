// src/pages/pharmacy/Home.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  PiggyBank,
  Wallet,
  TrendingDown,
  TrendingUp,
  Truck,
  User as UserIcon,
  ChevronLeft,
  Search,
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { getOrders, getPrices, getProducts } from '../../services/dataStorage';
import { Order, PriceRecord, Product } from '../../types';
import { formatCurrency } from '../../utils/formatPrice';
import { HomeSkeleton } from '../../components/Skeleton';

// ======================= لقطة الأسعار (للمقارنة بين الزيارات) =======================
// قواعد Firestore تمنع الصيدلية من قراءة سجل الأسعار (priceHistory)، لذلك نحتفظ على الجهاز
// بلقطة لأفضل سعر لكل صنف ونقارنها بآخر لقطة من يوم سابق.
interface PriceSnapshot {
  date: string; // YYYY-MM-DD (توقيت الجهاز)
  best: Record<string, number>;
  baseline: Record<string, number> | null;
  baselineDate: string | null;
}

const snapshotKey = (uid: string) => `lp_price_snapshot_${uid}`;

const todayString = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

function readSnapshot(uid: string): PriceSnapshot | null {
  try {
    const raw = localStorage.getItem(snapshotKey(uid));
    return raw ? (JSON.parse(raw) as PriceSnapshot) : null;
  } catch {
    return null;
  }
}

function writeSnapshot(uid: string, snap: PriceSnapshot) {
  try {
    localStorage.setItem(snapshotKey(uid), JSON.stringify(snap));
  } catch {
    /* التخزين غير متاح: نتجاهل بصمت */
  }
}

/** أفضل (أقل) سعر متاح لكل صنف */
function computeBestPrices(prices: PriceRecord[]): Record<string, number> {
  const best: Record<string, number> = {};
  for (const p of prices) {
    if (!p.available) continue;
    const value = p.effectivePrice && p.effectivePrice > 0 ? p.effectivePrice : p.price;
    if (!(value > 0)) continue;
    if (best[p.productId] === undefined || value < best[p.productId]) {
      best[p.productId] = value;
    }
  }
  return best;
}

interface PriceChange {
  productId: string;
  name: string;
  oldPrice: number;
  newPrice: number;
  pct: number; // موجب = ارتفاع، سالب = انخفاض
}

// ======================= الصفحة =======================
export const PharmacyHome: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [baseline, setBaseline] = useState<Record<string, number> | null>(null);
  const [baselineDate, setBaselineDate] = useState<string | null>(null);
  const [tab, setTab] = useState<'down' | 'up'>('down');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const [allOrders, allPrices, allProducts] = await Promise.all([
          getOrders(),
          getPrices(user.allowedSuppliers),
          getProducts(),
        ]);
        if (cancelled) return;

        setOrders(allOrders.filter((o) => o.pharmacyId === user.uid));
        setPrices(allPrices);
        setProducts(allProducts);

        // تحديث لقطة الأسعار وتحديد خط المقارنة
        const best = computeBestPrices(allPrices);
        const today = todayString();
        const stored = readSnapshot(user.uid);

        if (!stored) {
          writeSnapshot(user.uid, { date: today, best, baseline: null, baselineDate: null });
          setBaseline(null);
          setBaselineDate(null);
        } else if (stored.date === today) {
          writeSnapshot(user.uid, { ...stored, best });
          setBaseline(stored.baseline);
          setBaselineDate(stored.baselineDate);
        } else {
          writeSnapshot(user.uid, {
            date: today,
            best,
            baseline: stored.best,
            baselineDate: stored.date,
          });
          setBaseline(stored.best);
          setBaselineDate(stored.date);
        }
      } catch (e) {
        console.error('Home load error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  // ---------- بطاقات الملخص ----------
  const summary = useMemo(() => {
    const now = new Date();
    const monthOrders = orders.filter((o) => {
      if (o.status === 'cancelled') return false;
      const d = new Date(o.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });

    const total = monthOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    // أعلى سعر متاح حالياً لكل صنف (أساس حساب التوفير التقديري)
    const maxPrice: Record<string, number> = {};
    for (const p of prices) {
      if (!p.available || !(p.price > 0)) continue;
      if (maxPrice[p.productId] === undefined || p.price > maxPrice[p.productId]) {
        maxPrice[p.productId] = p.price;
      }
    }

    let savings = 0;
    for (const o of monthOrders) {
      for (const item of o.items || []) {
        const max = maxPrice[item.productId];
        if (max !== undefined && max > item.price) {
          savings += (max - item.price) * item.qty;
        }
      }
    }

    return { count: monthOrders.length, total, savings };
  }, [orders, prices]);

  // ---------- تغيّر الأسعار ----------
  const { down, up } = useMemo(() => {
    if (!baseline) return { down: [] as PriceChange[], up: [] as PriceChange[] };
    const names = new Map(products.map((p) => [p.id, p.tradeName]));
    const best = computeBestPrices(prices);
    const changes: PriceChange[] = [];

    for (const [productId, newPrice] of Object.entries(best)) {
      const oldPrice = baseline[productId];
      if (oldPrice === undefined || !(oldPrice > 0)) continue;
      if (Math.abs(newPrice - oldPrice) < 0.005) continue;
      const name = names.get(productId);
      if (!name) continue;
      changes.push({
        productId,
        name,
        oldPrice,
        newPrice,
        pct: ((newPrice - oldPrice) / oldPrice) * 100,
      });
    }

    return {
      down: changes.filter((c) => c.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 6),
      up: changes.filter((c) => c.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 6),
    };
  }, [baseline, prices, products]);

  const list = tab === 'down' ? down : up;
  const greetingName = user?.pharmacyName || user?.name || '';

  const goToProduct = (name: string) => navigate(`/app/prices?q=${encodeURIComponent(name)}`);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5" dir="rtl">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
          أهلاً{greetingName ? `، ${greetingName}` : ''} 👋
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">نظرة سريعة على نشاط صيدليتك هذا الشهر</p>
      </div>

      {loading ? (
        <HomeSkeleton />
      ) : (
        <>
          {/* بطاقات الملخص */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryCard
              icon={<ClipboardList className="w-5 h-5" />}
              tone="emerald"
              label="طلبيات هذا الشهر"
              value={String(summary.count)}
              hint={summary.count === 0 ? 'لم ترسل طلبية بعد هذا الشهر' : 'لا تشمل الملغاة'}
            />
            <SummaryCard
              icon={<Wallet className="w-5 h-5" />}
              tone="sky"
              label="إجمالي المشتريات"
              value={formatCurrency(summary.total)}
              hint="مجموع طلبيات الشهر"
            />
            <SummaryCard
              icon={<PiggyBank className="w-5 h-5" />}
              tone="amber"
              label="توفير تقديري"
              value={formatCurrency(summary.savings)}
              hint="مقارنة بأعلى سعر متاح حالياً"
            />
          </div>

          {/* أصناف تغيّر سعرها */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-extrabold text-slate-900 text-sm sm:text-base">أصناف تغيّر سعرها</h2>
              <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setTab('down')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1 transition ${
                    tab === 'down' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  <TrendingDown className="w-3.5 h-3.5" />
                  انخفض ({down.length})
                </button>
                <button
                  onClick={() => setTab('up')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1 transition ${
                    tab === 'up' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  ارتفع ({up.length})
                </button>
              </div>
            </div>

            {!baseline ? (
              <p className="text-sm text-slate-500 py-4 text-center leading-relaxed">
                سجّلنا أسعار اليوم كنقطة مقارنة. ستظهر هنا الأصناف التي تغيّر سعرها عند زيارتك القادمة.
              </p>
            ) : list.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">
                {tab === 'down' ? 'لا توجد أصناف انخفض سعرها' : 'لا توجد أصناف ارتفع سعرها'} منذ آخر زيارة سابقة
                {baselineDate ? ` (${baselineDate})` : ''}.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {list.map((c) => (
                    <li key={c.productId}>
                      <button
                        onClick={() => goToProduct(c.name)}
                        className="w-full flex items-center justify-between gap-3 py-3 text-right hover:bg-slate-50 rounded-lg px-2 -mx-2 transition"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-slate-900 truncate">{c.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            <span className="line-through">{formatCurrency(c.oldPrice)}</span>
                            <span className="mx-1">←</span>
                            <span className="font-bold text-slate-700">{formatCurrency(c.newPrice)}</span>
                          </div>
                        </div>
                        <span
                          dir="ltr"
                          className={`shrink-0 text-xs font-extrabold px-2.5 py-1 rounded-full ${
                            c.pct < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {c.pct > 0 ? '+' : ''}
                          {c.pct.toFixed(1)}%
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-slate-400 mt-3">
                  مقارنة أفضل سعر متاح اليوم بآخر زيارة{baselineDate ? ` بتاريخ ${baselineDate}` : ''} على هذا الجهاز.
                </p>
              </>
            )}
          </section>

          {/* اختصارات (الموردون والملف الشخصي انتقلا من الشريط السفلي إلى هنا) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <QuickLink to="/app/prices" icon={<Search className="w-5 h-5" />} label="الأسعار والعروض" />
            <QuickLink to="/app/suppliers" icon={<Truck className="w-5 h-5" />} label="دليل الموردين" />
            <QuickLink to="/app/profile" icon={<UserIcon className="w-5 h-5" />} label="الملف الشخصي" />
          </div>
        </>
      )}
    </div>
  );
};

// ======================= مكونات مساعدة =======================
const TONES = {
  emerald: 'bg-emerald-50 text-emerald-700',
  sky: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-50 text-amber-700',
} as const;

const SummaryCard: React.FC<{
  icon: React.ReactNode;
  tone: keyof typeof TONES;
  label: string;
  value: string;
  hint: string;
}> = ({ icon, tone, label, value, hint }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4">
    <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
      <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${TONES[tone]}`}>{icon}</span>
      {label}
    </div>
    <div className="text-2xl font-extrabold text-slate-900 mt-3" dir="ltr" style={{ textAlign: 'right' }}>
      {value}
    </div>
    <div className="text-[11px] text-slate-400 mt-1">{hint}</div>
  </div>
);

const QuickLink: React.FC<{ to: string; icon: React.ReactNode; label: string }> = ({ to, icon, label }) => (
  <Link
    to={to}
    className="bg-white border border-slate-200 hover:border-[#0f9d7a] rounded-2xl p-4 flex items-center justify-between gap-3 transition"
  >
    <span className="flex items-center gap-3 font-bold text-sm text-slate-800">
      <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">{icon}</span>
      {label}
    </span>
    <ChevronLeft className="w-4 h-4 text-slate-400" />
  </Link>
);
