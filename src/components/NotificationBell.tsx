// src/components/NotificationBell.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { AppNotification } from '../types';
import { formatGregorianDate } from '../utils/formatDate';
import { getPushStatus, enablePush, reactivatePush, PushStatus } from '../services/push';
import { 
  Bell, 
  CheckCheck, 
  Trash2, 
  ShieldAlert, 
  CheckCircle2, 
  Sparkles, 
  Info, 
  Clock, 
  Megaphone, 
  X,
  TrendingDown,
  Truck,
  PackageCheck,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { useToastStore } from '../store/useToastStore';

export const NotificationBell: React.FC = () => {
  const { user } = useAuthStore();
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification 
  } = useNotificationStore();
  const { success } = useToastStore();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [pushStatus, setPushStatus] = useState<PushStatus>(() => getPushStatus());
  const [isProcessingPush, setIsProcessingPush] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // تحديث حالة إذن الإشعارات عند فتح القائمة
  useEffect(() => {
    if (isOpen) {
      setPushStatus(getPushStatus());
    }
  }, [isOpen]);

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleEnablePush = async () => {
    setIsProcessingPush(true);
    try {
      const granted = await enablePush(user?.uid);
      setPushStatus(getPushStatus());
      if (granted) {
        success('تم تفعيل إشعارات الجوال بنجاح! ستصلك التنبيهات حتى لو التطبيق مغلق.', 'إشعارات الجوال');
      }
    } finally {
      setIsProcessingPush(false);
    }
  };

  const handleReactivatePush = async () => {
    setIsProcessingPush(true);
    try {
      const ok = await reactivatePush(user?.uid);
      setPushStatus(getPushStatus());
      if (ok) {
        success('تمت إعادة تهيئة واشتراك خدمة الإشعارات بنجاح.', 'إشعارات الجوال');
      }
    } finally {
      setIsProcessingPush(false);
    }
  };

  const displayedList = activeTab === 'unread' 
    ? notifications.filter((n) => !n.read) 
    : notifications;

  const handleMarkAll = async () => {
    await markAllAsRead();
  };

  const handleItemClick = async (notif: AppNotification) => {
    if (!notif.read) {
      await markAsRead(notif.id);
    }
    setIsOpen(false);
    const targetUrl = notif.actionUrl || notif.metadata?.actionUrl;
    if (targetUrl) {
      navigate(targetUrl);
    } else if (notif.type === 'order_update') {
      navigate('/app/orders');
    } else if (notif.type === 'price_alert') {
      navigate('/app/prices');
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteNotification(id);
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMin = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMin < 1) return 'الآن';
      if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
      if (diffHours < 24) return `منذ ${diffHours} ساعة`;
      if (diffDays === 1) return 'أمس';
      if (diffDays < 7) return `منذ ${diffDays} أيام`;
      return formatGregorianDate(isoString);
    } catch {
      return '';
    }
  };

  const getNotificationIcon = (type: string, metadata?: any) => {
    if (type === 'price_alert') {
      return <TrendingDown className="w-4 h-4 text-emerald-600" />;
    }
    if (type === 'order_update') {
      if (metadata?.orderStatus === 'delivered') {
        return <PackageCheck className="w-4 h-4 text-emerald-600" />;
      }
      return <Truck className="w-4 h-4 text-indigo-600" />;
    }
    if (type === 'status_change') {
      if (metadata?.newStatus === 'active') {
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      }
      if (metadata?.newStatus === 'suspended') {
        return <ShieldAlert className="w-4 h-4 text-rose-600" />;
      }
      return <Clock className="w-4 h-4 text-amber-600" />;
    }
    if (type === 'admin_announcement') {
      return <Megaphone className="w-4 h-4 text-[#0f9d7a]" />;
    }
    return <Info className="w-4 h-4 text-sky-600" />;
  };

  return (
    <div className="relative" ref={dropdownRef} dir="rtl">
      {/* زر الجرس مع شارة الإشعارات */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition focus:outline-hidden cursor-pointer"
        title="الإشعارات والتنبيهات المباشرة"
        aria-label="الإشعارات"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-xs animate-bounce">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* القائمة المنسدلة للإشعارات */}
      {isOpen && (
        <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden text-right animate-in fade-in slide-in-from-top-2">
          {/* الرأس */}
          <div className="p-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm text-slate-900">الإشعارات والتنبيهات</span>
              {unreadCount > 0 && (
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                  {unreadCount} جديدة
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAll}
                  className="text-[11px] text-[#0f9d7a] hover:text-[#0b7a5e] font-bold flex items-center gap-1 transition cursor-pointer"
                  title="تحديد الكل كمقروء"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>تحديد كمقروء</span>
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* تبويبات الفلترة */}
          <div className="flex items-center border-b border-slate-100 px-3 bg-white">
            <button
              onClick={() => setActiveTab('all')}
              className={`py-2 px-3 text-xs font-bold border-b-2 transition cursor-pointer ${
                activeTab === 'all'
                  ? 'border-[#0f9d7a] text-[#0f9d7a]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              الكل ({notifications.length})
            </button>
            <button
              onClick={() => setActiveTab('unread')}
              className={`py-2 px-3 text-xs font-bold border-b-2 transition cursor-pointer ${
                activeTab === 'unread'
                  ? 'border-[#0f9d7a] text-[#0f9d7a]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              غير المقروءة ({unreadCount})
            </button>
          </div>

          {/* شريط تشخيص وتفعيل إشعارات الجوال Push */}
          {pushStatus.needsReactivation ? (
            <div className="p-3 bg-amber-50/90 border-b border-amber-200 text-right space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>الإشعارات غير مفعّلة بالكامل</span>
                </div>
                <button
                  type="button"
                  onClick={handleReactivatePush}
                  disabled={isProcessingPush}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold transition flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isProcessingPush ? 'animate-spin' : ''}`} />
                  <span>إعادة التفعيل</span>
                </button>
              </div>
              <p className="text-[10px] text-amber-800 leading-relaxed">
                تم منح إذن المتصفح لكن لم يكتمل تسجيل الرمز مع السيرفر. اضغط إعادة التفعيل لاستقبال الإشعارات خارج المتصفح.
              </p>
            </div>
          ) : pushStatus.isSubscribed ? (
            <div className="px-3.5 py-2 bg-emerald-50/80 border-b border-emerald-100 flex items-center justify-between text-xs text-emerald-900">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>الإشعارات مفعّلة ✅</span>
              </div>
              <span className="text-[10px] text-emerald-700">تصلك حتى والتطبيق مغلق</span>
            </div>
          ) : pushStatus.isDenied ? (
            <div className="p-3 bg-rose-50 border-b border-rose-200 text-right space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                <span>تم حظر الإشعارات من إعدادات المتصفح</span>
              </div>
              <p className="text-[11px] text-rose-800 leading-relaxed pr-5">
                لتفعيلها: اضغط على أيقونة القفل أو الإعدادات 🔒 بجانب رابط الموقع في شريط عنوان المتصفح، واسمح بالإشعارات.
              </p>
            </div>
          ) : !pushStatus.supported ? (
            <div className="p-2.5 bg-slate-50 border-b border-slate-200 text-right">
              <p className="text-[10px] text-slate-500 leading-relaxed">
                📱 لمستخدمي iPhone: تعمل الإشعارات بعد «إضافة إلى الشاشة الرئيسية» (تثبيت الـ PWA عبر Safari).
              </p>
            </div>
          ) : (
            <div className="p-3 bg-emerald-50/50 border-b border-emerald-100 text-right space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800">إشعارات الجوال الفورية</div>
                  <div className="text-[10px] text-slate-500 truncate">تصلك فوراً حتى لو التطبيق مغلق</div>
                </div>
                <button
                  type="button"
                  onClick={handleEnablePush}
                  disabled={isProcessingPush}
                  className="px-3 py-1.5 rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  {isProcessingPush ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>جاري التفعيل...</span>
                    </>
                  ) : (
                    <>
                      <Bell className="w-3.5 h-3.5" />
                      <span>تفعيل إشعارات الجوال</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* محتوى الإشعارات */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {displayedList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <Bell className="w-8 h-8 mx-auto text-slate-300 stroke-[1.5]" />
                <p className="text-xs font-semibold">لا توجد إشعارات حالياً</p>
                <p className="text-[10px] text-slate-400">ستصلك هنا تنبيهات فورية عند تغيير حالة حسابك أو ورود تعميمات إدارية</p>
              </div>
            ) : (
              displayedList.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleItemClick(notif)}
                  className={`p-3.5 hover:bg-slate-50/80 transition cursor-pointer flex items-start gap-3 relative ${
                    !notif.read ? 'bg-emerald-50/30' : 'bg-white'
                  }`}
                >
                  {/* أيقونة النوع */}
                  <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                    notif.type === 'price_alert'
                      ? 'bg-emerald-100/80 text-emerald-700'
                      : notif.type === 'order_update'
                      ? 'bg-indigo-100/80 text-indigo-700'
                      : notif.type === 'status_change'
                      ? 'bg-amber-100/70 text-amber-700'
                      : notif.type === 'admin_announcement'
                      ? 'bg-teal-100/70 text-teal-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {getNotificationIcon(notif.type, notif.metadata)}
                  </div>

                  {/* نص الإشعار */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {notif.title}
                      </h4>
                      <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                        {formatRelativeTime(notif.createdAt)}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed break-words">
                      {notif.message}
                    </p>

                    {/* معلومات إضافية */}
                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-semibold text-slate-500">
                        {notif.type === 'price_alert'
                          ? '🎯 تنبيه سعر'
                          : notif.type === 'order_update'
                          ? '📦 حالة الطلبية'
                          : notif.type === 'status_change'
                          ? 'تحديث الحساب'
                          : notif.type === 'admin_announcement'
                          ? 'تعميم إداري'
                          : 'إشعار نظام'}
                      </span>

                      <div className="flex items-center gap-2">
                        {!notif.read && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="غير مقروء" />
                        )}
                        <button
                          onClick={(e) => handleDelete(e, notif.id)}
                          className="text-slate-300 hover:text-rose-600 p-1 rounded-md transition cursor-pointer"
                          title="حذف الإشعار"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* تذييل */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-center">
            <span className="text-[10px] text-slate-400 font-medium">
              يتم تحديث الإشعارات والتنبيهات بالوقت الفعلي عبر السحابة
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
