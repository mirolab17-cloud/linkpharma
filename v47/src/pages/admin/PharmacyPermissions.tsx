// src/pages/admin/PharmacyPermissions.tsx — v47: التحكم بصلاحيات وميزات أي صيدلية أو مجموعة صيدليات دفعة واحدة
import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCw, Search, UploadCloud, FilePlus2, FlaskConical } from 'lucide-react';
import { getSuppliers, getUsers, saveUsersCapabilities } from '../../services/dataStorage';
import { FeatureOverride, PharmacyCapabilityKey, PharmacyFeatureKey, Supplier, UserProfile } from '../../types';
import { PHARMACY_FEATURES } from '../../utils/pharmacyFeatures';
import { PHARMACY_CAPABILITIES } from '../../utils/pharmacyCapabilities';
import { normalizeArabic } from '../../utils/arabicNormalize';
import { useToastStore } from '../../store/useToastStore';
import { ActionButton, MetricCard, SectionHeading } from '../../components/designSystem';

type CapOp = 'keep' | 'grant' | 'revoke';
type FeatOp = 'keep' | FeatureOverride;
type Filter = 'all' | 'with' | 'without';

const CAP_ICON: Record<PharmacyCapabilityKey, React.ReactNode> = {
  uploadPrices: <UploadCloud className="h-3.5 w-3.5" />,
  createProducts: <FilePlus2 className="h-3.5 w-3.5" />,
  createIngredients: <FlaskConical className="h-3.5 w-3.5" />,
};

const selectCls = 'w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold';

