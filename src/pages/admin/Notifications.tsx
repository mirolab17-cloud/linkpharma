// src/pages/admin/Notifications.tsx
import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import { 
  getUsers, 
  createNotification, 
  updateNotification, 
  deleteNotification, 
  subscribeToNotifications,
  getNotificationSettings,
  updateNotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS
} from '../../services/dataStorage';
import { 
  AppNotification, 
  UserProfile, 
  NotificationChannel, 
  NotificationPriority, 
  NotificationType, 
  NotificationStatus,
  NotificationSettings,
  NotificationRepeatMode
} from '../../types';
import { sendPush, cancelScheduledPush } from '../../services/push';
import { formatGregorianDate } from '../../utils/formatDate';
import { 
  Bell, 
  Send, 
  Clock, 
  Settings, 
  Users, 
  Plus, 
  Trash2, 
  Edit3, 
  Copy, 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles, 
  Megaphone, 
  Search, 
  RefreshCw, 
  ExternalLink,
  ShieldAlert,
  Smartphone,
  Eye,
  MousePointerClick,
  EyeOff,
  Calendar,
  XCircle,
  Play,
  Pause
} from 'lucide-react';

export const Notifications: React.FC = () => {
  const { user } = useAuthStore();
  const { success, error: toastError, info } = useToastStore();

  const [activeTab, setActiveTab] = useState<'create' | 'history' | 'settings' | 'subscribers'>('create');
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [notificationsList, setNotificationsList] = useState<AppNotification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // الفلترة في تبويب السجل
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilterStatus, setHistoryFilterStatus] = useState<string>('all');

  // نموذج إنشاء إشعار
  const [formTitle, setFormTitle] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formType, setFormType] = useState<NotificationType>('admin_announcement');
  const [formPriority, setFormPriority] = useState<NotificationPriority>('normal');
  const [formChannels, setFormChannels] = useState<NotificationChannel[]>(['inbox', 'push']);
  const [formActionUrl, setFormActionUrl] = useState('/app/prices');
  const [formCustomUrl, setFormCustomUrl] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  
  // الجمهور
  const [formAudienceType, setFormAudienceType] = useState<'all' | 'users' | 'status' | 'city'>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['active']);
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [userSearchTerm, setUserSearchTerm] = useState('');

  // التكرار للعرض داخل المنصة
  const [formRepeatMode, setFormRepeatMode] = useState<NotificationRepeatMode>('once');
  const [formEveryHours, setFormEveryHours] = useState<number>(24);
  const [formMaxShows, setFormMaxShows] = useState<number>(1);
  const [formAllowDismiss, setFormAllowDismiss] = useState<boolean>(true);

  // الجدولة
  const [formScheduleType, setFormScheduleType] = useState<'now' | 'scheduled'>('now');
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formExpiresAt, setFormExpiresAt] = useState('');

  // استدعاء البيانات الأولية
  useEffect(() => {
    getUsers().then(setUsersList).catch(() => {});
    getNotificationSettings().then(setSettings).catch(() => {});

    const unsub = subscribeToNotifications(user?.uid || '', (list) => {
      setNotificationsList(list);
    }, true);

    return () => unsub();
  }, [user]);

  const toggleChannel = (channel: NotificationChannel) => {
    if (formChannels.includes(channel)) {
      if (formChannels.length > 1) {
        setFormChannels(formChannels.filter((c) => c !== channel));
      }
    } else {
      setFormChannels([...formChannels, channel]);
    }
  };

  const getEffectiveActionUrl = () => {
    if (formActionUrl === 'custom') {
      return formCustomUrl.trim();
    }
    return formActionUrl;
  };

  const resetForm = () => {
    setEditingId(null);
    setFormTitle('');
    setFormMessage('');
    setFormType('admin_announcement');
    setFormPriority('normal');
    setFormChannels(['inbox', 'push']);
    setFormActionUrl('/app/prices');
    setFormCustomUrl('');
    setFormImageUrl('');
    setFormAudienceType('all');
    setSelectedUserIds([]);
    setSelectedStatuses(['active']);
    setSelectedCity('all');
    setFormRepeatMode('once');
    setFormEveryHours(24);
    setFormMaxShows(1);
    setFormAllowDismiss(true);
    setFormScheduleType('now');
    setFormScheduledAt('');
    setFormExpiresAt('');
  };

  // إرسال أو حفظ الإشعار
  const handleSubmit = async (targetStatus: NotificationStatus = 'sent', isTestOnly = false) => {
    if (!formTitle.trim() || !formMessage.trim()) {
      toastError('يرجى كتابة عنوان الإشعار ونص الرسالة.');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalUrl = getEffectiveActionUrl();
      const scheduledIso = formScheduleType === 'scheduled' && formScheduledAt 
        ? new Date(formScheduledAt).toISOString() 
        : undefined;
      const expiresIso = formExpiresAt ? new Date(formExpiresAt).toISOString() : undefined;

      let audiencePayload: any = { type: formAudienceType };
      if (isTestOnly) {
        audiencePayload = { type: 'users', userIds: [user?.uid || ''] };
      } else if (formAudienceType === 'users') {
        audiencePayload.userIds = selectedUserIds;
      } else if (formAudienceType === 'status') {
        audiencePayload.statuses = selectedStatuses;
      } else if (formAudienceType === 'city') {
        audiencePayload.cities = selectedCity !== 'all' ? [selectedCity] : [];
      }

      const notifData: any = {
        title: formTitle.trim(),
        message: formMessage.trim(),
        type: formType,
        priority: formPriority,
        channels: formChannels,
        actionUrl: finalUrl,
        imageUrl: formImageUrl.trim() || undefined,
        audience: audiencePayload,
        repeat: {
          mode: formRepeatMode,
          everyHours: formEveryHours,
          maxShows: formMaxShows,
          allowDismiss: formAllowDismiss,
        },
        scheduledAt: scheduledIso,
        expiresAt: expiresIso,
        status: targetStatus,
        createdBy: user?.name || user?.email || 'الأدمن',
        metadata: {
          actionUrl: finalUrl,
          priority: formPriority,
        },
      };

      if (editingId) {
        await updateNotification(editingId, notifData);
        success('تم تحديث الإشعار بنجاح.');
      } else {
        await createNotification(notifData);
        if (isTestOnly) {
          success('تم إرسال إشعار تجريبي لك فقط بنجاح.');
        } else if (targetStatus === 'draft') {
          success('تم حفظ الإشعار كمسودة.');
        } else if (targetStatus === 'scheduled') {
          success('تمت جدولة الإشعار بنجاح.');
        } else {
          success('تم إرسال وتوزيع الإشعار بنجاح.');
        }
      }

      resetForm();
      setActiveTab('history');
    } catch (err: any) {
      toastError('حدث خطأ أثناء حفظ الإشعار: ' + (err.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  // تكرار إشعار (Duplicate)
  const handleDuplicate = (n: AppNotification) => {
    setEditingId(null);
    setFormTitle(`${n.title} (نسخة)`);
    setFormMessage(n.message);
    setFormType(n.type);
    setFormPriority(n.priority || 'normal');
    setFormChannels(n.channels || ['inbox']);
    setFormActionUrl(n.actionUrl || '/app/prices');
    setFormImageUrl(n.imageUrl || '');
    if (n.audience) {
      setFormAudienceType(n.audience.type);
      setSelectedUserIds(n.audience.userIds || []);
      setSelectedStatuses(n.audience.statuses || ['active']);
    }
    if (n.repeat) {
      setFormRepeatMode(n.repeat.mode);
      setFormEveryHours(n.repeat.everyHours || 24);
      setFormMaxShows(n.repeat.maxShows || 1);
      setFormAllowDismiss(n.repeat.allowDismiss ?? true);
    }
    setActiveTab('create');
    info('تم نسخ بيانات الإشعار إلى النموذج.');
  };

  // تعديل إشعار
  const handleEdit = (n: AppNotification) => {
    setEditingId(n.id);
    setFormTitle(n.title);
    setFormMessage(n.message);
    setFormType(n.type);
    setFormPriority(n.priority || 'normal');
    setFormChannels(n.channels || ['inbox']);
    setFormActionUrl(n.actionUrl || '/app/prices');
    setFormImageUrl(n.imageUrl || '');
    if (n.audience) {
      setFormAudienceType(n.audience.type);
      setSelectedUserIds(n.audience.userIds || []);
      setSelectedStatuses(n.audience.statuses || ['active']);
    }
    if (n.repeat) {
      setFormRepeatMode(n.repeat.mode);
      setFormEveryHours(n.repeat.everyHours || 24);
      setFormMaxShows(n.repeat.maxShows || 1);
      setFormAllowDismiss(n.repeat.allowDismiss ?? true);
    }
    if (n.scheduledAt) {
      setFormScheduleType('scheduled');
      setFormScheduledAt(n.scheduledAt.substring(0, 16));
    }
    if (n.expiresAt) {
      setFormExpiresAt(n.expiresAt.substring(0, 16));
    }
    setActiveTab('create');
  };

  // إلغاء جدولة إشعار
  const handleCancelSchedule = async (n: AppNotification) => {
    try {
      if (n.pushIds && n.pushIds.length > 0) {
        for (const pid of n.pushIds) {
          await cancelScheduledPush(pid);
        }
      }
      await updateNotification(n.id, { status: 'cancelled' });
      success('تم إلغاء جدولة الإشعار.');
    } catch {
      toastError('تعذر إلغاء الجدولة.');
    }
  };

  // تفعيل / إيقاف مؤقت
  const handleToggleStatus = async (n: AppNotification) => {
    const nextStatus = n.status === 'sent' ? 'draft' : 'sent';
    await updateNotification(n.id, { status: nextStatus });
    success(`تم تغيير حالة الإشعار إلى ${nextStatus === 'sent' ? 'نشط' : 'متوقف'}.`);
  };

  // حذف إشعار
  const handleDelete = async (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الإشعار نهائياً؟')) {
      await deleteNotification(id, user?.uid, true);
      success('تم حذف الإشعار بنجاح.');
    }
  };

  // حفظ الإعدادات
  const handleSaveSettings = async () => {
    try {
      await updateNotificationSettings(settings);
      success('تم حفظ إعدادات الإشعارات وشريط التحديثات بنجاح.');
    } catch {
      toastError('تعذر حفظ الإعدادات.');
    }
  };

  // تصفية التاريخ
  const filteredHistory = notificationsList.filter((n) => {
    const matchesSearch = 
      n.title.toLowerCase().includes(historySearch.toLowerCase()) ||
      n.message.toLowerCase().includes(historySearch.toLowerCase());

    if (!matchesSearch) return false;
    if (historyFilterStatus === 'all') return true;
    return n.status === historyFilterStatus;
  });

  // إحصائيات المشتركين في Push
  const pushSubscribedCount = usersList.filter((u) => u.pushEnabled && Boolean(u.pushToken)).length;
  const pushPendingTokenCount = usersList.filter((u) => u.pushEnabled && !u.pushToken).length;
  const totalPharmaciesCount = usersList.filter((u) => u.role === 'pharmacy').length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* رأس الصفحة */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <span className="p-2 rounded-2xl bg-emerald-50 text-[#0f9d7a]">
              <Bell className="w-6 h-6" />
            </span>
            <span>مركز الإشعارات والتنبيهات المباشرة</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
            بث التنبيهات الخارجية (Push)، النوافذ المنبثقة الترحيبية، والتحكم بشريط أسعار الصفحة الرئيسية.
          </p>
        </div>

        {/* أزرار التبويبات */}
        <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'create'
                ? 'bg-white text-[#0f9d7a] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>إنشاء إشعار</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-white text-[#0f9d7a] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>المجدولة والسجل ({notificationsList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-white text-[#0f9d7a] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>الإعدادات</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('subscribers')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'subscribers'
                ? 'bg-white text-[#0f9d7a] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>حالة الاشتراكات ({pushSubscribedCount})</span>
          </button>
        </div>
      </div>

      {/* ===================== التبويب 1: إنشاء إشعار ===================== */}
      {activeTab === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* النموذج: 7 أعمدة */}
          <div className="lg:col-span-7 bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/90 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-base font-black text-slate-900">
                {editingId ? 'تعديل الإشعار' : 'إعداد إشعار جديد'}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-rose-600 font-bold hover:underline"
                >
                  إلغاء التعديل
                </button>
              )}
            </div>

            {/* الحقول الأساسية */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  عنوان الإشعار *
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="مثال: تحديث عاجل لأسعار مستودع السلام..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-[#0f9d7a] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  نص الإشعار *
                </label>
                <textarea
                  rows={3}
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  placeholder="اكتب تفاصيل التنبيه أو التعميم الصيدلاني هنا..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-[#0f9d7a] focus:border-transparent leading-relaxed"
                />
              </div>

              {/* القنوات */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  قنوات العرض والإرسال (متعددة الاختيار)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { id: 'push' as NotificationChannel, label: 'Push خارجي', desc: 'خارج المتصفح OneSignal' },
                    { id: 'inbox' as NotificationChannel, label: 'صندوق الجرس', desc: 'داخل قائمة الإشعارات' },
                    { id: 'modal' as NotificationChannel, label: 'نافذة منبثقة', desc: 'تظهر أول فتح الموقع' },
                    { id: 'banner' as NotificationChannel, label: 'شريط علوي', desc: 'بانر قابل للإغلاق' },
                  ].map((ch) => {
                    const active = formChannels.includes(ch.id);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => toggleChannel(ch.id)}
                        className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
                          active
                            ? 'bg-emerald-50 border-[#0f9d7a] text-emerald-950 shadow-2xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-black">{ch.label}</span>
                          <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${active ? 'bg-[#0f9d7a] border-[#0f9d7a] text-white' : 'border-slate-300'}`}>
                            {active && '✓'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-tight">{ch.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* النوع والأولوية والرابط */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    نوع الإشعار
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as NotificationType)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs bg-white"
                  >
                    <option value="admin_announcement">تعميم إداري 📢</option>
                    <option value="price_alert">تنبيه أسعار 🎯</option>
                    <option value="order_update">تحديث طلبيات 📦</option>
                    <option value="status_change">حالة الحساب 🛡️</option>
                    <option value="system">إشعار نظام ℹ️</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    مستوى الأولوية
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as NotificationPriority)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs bg-white"
                  >
                    <option value="normal">عادي (Normal)</option>
                    <option value="high">هام (High)</option>
                    <option value="urgent">عاجل جداً (Urgent)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    رابط الإجراء
                  </label>
                  <select
                    value={formActionUrl}
                    onChange={(e) => setFormActionUrl(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs bg-white"
                  >
                    <option value="/app/prices">صفحة الأسعار الرئيسية</option>
                    <option value="/app/orders">طلبيات الصيدلية</option>
                    <option value="/app/cart">سلة الطلبات</option>
                    <option value="/app/suppliers">المستودعات</option>
                    <option value="/app/profile">الملف والاشتراك</option>
                    <option value="custom">رابط مخصص أو خارجي...</option>
                  </select>
                </div>
              </div>

              {formActionUrl === 'custom' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    الرابط المخصص
                  </label>
                  <input
                    type="text"
                    value={formCustomUrl}
                    onChange={(e) => setFormCustomUrl(e.target.value)}
                    placeholder="https://... أو مسار داخلي مثل /app/prices"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  رابط صورة اختيارية (Image URL)
                </label>
                <input
                  type="text"
                  value={formImageUrl}
                  onChange={(e) => setFormImageUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/... (اختياري للبانر والنافذة المنبثقة)"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-mono dir-ltr"
                />
              </div>

              {/* الجمهور المستهدف */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-black text-slate-800 mb-2">
                  الجمهور المستهدف
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  {[
                    { id: 'all', label: 'كل المستخدمين' },
                    { id: 'users', label: 'مستخدمون محددون' },
                    { id: 'status', label: 'حسب الحالة' },
                    { id: 'city', label: 'حسب المدينة' },
                  ].map((aud) => (
                    <button
                      key={aud.id}
                      type="button"
                      onClick={() => setFormAudienceType(aud.id as any)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        formAudienceType === aud.id
                          ? 'bg-emerald-50 border-[#0f9d7a] text-[#0f9d7a]'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {aud.label}
                    </button>
                  ))}
                </div>

                {/* اختيار مستخدمين محددين */}
                {formAudienceType === 'users' && (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                    <input
                      type="text"
                      placeholder="ابحث باسم الصيدلية أو البريد..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                    />
                    <div className="max-h-36 overflow-y-auto space-y-1 divide-y divide-slate-100">
                      {usersList
                        .filter((u) => 
                          (u.pharmacyName || u.name || '').toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                          u.email.toLowerCase().includes(userSearchTerm.toLowerCase())
                        )
                        .map((u) => {
                          const isSelected = selectedUserIds.includes(u.uid);
                          return (
                            <label
                              key={u.uid}
                              className="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-100 rounded-lg cursor-pointer text-xs"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  if (isSelected) {
                                    setSelectedUserIds(selectedUserIds.filter((id) => id !== u.uid));
                                  } else {
                                    setSelectedUserIds([...selectedUserIds, u.uid]);
                                  }
                                }}
                                className="rounded text-[#0f9d7a]"
                              />
                              <span className="font-bold text-slate-800">{u.pharmacyName || u.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono">({u.email})</span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* تكرار العرض داخل المنصة */}
                {formChannels.includes('modal') && (
                  <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <h4 className="text-xs font-black text-slate-800">
                      إعدادات تكرار النافذة المنبثقة (Modal)
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { id: 'once', label: 'مرة واحدة فقط' },
                        { id: 'every_session', label: 'كل فتح للجلسة' },
                        { id: 'every_hours', label: 'كل X ساعات' },
                        { id: 'daily', label: 'يومياً' },
                        { id: 'until_dismissed', label: 'حتى يغلقه الصيدلي' },
                      ].map((rep) => (
                        <button
                          key={rep.id}
                          type="button"
                          onClick={() => setFormRepeatMode(rep.id as any)}
                          className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                            formRepeatMode === rep.id
                              ? 'bg-emerald-100 border-[#0f9d7a] text-emerald-900'
                              : 'bg-white border-slate-200 text-slate-600'
                          }`}
                        >
                          {rep.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formAllowDismiss}
                          onChange={(e) => setFormAllowDismiss(e.target.checked)}
                          className="rounded text-[#0f9d7a]"
                        />
                        <span className="font-bold text-slate-700">إظهار زر «عدم العرض مجدداً»</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* الجدولة وتاريخ الانتهاء */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      وقت الإرسال والجدولة
                    </label>
                    <select
                      value={formScheduleType}
                      onChange={(e) => setFormScheduleType(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white mb-2"
                    >
                      <option value="now">إرسال فوري الآن</option>
                      <option value="scheduled">جدولة لوقت محدد (Asia/Hebron)</option>
                    </select>

                    {formScheduleType === 'scheduled' && (
                      <input
                        type="datetime-local"
                        value={formScheduledAt}
                        onChange={(e) => setFormScheduledAt(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs bg-white"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      تاريخ انتهاء الصلاحية (اختياري)
                    </label>
                    <input
                      type="datetime-local"
                      value={formExpiresAt}
                      onChange={(e) => setFormExpiresAt(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* الأزرار */}
            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => handleSubmit('sent', true)}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Smartphone className="w-4 h-4 text-slate-500" />
                <span>إرسال تجريبي لي فقط</span>
              </button>

              <div className="flex items-center gap-2 mr-auto">
                <button
                  type="button"
                  onClick={() => handleSubmit('draft')}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  حفظ كمسودة
                </button>

                <button
                  type="button"
                  onClick={() => handleSubmit(formScheduleType === 'scheduled' ? 'scheduled' : 'sent')}
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-black transition shadow-sm flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>جاري الحفظ...</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>{formScheduleType === 'scheduled' ? 'جدولة الإشعار' : 'إرسال وتوزيع الآن'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* المعاينة الحية: 5 أعمدة */}
          <div className="lg:col-span-5 bg-slate-900 text-white p-5 sm:p-6 rounded-3xl shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-black flex items-center gap-1.5 text-emerald-400">
                <Sparkles className="w-4 h-4" />
                <span>معاينة العرض الحية</span>
              </span>
              <span className="text-[10px] text-slate-400">كما تظهر في جوال الصيدلي</span>
            </div>

            {/* معاينة إشعار قفل الشاشة (Push) */}
            <div className="p-3.5 rounded-2xl bg-slate-800/90 border border-slate-700 text-right space-y-2 shadow-inner">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#0f9d7a] flex items-center justify-center text-[8px] text-white font-bold">P</span>
                  <span className="font-bold text-slate-200">linkpharma • إشعار جوال</span>
                </div>
                <span>الآن</span>
              </div>
              <h4 className="text-xs font-black text-white">
                {formTitle || 'عنوان الإشعار يظهر هنا'}
              </h4>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {formMessage || 'نص رسالة الإشعار والتفاصيل ستظهر هنا كما يراها الصيدلي في شريط التنبيهات.'}
              </p>
            </div>

            {/* معاينة النافذة المنبثقة (Modal Preview) */}
            {formChannels.includes('modal') && (
              <div className="p-4 rounded-2xl bg-white text-slate-900 shadow-lg text-right space-y-2 border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-[#0f9d7a] bg-emerald-50 px-2 py-0.5 rounded-full">
                    نافذة منبثقة ترحيبية
                  </span>
                  <span className="text-slate-400 text-xs">✕</span>
                </div>
                {formImageUrl && (
                  <div className="w-full h-24 rounded-lg bg-slate-100 overflow-hidden">
                    <img src={formImageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <h4 className="text-xs font-bold text-slate-900">{formTitle || 'عنوان النافذة'}</h4>
                <p className="text-[11px] text-slate-600 leading-relaxed">{formMessage || 'المحتوى النصي للنافذة المنبثقة'}</p>
                <div className="pt-2 flex justify-end">
                  <span className="px-3 py-1 rounded-lg bg-[#0f9d7a] text-white text-[10px] font-black">
                    الانتقال للرابط
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== التبويب 2: المجدولة والسجل ===================== */}
      {activeTab === 'history' && (
        <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/90 shadow-sm space-y-5">
          {/* شريط البحث والفلترة */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              <input
                type="text"
                placeholder="بحث في الإشعارات..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'sent', label: 'مُرسل' },
                { id: 'scheduled', label: 'مجدول' },
                { id: 'draft', label: 'مسودة' },
                { id: 'cancelled', label: 'ملغى' },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setHistoryFilterStatus(st.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    historyFilterStatus === st.id
                      ? 'bg-[#0f9d7a] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* جدول الإشعارات */}
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50/60">
                  <th className="py-3 px-3">العنوان والرسالة</th>
                  <th className="py-3 px-3">القنوات</th>
                  <th className="py-3 px-3">الجمهور</th>
                  <th className="py-3 px-3">الحالة</th>
                  <th className="py-3 px-3">الإحصائيات</th>
                  <th className="py-3 px-3">التاريخ</th>
                  <th className="py-3 px-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      لا توجد إشعارات مطابقة.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((notif) => {
                    const stats = notif.stats || { recipients: 0, views: 0, clicks: 0, dismissals: 0 };
                    return (
                      <tr key={notif.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3.5 px-3 max-w-xs">
                          <div className="font-black text-slate-900 truncate">{notif.title}</div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">{notif.message}</div>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="flex flex-wrap gap-1">
                            {notif.channels?.map((ch) => (
                              <span key={ch} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                                {ch}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="font-bold text-slate-700">
                            {notif.audience?.type === 'users' ? `${notif.audience.userIds?.length || 0} صيدليات` : notif.audience?.type || 'الكل'}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            notif.status === 'sent'
                              ? 'bg-emerald-100 text-emerald-800'
                              : notif.status === 'scheduled'
                              ? 'bg-indigo-100 text-indigo-800'
                              : notif.status === 'draft'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {notif.status === 'sent' ? 'مُرسل' : notif.status === 'scheduled' ? 'مجدول' : notif.status === 'draft' ? 'مسودة' : 'ملغى'}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-3 text-[11px] text-slate-500">
                            <span title="مشاهدات" className="flex items-center gap-1">
                              <Eye className="w-3.5 h-3.5 text-slate-400" />
                              {stats.views}
                            </span>
                            <span title="نقرات" className="flex items-center gap-1">
                              <MousePointerClick className="w-3.5 h-3.5 text-slate-400" />
                              {stats.clicks}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-slate-400 text-[11px]">
                          {formatGregorianDate(notif.scheduledAt || notif.createdAt)}
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleDuplicate(notif)}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                              title="نسخ"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleEdit(notif)}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                              title="تعديل"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {notif.status === 'scheduled' && (
                              <button
                                onClick={() => handleCancelSchedule(notif)}
                                className="p-1 text-amber-500 hover:text-amber-700 rounded-lg"
                                title="إلغاء الجدولة"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(notif.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-lg"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================== التبويب 3: الإعدادات ===================== */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/90 shadow-sm space-y-6">
            <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-black text-slate-900">
                إعدادات صندوق التحديثات والإشعارات
              </h2>
              <button
                type="button"
                onClick={handleSaveSettings}
                className="px-4 py-2 rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-black transition cursor-pointer"
              >
                حفظ التعديلات
              </button>
            </div>

            {/* إعدادات Ticker */}
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <h4 className="text-xs font-black text-slate-900">تفعيل شريط «آخر الإشعارات» في الصفحة الرئيسية</h4>
                  <p className="text-[11px] text-slate-500">يعرض متحركاً تحت هيدر صفحة أسعار الأدوية للصيادلة</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.ticker.enabled}
                  onChange={(e) => setSettings({
                    ...settings,
                    ticker: { ...settings.ticker, enabled: e.target.checked }
                  })}
                  className="w-5 h-5 rounded text-[#0f9d7a] cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    عدد الإشعارات المعروضة بالدورة
                  </label>
                  <select
                    value={settings.ticker.visibleCount}
                    onChange={(e) => setSettings({
                      ...settings,
                      ticker: { ...settings.ticker, visibleCount: Number(e.target.value) }
                    })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                  >
                    <option value={1}>1 إشعار</option>
                    <option value={2}>2 إشعاران</option>
                    <option value={3}>3 إشعارات (مستحسن)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    سرعة التبديل (بالثواني)
                  </label>
                  <select
                    value={settings.ticker.intervalSeconds}
                    onChange={(e) => setSettings({
                      ...settings,
                      ticker: { ...settings.ticker, intervalSeconds: Number(e.target.value) }
                    })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                  >
                    <option value={3}>3 ثوانٍ</option>
                    <option value={5}>5 ثوانٍ</option>
                    <option value={8}>8 ثوانٍ</option>
                    <option value={10}>10 ثوانٍ</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    نمط العرض (Style)
                  </label>
                  <select
                    value={settings.ticker.style}
                    onChange={(e) => setSettings({
                      ...settings,
                      ticker: { ...settings.ticker, style: e.target.value as any }
                    })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                  >
                    <option value="cards">بطاقات شبكية (Cards)</option>
                    <option value="horizontal">شريط أفقي متصل (Horizontal)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="pauseHover"
                  checked={settings.ticker.pauseOnHover}
                  onChange={(e) => setSettings({
                    ...settings,
                    ticker: { ...settings.ticker, pauseOnHover: e.target.checked }
                  })}
                  className="rounded text-[#0f9d7a]"
                />
                <label htmlFor="pauseHover" className="text-xs font-bold text-slate-700 cursor-pointer">
                  إيقاف التبديل مؤقتاً عند تمرير الماوس أو اللمس (Pause on Hover)
                </label>
              </div>
            </div>

            {/* إعدادات الـ Modal والـ Toast */}
            <div className="pt-4 border-t border-slate-100 space-y-4">
              <h3 className="text-xs font-black text-slate-900">إعدادات النوافذ المنبثقة والـ Toast</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    الحد الأدنى بين نافذتين منبثقتين (دقائق)
                  </label>
                  <input
                    type="number"
                    min={5}
                    value={settings.modal.cooldownMinutes}
                    onChange={(e) => setSettings({
                      ...settings,
                      modal: { ...settings.modal, cooldownMinutes: Number(e.target.value) }
                    })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    الحد الأقصى للنوافذ بالجلسة الواحدة
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={3}
                    value={settings.modal.maxPerSession}
                    onChange={(e) => setSettings({
                      ...settings,
                      modal: { ...settings.modal, maxPerSession: Number(e.target.value) }
                    })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* معاينة فورية للإعدادات */}
          <div className="lg:col-span-4 bg-slate-50 p-5 rounded-3xl border border-slate-200/90 space-y-4">
            <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-[#0f9d7a]" />
              <span>معاينة فورية لتأثير الإعدادات</span>
            </h3>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              هكذا يظهر شريط التحديثات لصيادلة المنصة بالخيارات المحددة:
            </p>
            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>آخر الإشعارات</span>
                <span className="text-[10px] bg-emerald-100 text-[#0f9d7a] px-2 py-0.5 rounded-full font-black">
                  {settings.ticker.visibleCount} ظاهر
                </span>
              </div>
              <div className="p-2 bg-emerald-50/50 rounded-xl text-xs text-slate-700">
                تبديل كل {settings.ticker.intervalSeconds} ثوانٍ • نمط {settings.ticker.style}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== التبويب 4: حالة الاشتراكات ===================== */}
      {activeTab === 'subscribers' && (
        <div className="space-y-5">
          {/* بطاقات الإحصاء */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 bg-white rounded-3xl border border-slate-200/90 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-emerald-600">
                <span className="text-xs font-bold">المشتركون فعلياً في Push</span>
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="text-2xl font-black text-slate-900">{pushSubscribedCount}</div>
              <p className="text-[10px] text-slate-400">يمتلكون توكن نشط ويستقبلون الإشعارات والمتصفح مغلق</p>
            </div>

            <div className="p-5 bg-white rounded-3xl border border-slate-200/90 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-amber-600">
                <span className="text-xs font-bold">يحتاجون إعادة تفعيل</span>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="text-2xl font-black text-slate-900">{pushPendingTokenCount}</div>
              <p className="text-[10px] text-slate-400">منحوا الإذن لكن لم يكتمل تسجيل التوكن مع OneSignal</p>
            </div>

            <div className="p-5 bg-white rounded-3xl border border-slate-200/90 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-slate-600">
                <span className="text-xs font-bold">إجمالي صيدليات المنصة</span>
                <Users className="w-5 h-5" />
              </div>
              <div className="text-2xl font-black text-slate-900">{totalPharmaciesCount}</div>
              <p className="text-[10px] text-slate-400">كافة الصيدليات المسجلة بالمنصة</p>
            </div>
          </div>

          {/* جدول المستخدمين وحالة كل واحد */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">سجل المشتركين ورموز الدفع</h3>
              <button
                type="button"
                onClick={() => {
                  setFormTitle('تفعيل إشعارات الجوال الفورية');
                  setFormMessage('يرجى الضغط على زر التفعيل في قائمة الجرس لاستقبال تنبيهات تحديث الأسعار والطلبيات حتى والتطبيق مغلق.');
                  setFormChannels(['modal', 'inbox']);
                  setActiveTab('create');
                }}
                className="px-3.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition border border-amber-200 cursor-pointer"
              >
                إرسال تنبيه لإعادة التفعيل داخل المنصة
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50/60">
                    <th className="py-3 px-3">الصيدلية / المستخدم</th>
                    <th className="py-3 px-3">البريد والهاتف</th>
                    <th className="py-3 px-3">المدينة</th>
                    <th className="py-3 px-3">حالة Push</th>
                    <th className="py-3 px-3">رمز التوكن</th>
                    <th className="py-3 px-3">آخر تحديث</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usersList.filter((u) => u.role === 'pharmacy').map((u) => (
                    <tr key={u.uid} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-3 font-bold text-slate-900">
                        {u.pharmacyName || u.name}
                      </td>
                      <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                        <div>{u.email}</div>
                        <div>{u.phone || '-'}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-600">{u.city || u.address || '-'}</td>
                      <td className="py-3 px-3">
                        {u.pushEnabled && u.pushToken ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                            مُشترك ونشط ✅
                          </span>
                        ) : u.pushEnabled ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">
                            يحتاج إعادة تفعيل ⚠️
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                            غير مفعل
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-[10px] text-slate-400 dir-ltr text-right">
                        {u.pushToken || 'بدون رمز'}
                      </td>
                      <td className="py-3 px-3 text-slate-400 text-[10px]">
                        {u.pushUpdatedAt ? formatGregorianDate(u.pushUpdatedAt) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
