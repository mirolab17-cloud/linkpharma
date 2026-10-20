// src/pages/pharmacy/Cart.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useCartStore } from '../../store/useCartStore';
import { useToastStore } from '../../store/useToastStore';
import { createOrder, updateOrderItems, getSuppliers, getPrices, getRecurringOrderTemplates, saveRecurringOrderTemplates } from '../../services/dataStorage';
import { buildOrderWhatsAppMessage, openWhatsAppOrder } from '../../services/whatsapp';
import { formatCurrency, calculateEffectiveUnitPrice } from '../../utils/formatPrice';
import { formatGregorianDate } from '../../utils/formatDate';
import { Supplier, PriceRecord } from '../../types';
import {
  ShoppingCart,
  Trash2,
  Send,
  Building,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Plus,
  Minus,
  Sparkles,
  Printer,
  FileText,
  X,
  Share2,
  TrendingDown,
  Bookmark,
  AlertTriangle
} from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { isProfileComplete, isValidSaudiLocalPhone, triggerHaptic, playSuccessSound } from '../../utils/profile';
import { deliveryRuleForSupplier } from '../../services/v18Features';
import { formatBranchAddress, getDeliveryAreaKeys } from '../../utils/gaza';

export const PharmacyCart: React.FC = () => {
  const { user } = useAuthStore();
  const {
    items,
    updateQty,
    removeItem,
    clearSupplierItems,
    clearCart,
    getSupplierGroups,
    getTotalAmount,
    getTotalItemsCount,
    addItem
  } = useCartStore();
  const { success, error, warning, info } = useToastStore();
  const navigate = useNavigate();
  const isEditingOrder = typeof window !== 'undefined' && Boolean(user?.uid && localStorage.getItem(`pharma_edit_order_${user.uid}`));

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [sendingSupplierId, setSendingSupplierId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState(user?.defaultBranchId || '');

  // Data for "Best Cart" and Supplier minimum order amounts
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [allPrices, setAllPrices] = useState<PriceRecord[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Printable Invoice Modal State
  const [printInvoiceGroup, setPrintInvoiceGroup] = useState<{
    supplierId: string;
    supplierName: string;
    supplierWhatsapp: string;
    items: any[];
    subtotal: number;
  } | null>(null);

  useEffect(() => {
    async function loadAuxData() {
      try {
        const [sups, prs] = await Promise.all([
          getSuppliers(),
          getPrices()
        ]);
        setSuppliers(sups);
        setAllPrices(prs);
      } catch (e) {
        console.warn('Failed to load auxiliary cart data:', e);
      }
    }
    loadAuxData();
  }, []);

  const suppliersMap = useMemo(() => {
    const map = new Map<string, Supplier>();
    suppliers.forEach((s) => map.set(s.id, s));
    return map;
  }, [suppliers]);

  const supplierGroups = getSupplierGroups();
  const supplierKeys = Object.keys(supplierGroups);
  const availableBranches = user?.branches || [];
  const legacyAddress = String(user?.addressDetail || user?.address || '').trim();
  const legacyBranch = !availableBranches.length && user?.profileComplete && legacyAddress.length >= 3
    ? { id: 'legacy', name: 'العنوان المسجل', governorateId: '', governorate: user.governorate || '', cityId: '', city: user.city || '', streetId: user.streetId || '', street: user.street || '', addressDetail: legacyAddress, phone: user.phone }
    : undefined;
  const selectedBranch = availableBranches.find((branch) => branch.id === selectedBranchId) || availableBranches.find((branch) => branch.id === user?.defaultBranchId) || availableBranches[0] || legacyBranch;
  const selectedBranchValid = selectedBranch?.id === 'legacy'
    ? Boolean(user?.profileComplete && selectedBranch.addressDetail.trim().length >= 3)
    : Boolean(selectedBranch?.id && selectedBranch.governorateId && selectedBranch.cityId && selectedBranch.streetId && selectedBranch.governorate && selectedBranch.city && selectedBranch.street && selectedBranch.addressDetail?.trim().length >= 3);
  const orderPharmacy = user && selectedBranch ? {
    ...user, governorate: selectedBranch.governorate, city: selectedBranch.city, streetId: selectedBranch.streetId,
    street: selectedBranch.street, addressDetail: selectedBranch.addressDetail,
    address: selectedBranch.id === 'legacy' ? legacyAddress : formatBranchAddress(selectedBranch),
    phone: selectedBranch.phone || user.phone || '',
  } : null;
  // التحقق يجب أن يخص الفرع الذي اختاره المستخدم، لا الفرع الافتراضي القديم فقط.
  const orderProfile = user && selectedBranch && orderPharmacy ? {
    ...orderPharmacy,
    branches: selectedBranch.id === 'legacy' ? [] : [selectedBranch],
    defaultBranchId: selectedBranch.id === 'legacy' ? undefined : selectedBranch.id,
  } : user;
  const branchLocationKeys = getDeliveryAreaKeys(selectedBranch);

  // حساب أفضل سلة (Best Cart Optimization)
  const bestCartOptimization = useMemo(() => {
    if (items.length === 0 || allPrices.length === 0 || suppliers.length === 0) {
      return { totalSavings: 0, recommendations: [], hasSavings: false };
    }

    const allowedSet = user?.allowedSuppliers && user.allowedSuppliers.length > 0
      ? new Set(user.allowedSuppliers)
      : null;

    let totalSavings = 0;
    const plannedSubtotal = new Map<string, number>();
    items.forEach((item) => plannedSubtotal.set(item.supplierId, (plannedSubtotal.get(item.supplierId) || 0) + item.price * item.qty));
    const recommendations: {
      productId: string;
      tradeName: string;
      qty: number;
      currentSupplierId: string;
      currentSupplierName: string;
      currentPrice: number;
      bestSupplierId: string;
      bestSupplierName: string;
      bestSupplierWhatsapp: string;
      bestPrice: number;
      bestBonus?: string;
      savings: number;
    }[] = [];

    const candidatesByItem = items.map((item) => {
      // الأسعار المتاحة لهذا الصنف لدى المستودعات المسموحة والمتوفرة
      const candidatePrices = allPrices.filter(
        (p) => p.productId === item.productId &&
               p.available &&
               (!allowedSet || allowedSet.has(p.supplierId)) &&
               suppliersMap.has(p.supplierId)
      );
      const currentEffectivePrice = calculateEffectiveUnitPrice(item.price, item.bonus).effectivePrice;
      const bestAlternative = candidatePrices
        .filter((price) => price.supplierId !== item.supplierId)
        .map((price) => ({ price, effective: calculateEffectiveUnitPrice(price.price, price.bonus).effectivePrice }))
        .sort((a, b) => a.effective - b.effective)[0];
      return { item, currentEffectivePrice, bestAlternative };
    });

    // عالج التوفيرات الأكبر أولاً مع تحديث حدود كل مورد بعد كل اقتراح.
    candidatesByItem.sort((a, b) => {
      const savingA = a.bestAlternative ? (a.currentEffectivePrice - a.bestAlternative.effective) * a.item.qty : 0;
      const savingB = b.bestAlternative ? (b.currentEffectivePrice - b.bestAlternative.effective) * b.item.qty : 0;
      return savingB - savingA;
    });
    candidatesByItem.forEach(({ item, currentEffectivePrice, bestAlternative }) => {
      if (!bestAlternative || bestAlternative.effective >= currentEffectivePrice) return;
      const bestPriceRec = bestAlternative.price;
      const currentSupplier = suppliersMap.get(item.supplierId);
      const bestSupplier = suppliersMap.get(bestPriceRec.supplierId);
      if (!currentSupplier || !bestSupplier) return;
      const lineSubtotal = item.price * item.qty;
      const destinationSubtotal = plannedSubtotal.get(bestSupplier.id) || 0;
      const originSubtotal = plannedSubtotal.get(currentSupplier.id) || 0;
      const remainingOriginSubtotal = Math.max(0, originSubtotal - lineSubtotal);
      const nextDestinationSubtotal = destinationSubtotal + lineSubtotal;
      const originMinimum = deliveryRuleForSupplier(currentSupplier, branchLocationKeys).minimumOrderAmount;
      const destinationMinimum = deliveryRuleForSupplier(bestSupplier, branchLocationKeys).minimumOrderAmount;
      if (remainingOriginSubtotal > 0 && remainingOriginSubtotal < originMinimum) return;
      if (nextDestinationSubtotal < destinationMinimum) return;

      const deliveryDelta = (destinationSubtotal === 0 ? bestSupplier.deliveryFee || 0 : 0) -
        (remainingOriginSubtotal === 0 ? currentSupplier.deliveryFee || 0 : 0);
      const itemSavings = (currentEffectivePrice - bestAlternative.effective) * item.qty - deliveryDelta;
      if (itemSavings <= 0.01) return;
      plannedSubtotal.set(currentSupplier.id, remainingOriginSubtotal);
      plannedSubtotal.set(bestSupplier.id, nextDestinationSubtotal);
      totalSavings += itemSavings;
      recommendations.push({
        productId: item.productId,
        tradeName: item.tradeName,
        qty: item.qty,
        currentSupplierId: item.supplierId,
        currentSupplierName: item.supplierName,
        currentPrice: item.price,
        bestSupplierId: bestSupplier.id,
        bestSupplierName: bestSupplier.name,
        bestSupplierWhatsapp: bestSupplier.whatsapp,
        bestPrice: bestPriceRec.price,
        bestBonus: bestPriceRec.bonus,
        savings: itemSavings,
      });
    });

    return {
      totalSavings: Number(totalSavings.toFixed(2)),
      recommendations,
      hasSavings: totalSavings > 0.05
    };
  }, [items, allPrices, suppliers, suppliersMap, user?.allowedSuppliers, branchLocationKeys.join('|')]);

  // تطبيق التوزيع الذكي لأفضل سلة بضغطة واحدة
  const handleApplyBestCart = () => {
    setIsOptimizing(true);
    try {
      bestCartOptimization.recommendations.forEach((rec) => {
        // حذف الصنف من المورد الحالي
        removeItem(rec.productId, rec.currentSupplierId);
        // إضافته للمورد الأرخص
        addItem({
          productId: rec.productId,
          tradeName: rec.tradeName,
          supplierId: rec.bestSupplierId,
          supplierName: rec.bestSupplierName,
          supplierWhatsapp: rec.bestSupplierWhatsapp,
          price: rec.bestPrice,
          bonus: rec.bestBonus,
        }, rec.qty);
      });
      success(`تم تحسين السلة بنجاح! تم توفير ${formatCurrency(bestCartOptimization.totalSavings)} في إجمالي طلبيتك.`);
    } catch (err: any) {
      error('تعذر تطبيق أفضل سلة: ' + err.message);
    } finally {
      setIsOptimizing(false);
    }
  };

  const saveCartAsList = async () => {
    if (!user?.uid) return warning('سجّل الدخول أولًا لحفظ قائمة الشراء.');
    const name = window.prompt('اسم قائمة الشراء، مثل: الطلب الأسبوعي أو النواقص:')?.trim();
    if (!name) return;
    try {
      const saved = await getRecurringOrderTemplates(user.uid);
      const list = { id: `list_${Date.now()}`, name, schedule: 'custom' as const, items: items.map((item) => ({ ...item })), createdAt: new Date().toISOString() };
      const synced = await saveRecurringOrderTemplates(user.uid, [list, ...saved]);
      success(synced ? 'تم حفظ القائمة ومزامنتها مع حسابك.' : 'حُفظت القائمة على هذا الجهاز فقط؛ تحقق من اتصال Firebase لمزامنتها.');
    } catch (e: any) {
      error('تعذر حفظ قائمة الشراء: ' + (e.message || ''));
    }
  };

  // إرسال طلبية مورد واحد
  const handleSendSupplierOrder = async (supplierId: string) => {
    if (!user) return;

    if (!selectedBranchValid || !selectedBranch || !orderPharmacy) {
      warning('اختر فرعاً صحيحاً يحتوي محافظة ومدينة وشارعاً وعنواناً تفصيلياً قبل إرسال الطلبية.');
      navigate('/app/profile/edit');
      return;
    }
    if (!isValidSaudiLocalPhone(orderPharmacy.phone)) {
      warning('لا يمكن إرسال الطلبية قبل إدخال رقم جوال صحيح للفرع الافتراضي.');
      navigate('/app/profile/edit');
      return;
    }
    if (!orderProfile || !isProfileComplete(orderProfile)) {
      warning('لا يمكن إرسال الطلبية قبل إكمال الاسم والعنوان ورقم جوال يبدأ بـ 05 ويتكون من 10 أرقام.');
      navigate('/app/profile');
      return;
    }

    const group = supplierGroups[supplierId];
    if (!group || group.items.length === 0) return;

    setSendingSupplierId(supplierId);
    triggerHaptic([10, 35, 10]);

    try {
      // 1) تحديث الطلبية المرسلة قبل تأكيد المستودع، أو إنشاء طلبية جديدة.
      const editKey = `pharma_edit_order_${user.uid}`;
      const editingOrderId = localStorage.getItem(editKey);
      const wasEditing = Boolean(editingOrderId);
      if (editingOrderId) {
        await updateOrderItems(editingOrderId, user.uid, group.items.map((item) => ({
          productId: item.productId,
          name: item.tradeName,
          qty: item.qty,
          price: item.price,
          bonus: item.bonus,
        })), group.subtotal);
        localStorage.removeItem(editKey);
      } else {
        await createOrder({
          pharmacyId: user.uid,
          pharmacyName: orderPharmacy.pharmacyName || orderPharmacy.name || 'Pharmacy',
          pharmacyAddress: orderPharmacy.address,
          ...(selectedBranch.id !== 'legacy' ? { pharmacyBranchId: selectedBranch.id } : {}),
          pharmacyPhone: orderPharmacy.phone,
          supplierId: group.supplierId,
          supplierName: group.supplierName,
          items: group.items.map((item) => ({
            productId: item.productId,
            name: item.tradeName,
            qty: item.qty,
            price: item.price,
            bonus: item.bonus,
          })),
          total: group.subtotal,
          status: 'sent',
        });
      }

      // 2) إنشاء نص رسالة واتساب وفتح المحادثة
      const message = buildOrderWhatsAppMessage({
        pharmacy: orderPharmacy,
        items: group.items,
        subtotal: group.subtotal,
      });

      openWhatsAppOrder(group.supplierWhatsapp, message);

      // 3) تفريغ بنود المورد من السلة بعد الإرسال
      clearSupplierItems(supplierId);
      triggerHaptic([20, 50, 20]);
      playSuccessSound();
      success(`تم ${wasEditing ? 'تحديث' : 'تسجيل'} طلبية (${group.supplierName}) وفتح محادثة واتساب. فتح واتساب لا يعني تأكيد استلام المستودع.`);
    } catch (err: any) {
      console.error('Failed to send order', err);
      error('حدث خطأ أثناء حفظ الطلبية: ' + err.message);
    } finally {
      setSendingSupplierId(null);
    }
  };

  // إرسال لجميع الموردين واحداً تلو الآخر
  const handleSendAllOrders = async () => {
    if (!selectedBranchValid) {
      warning('اختر فرعاً صحيحاً قبل إرسال الطلبات.');
      navigate('/app/profile/edit');
      return;
    }
    if (!orderProfile || !isProfileComplete(orderProfile)) {
      warning('يرجى إكمال الاسم والعنوان ورقم الجوال قبل إرسال الطلبات.');
      navigate('/app/profile');
      return;
    }

    for (const supId of supplierKeys) {
      await handleSendSupplierOrder(supId);
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12" dir="rtl">
        <EmptyState
          icon={<ShoppingCart className="w-8 h-8" />}
          title="سلة الطلبات فارغة"
          description="لم تقم بإضافة أي أصناف دوائية إلى سلتك بعد. تصفح الأسعار والعروض واختر أفضل العروض."
          actionText="تصفح الأسعار والعروض"
          onAction={() => navigate('/app/prices')}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 md:pb-12 text-slate-900 dark:text-slate-100 transition-colors duration-200" dir="rtl">
      {/* رأس الصفحة */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>سلة الطلبيات</span>
            <span className="text-sm font-bold bg-emerald-100 dark:bg-emerald-950/70 text-[#0f9d7a] dark:text-emerald-300 px-2.5 py-0.5 rounded-full">
              {getTotalItemsCount()} صنف
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            يتم تجميع طلبيات كل مورد بشكل منفصل لإرسال رسالة واتساب مخصصة لكل مستودع
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => void saveCartAsList()} className="min-h-11 rounded-xl border border-emerald-200 px-3 text-xs font-bold text-[#0f9d7a] hover:bg-emerald-50">
            <Bookmark className="ml-1 inline h-4 w-4" />حفظ القائمة
          </button>
          {supplierKeys.length > 1 && (
            <button
              onClick={handleSendAllOrders}
              className="px-4 py-2 bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>إرسال الطلبات للجميع</span>
            </button>
          )}

          <button
            onClick={() => setConfirmClearOpen(true)}
            className="p-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl text-xs font-bold transition border border-rose-200 dark:border-rose-900"
            title="تفريغ السلة بالكامل"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* اختيار فرع التسليم قبل إرسال الطلب */}
      <section className="mb-6 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/20 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <label className="block text-xs font-black text-slate-800 dark:text-white" htmlFor="order-branch">فرع التسليم لهذه الطلبية</label>
          {availableBranches.length ? (
            <select id="order-branch" value={selectedBranch?.id || ''} onChange={(event) => setSelectedBranchId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900">
              {availableBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} — {branch.city}، {branch.governorate}</option>)}
            </select>
          ) : (
            <p className="mt-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">{legacyBranch ? 'سيُستخدم العنوان المسجل في حسابك مؤقتاً.' : 'لا يوجد عنوان صالح للتسليم في الملف الشخصي.'}</p>
          )}
          {selectedBranch && <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{orderPharmacy?.address || 'العنوان التفصيلي غير مكتمل'}</p>}
          {!selectedBranchValid && <p className="mt-1 text-[11px] font-bold text-rose-700">أكمل المحافظة والمدينة والشارع والعنوان التفصيلي قبل إرسال الطلب.</p>}
        </div>
        <Link to="/app/profile/edit" className="shrink-0 rounded-xl border border-emerald-300 bg-white px-3 py-2.5 text-xs font-bold text-emerald-800 dark:bg-slate-900 dark:text-emerald-200">إدارة الفروع والعناوين</Link>
      </section>

      {/* بطاقة أفضل سلة (Best Cart Optimizer) */}
      {bestCartOptimization.hasSavings && (
        <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-gradient-to-l from-emerald-500/10 via-teal-500/10 to-transparent border-2 border-emerald-500/30 dark:border-emerald-500/40 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0f9d7a] text-white flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                  خاصية «أفضل سلة»: يمكنك توفير {formatCurrency(bestCartOptimization.totalSavings)}!
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black">
                  توفير فوري
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                وجدنا بدائل توريد أرخص لـ <strong>{bestCartOptimization.recommendations.length}</strong> أصناف في سلتك لدى مستودعات أخرى معتمدة.
              </p>
            </div>
          </div>

          <button
            onClick={handleApplyBestCart}
            disabled={isOptimizing}
            className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black shadow-md hover:bg-slate-800 dark:hover:bg-slate-100 transition flex items-center gap-2 shrink-0 active:scale-95"
          >
            <TrendingDown className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
            <span>توزيع السلة لأقل سعر الآن</span>
          </button>
        </div>
      )}

      {/* تنبيه الملف الشخصي إن كان ناقصاً */}
      {(!isProfileComplete(user) || !selectedBranchValid) && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-300 font-semibold">
              يجب إكمال بيانات الصيدلية (الاسم، العنوان، والجوال) لتضمينها في رسائل واتساب عند الإرسال.
            </p>
          </div>
          <Link
            to="/app/profile"
            className="px-3 py-1.5 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition shrink-0"
          >
            إكمال الملف
          </Link>
        </div>
      )}

      {/* قائمة مجموعات الموردين */}
      <div className="space-y-6">
        {supplierKeys.map((supplierId) => {
          const group = supplierGroups[supplierId];
          const supDetails = suppliersMap.get(supplierId);
          const deliveryRule = deliveryRuleForSupplier(supDetails || {}, branchLocationKeys);
          const minOrder = deliveryRule.minimumOrderAmount;
          const isBelowMin = minOrder > 0 && group.subtotal < minOrder;
          const remainingToMin = minOrder > 0 ? minOrder - group.subtotal : 0;
          const isSending = sendingSupplierId === supplierId;

          return (
            <div
              key={supplierId}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden"
            >
              {/* ترويسة بطاقة المورد */}
              <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[#0f9d7a] flex items-center justify-center shadow-2xs">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-800 dark:text-white">
                      {group.supplierName}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium font-mono" dir="ltr">
                      +{group.supplierWhatsapp}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">توصيل {selectedBranch ? `(${selectedBranch.city} · ${selectedBranch.street})` : '(فرع الطلب غير محدد)'}: {deliveryRule.days.join('، ') || 'غير محدد لهذه المنطقة — تواصل مع المستودع'}{deliveryRule.cutoffTime ? ` · يغلق الطلب ${deliveryRule.cutoffTime}` : ''}{minOrder ? ` · الحد الأدنى ${formatCurrency(minOrder)}` : ''}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 dark:border-slate-700/60">
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 block font-semibold">
                      إجمالي المورد ({group.items.length} صنف)
                    </span>
                    <span className="text-base font-black text-[#0f9d7a] font-mono">
                      {formatCurrency(group.subtotal)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* زر طباعة / معاينة الفاتورة الرسمية */}
                    <button
                      onClick={() => setPrintInvoiceGroup(group)}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#0f9d7a] hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                      title="معاينة وطباعة الطلبية كفاتورة / PDF"
                    >
                      <Printer className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleSendSupplierOrder(supplierId)}
                      disabled={isSending}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-2 active:scale-95 disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      <span>{isSending ? 'جاري الإرسال...' : isEditingOrder ? 'حفظ التعديل وإرسال' : 'إرسال عبر واتساب'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* شريط الحد الأدنى للطلب للمستودع */}
              {minOrder > 0 && (
                <div className="px-4 py-2.5 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      الحد الأدنى لطلبيات هذا المستودع: <strong className="text-slate-800 dark:text-slate-200 font-mono">{formatCurrency(minOrder)}</strong>
                    </span>
                    {isBelowMin ? (
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-bold text-[10px] flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        <span>متبقي {formatCurrency(remainingToMin)} للوصول للحد الأدنى</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-bold text-[10px] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        <span>تم استيفاء الحد الأدنى للطلب ✓</span>
                      </span>
                    )}
                  </div>

                  {/* شريط تقدم النسبة المئوية */}
                  <div className="w-28 sm:w-36 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${isBelowMin ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, Math.round((group.subtotal / minOrder) * 100))}%` }}
                    />
                  </div>
                </div>
              )}

              {/* بنود طلبيات هذا المورد */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {group.items.map((item) => (
                  <div
                    key={item.productId}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">{item.tradeName}</h4>
                        {item.bonus && (
                          <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold rounded-md">
                            {item.bonus}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-2 mt-0.5">
                        {item.form && <span>{item.form}</span>}
                        {item.strength && <span>{item.strength}</span>}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-5">
                      {/* التحكم بالكمية */}
                      <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            updateQty(item.productId, item.supplierId, item.qty - 1)
                          }
                          className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-10 text-center text-xs font-bold text-slate-800 dark:text-slate-100 font-mono">
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateQty(item.productId, item.supplierId, item.qty + 1)
                          }
                          className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* السعر الفرعي */}
                      <div className="text-left min-w-24 font-mono">
                        <span className="text-xs text-slate-400 dark:text-slate-500 block font-normal">
                          {formatCurrency(item.price)} × {item.qty}
                        </span>
                        <span className="text-sm font-black text-slate-900 dark:text-white">
                          {formatCurrency(item.price * item.qty)}
                        </span>
                      </div>

                      {/* زر حذف بند */}
                      <button
                        onClick={() => removeItem(item.productId, item.supplierId)}
                        className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition"
                        title="حذف البند"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ملخص الإجمالي الكلي للشاشة الكبيرة */}
      <div className="mt-8 p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold block">الإجمالي الكلي لجميع الموردين:</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {formatCurrency(getTotalAmount())}
          </span>
        </div>

        <Link
          to="/app/prices"
          className="text-xs font-bold text-[#0f9d7a] hover:underline flex items-center gap-1"
        >
          <span>متابعة التسوق ومقارنة المزيد من الأصناف</span>
          <ArrowRight className="w-4 h-4 rotate-180" />
        </Link>
      </div>

      {/* نافذة معاينة وطباعة الفاتورة الرسمية PDF */}
      {printInvoiceGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" dir="rtl">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#0f9d7a]" />
                  <span>فاتورة طلبية رسمية: {printInvoiceGroup.supplierName}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  تاريخ الإنشاء: {formatGregorianDate(new Date().toISOString())}
                </p>
              </div>
              <button
                onClick={() => setPrintInvoiceGroup(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* محتوى الفاتورة القابل للطباعة */}
            <div className="flex-1 overflow-y-auto py-5 space-y-4 print:p-0">
              <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-xs">
                <div>
                  <span className="font-bold text-slate-400 block mb-1">الجهة الطالبة (الصيدلية):</span>
                  <div className="font-bold text-slate-900 dark:text-white">{user?.pharmacyName || user?.name}</div>
                  <div className="text-slate-600 dark:text-slate-300">{orderPharmacy?.address || user?.address}</div>
                  <div className="text-slate-600 dark:text-slate-300 font-mono" dir="ltr">{orderPharmacy?.phone || user?.phone}</div>
                </div>
                <div>
                  <span className="font-bold text-slate-400 block mb-1">المستودع المورد:</span>
                  <div className="font-bold text-slate-900 dark:text-white">{printInvoiceGroup.supplierName}</div>
                  <div className="text-slate-600 dark:text-slate-300 font-mono" dir="ltr">+{printInvoiceGroup.supplierWhatsapp}</div>
                </div>
              </div>

              {/* جدول بنود الطلبية */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">الصنف الدوائي</th>
                      <th className="p-3 text-center">الكمية</th>
                      <th className="p-3">السعر الفردي</th>
                      <th className="p-3">المجموع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {printInvoiceGroup.items.map((item, idx) => (
                      <tr key={item.productId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                          {item.tradeName}
                          {item.bonus && (
                            <span className="mr-2 text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                              (بونص: {item.bonus})
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center font-bold text-slate-900 dark:text-white font-mono">{item.qty}</td>
                        <td className="p-3 font-mono">{formatCurrency(item.price)}</td>
                        <td className="p-3 font-black text-slate-900 dark:text-white font-mono">{formatCurrency(item.price * item.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex justify-between items-center text-sm">
                <span className="font-extrabold text-emerald-900 dark:text-emerald-200">إجمالي الفاتورة الصافي:</span>
                <span className="text-lg font-black text-emerald-700 dark:text-emerald-300 font-mono">{formatCurrency(printInvoiceGroup.subtotal)}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <button
                onClick={() => window.print()}
                className="px-5 py-2.5 rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold transition flex items-center gap-2 shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الفاتورة أو حفظ كـ PDF</span>
              </button>

              <button
                onClick={() => setPrintInvoiceGroup(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* تأكيد تفريغ السلة */}
      <ConfirmDialog
        isOpen={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          clearCart();
          setConfirmClearOpen(false);
          success('تم تفريغ السلة بالكامل.');
        }}
        title="تفريغ سلة الطلبات"
        message="هل أنت متأكد من رغبتك في حذف جميع الأصناف والطلبيات من السلة؟"
        confirmText="نعم، إفراغ السلة"
      />
    </div>
  );
};