export const PharmacyPermissions: React.FC = () => {
  const { success, error } = useToastStore();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [capOps, setCapOps] = useState<Record<PharmacyCapabilityKey, CapOp>>({ uploadPrices: 'keep', createProducts: 'keep', createIngredients: 'keep' });
  const [featOps, setFeatOps] = useState<Record<PharmacyFeatureKey, FeatOp>>({ cheapest: 'keep', cartOptimization: 'keep', publicPrice: 'keep', activeIngredientFilter: 'keep' });
  const [supplierId, setSupplierId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [all, sups] = await Promise.all([getUsers(), getSuppliers()]);
      setUsers(all.filter((user) => user.role === 'pharmacy'));
      setSuppliers(sups);
    } catch (e: any) { error(e?.message || 'تعذر تحميل الصيدليات.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const supplierName = (id?: string) => suppliers.find((supplier) => supplier.id === id)?.name || 'مستودع غير معروف';
  const hasAny = (user: UserProfile) => Object.values(user.pharmacyCapabilities || {}).some(Boolean);

  const filtered = useMemo(() => {
    const q = normalizeArabic(query.trim());
    return users.filter((user) => {
      if (filter === 'with' && !hasAny(user)) return false;
      if (filter === 'without' && hasAny(user)) return false;
      if (!q) return true;
      return normalizeArabic(`${user.pharmacyName || ''} ${user.ownerName || ''} ${user.name || ''} ${user.email || ''} ${user.phone || ''} ${user.city || ''}`).includes(q);
    });
  }, [users, query, filter]);

  const toggle = (uid: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(uid)) next.delete(uid); else next.add(uid); return next; });
  const allSelected = filtered.length > 0 && filtered.every((user) => selected.has(user.uid));
  const toggleAll = () => setSelected((prev) => { const next = new Set(prev); filtered.forEach((user) => allSelected ? next.delete(user.uid) : next.add(user.uid)); return next; });
  const editOne = (uid: string) => { setSelected(new Set([uid])); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const nothingToApply = Object.values(capOps).every((op) => op === 'keep') && Object.values(featOps).every((op) => op === 'keep');

  const apply = async () => {
    const targets = users.filter((user) => selected.has(user.uid));
    if (!targets.length) { error('اختر صيدلية واحدة على الأقل.'); return; }
    if (nothingToApply) { error('اختر تغييراً واحداً على الأقل.'); return; }
    if (capOps.uploadPrices === 'grant' && !supplierId) { error('اختر المستودع الذي ستُرفع أسعاره.'); return; }
    setSaving(true);
    try {
      const updates = targets.map((user) => {
        const caps = { ...(user.pharmacyCapabilities || {}) };
        (Object.keys(capOps) as PharmacyCapabilityKey[]).forEach((key) => {
          if (capOps[key] === 'grant') caps[key] = true;
          if (capOps[key] === 'revoke') delete caps[key];
        });
        const features = { ...(user.featureOverrides || {}) };
        (Object.keys(featOps) as PharmacyFeatureKey[]).forEach((key) => {
          const op = featOps[key];
          if (op === 'keep') return;
          if (op === 'inherit') delete features[key]; else features[key] = op;
        });
        return {
          uid: user.uid,
          pharmacyCapabilities: caps,
          priceUploadSupplierId: capOps.uploadPrices === 'grant' ? supplierId : capOps.uploadPrices === 'revoke' ? null : (user.priceUploadSupplierId || null),
          featureOverrides: features,
        };
      });
      await saveUsersCapabilities(updates);
      success(`تم تطبيق التغييرات على ${updates.length} صيدلية.`);
      setSelected(new Set());
      setCapOps({ uploadPrices: 'keep', createProducts: 'keep', createIngredients: 'keep' });
      setFeatOps({ cheapest: 'keep', cartOptimization: 'keep', publicPrice: 'keep', activeIngredientFilter: 'keep' });
      await load();
    } catch (e: any) { error(e?.message || 'تعذر حفظ الصلاحيات.'); }
    finally { setSaving(false); }
  };

  const withCaps = users.filter(hasAny).length;

  return (
    <div className="space-y-5 pb-16" dir="rtl">
      <SectionHeading
        eyebrow="الصيدليات"
        title="صلاحيات الصيدليات"
        description="امنح أو اسحب صلاحية رفع الأسعار وإنشاء الأصناف والمواد الفعالة، وتحكم بإظهار ميزات الواجهة، لصيدلية واحدة أو لعدة صيدليات معاً. تظهر الصلاحية للصيدلية فوراً في صفحة «أدواتي» وفي الرئيسية."
        icon={<KeyRound className="h-6 w-6 text-[#0f9d7a]" />}
        action={<ActionButton tone="neutral" onClick={() => void load()} disabled={loading}><RefreshCw className={`ml-1.5 inline h-4 w-4 ${loading ? 'animate-spin' : ''}`} />تحديث</ActionButton>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="الصيدليات" value={users.length} />
        <MetricCard label="لديها صلاحيات إضافية" value={withCaps} tone="brand" />
        <MetricCard label="المحددة الآن" value={selected.size} tone="review" />
      </div>

      <section className="rounded-3xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5">
        <h2 className="text-sm font-black text-slate-900">
          {selected.size ? `سيُطبَّق على ${selected.size} صيدلية محددة` : 'حدّد الصيدليات من القائمة أدناه أولاً'}
        </h2>

        <h3 className="mt-4 text-xs font-black text-slate-700">الصلاحيات الإضافية</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {PHARMACY_CAPABILITIES.map((cap) => (
            <label key={cap.key} className="block rounded-2xl border border-slate-200 bg-white p-3 text-xs font-black text-slate-800">
              <span className="flex items-center gap-1.5">{CAP_ICON[cap.key]}{cap.label}</span>
              <span className="mb-2 mt-1 block text-[10px] font-medium leading-5 text-slate-500">{cap.description}</span>
              <select value={capOps[cap.key]} onChange={(e) => setCapOps((prev) => ({ ...prev, [cap.key]: e.target.value as CapOp }))} className={selectCls}>
                <option value="keep">بدون تغيير</option>
                <option value="grant">منح الصلاحية</option>
                <option value="revoke">سحب الصلاحية</option>
              </select>
            </label>
          ))}
        </div>
        {capOps.uploadPrices === 'grant' && (
          <label className="mt-3 block max-w-md text-xs font-black text-slate-800">
            المستودع الذي ترفع الصيدلية أسعاره (إجباري)
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={`${selectCls} mt-1`}>
              <option value="">— اختر المستودع —</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </label>
        )}

        <h3 className="mt-5 text-xs font-black text-slate-700">ميزات واجهة الصيدلية</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PHARMACY_FEATURES.map((feature) => (
            <label key={feature.key} className="block rounded-2xl border border-slate-200 bg-white p-3 text-xs font-black text-slate-800">
              {feature.label}
              <select value={featOps[feature.key]} onChange={(e) => setFeatOps((prev) => ({ ...prev, [feature.key]: e.target.value as FeatOp }))} className={`${selectCls} mt-2`}>
                <option value="keep">بدون تغيير</option>
                <option value="inherit">حسب الإعداد العام</option>
                <option value="show">إظهار</option>
                <option value="hide">إخفاء</option>
              </select>
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ActionButton onClick={() => void apply()} disabled={saving || !selected.size || nothingToApply}>{saving ? 'جاري الحفظ...' : `تطبيق على ${selected.size} صيدلية`}</ActionButton>
          {selected.size > 0 && <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-black text-slate-500 hover:underline">إلغاء التحديد</button>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="flex flex-wrap gap-2">
            {([['all', 'الكل'], ['with', 'لديها صلاحيات'], ['without', 'بلا صلاحيات']] as [Filter, string][]).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFilter(id)} className={`rounded-full px-3.5 py-1.5 text-[11px] font-black transition ${filter === id ? 'bg-[#0f9d7a] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم الصيدلية أو المالك أو الهاتف أو المدينة" className="w-full rounded-xl border border-slate-200 p-2.5 pr-9 text-xs" />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-emerald-600" />
            تحديد كل النتائج ({filtered.length})
          </label>
        </div>

        {loading ? <p className="p-10 text-center text-xs text-slate-500">جاري التحميل...</p> : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((user) => (
              <li key={user.uid} className="flex flex-wrap items-center gap-3 p-3.5 sm:flex-nowrap">
                <input type="checkbox" checked={selected.has(user.uid)} onChange={() => toggle(user.uid)} className="h-4 w-4 shrink-0 accent-emerald-600" aria-label={`تحديد ${user.pharmacyName || user.name}`} />
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-slate-900">{user.pharmacyName || user.name || user.email}</b>
                  <span className="block truncate text-[11px] text-slate-500">{[user.ownerName, user.city, user.phone].filter(Boolean).join(' · ') || user.email}</span>
                  <span className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-black ${user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{user.status === 'active' ? 'نشطة' : user.status === 'pending' ? 'قيد المراجعة' : 'موقوفة'}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 sm:w-72">
                  {PHARMACY_CAPABILITIES.filter((cap) => user.pharmacyCapabilities?.[cap.key]).map((cap) => (
                    <span key={cap.key} className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-700">
                      {CAP_ICON[cap.key]}{cap.label}{cap.key === 'uploadPrices' && user.priceUploadSupplierId ? `: ${supplierName(user.priceUploadSupplierId)}` : ''}
                    </span>
                  ))}
                  {!hasAny(user) && <span className="text-[10px] text-slate-400">بلا صلاحيات إضافية</span>}
                </div>
                <button type="button" onClick={() => editOne(user.uid)} className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-50">تعديل</button>
              </li>
            ))}
            {!filtered.length && <li className="p-10 text-center text-xs text-slate-500">لا توجد صيدليات مطابقة.</li>}
          </ul>
        )}
      </section>
    </div>
  );
};
