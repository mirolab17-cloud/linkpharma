// src/components/NotificationBell.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { 
  subscribeToNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead, 
  deleteNotification 
} from '../services/dataStorage';
import { AppNotification } from '../types';
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
  ExternalLink
} from 'lucide-react';
import { useToastStore } from '../store/useToastStore';

// صوت تنبيه خفيف عبر Web Audio API عند وصول إشعار جديد
function playChime() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    // Ignore audio autoplay restrictions
  }
}

export const NotificationBell: React.FC = () => {
  const { user } = useAuthStore();
  const { info } = useToastStore();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef<number>(-1);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToNotifications(user.uid, (list) => {
      // إذا وصل إشعار جديد أثناء وجود المستخدم في الصفحة
      const unreadCount = list.filter((n) => !n.read).length;
      if (prevCountRef.current !== -1 && unreadCount > prevCountRef.current) {
        const newest = list[0];
        if (newest && !newest.read) {
          playChime();
          info(newest.message, newest.title);
        }
      }
      prevCountRef.current = unreadCount;
      setNotifications(list);
    });

    return () => unsubscribe();
  }, [user, info]);

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

  const unreadCount = notifications.filter((n) => !n.read).length;

  const displayedList = activeTab === 'unread' 
    ? notifications.filter((n) => !n.read) 
    : notifications;

  const handleMarkAll = async () => {
    if (!user) return;
    await markAllNotificationsAsRead(user.uid);
  };

  const handleItemClick = async (notif: AppNotification) => {
    if (!notif.read) {
      await markNotificationAsRead(notif.id);
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
      return new Date(isoString).toLocaleDateString('ar-SA');
    } catch {
      return '';
    }
  };

  const getNotificationIcon = (type: string, metadata?: any) => {
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
    <div className="relative" ref={dropdownRef}>
      {/* زر الجرس مع شارة الإشعارات */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition focus:outline-hidden"
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
                  className="text-[11px] text-[#0f9d7a] hover:text-[#0b7a5e] font-bold flex items-center gap-1 transition"
                  title="تحديد الكل كمقروء"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>تحديد كمقروء</span>
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* تبويبات الفلترة */}
          <div className="flex items-center border-b border-slate-100 px-3 bg-white">
            <button
              onClick={() => setActiveTab('all')}
              className={`py-2 px-3 text-xs font-bold border-b-2 transition ${
                activeTab === 'all'
                  ? 'border-[#0f9d7a] text-[#0f9d7a]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              الكل ({notifications.length})
            </button>
            <button
              onClick={() => setActiveTab('unread')}
              className={`py-2 px-3 text-xs font-bold border-b-2 transition ${
                activeTab === 'unread'
                  ? 'border-[#0f9d7a] text-[#0f9d7a]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              غير المقروءة ({unreadCount})
            </button>
          </div>

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
                    notif.type === 'status_change'
                      ? 'bg-emerald-100/70'
                      : notif.type === 'admin_announcement'
                      ? 'bg-teal-100/70'
                      : 'bg-slate-100'
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
                        {notif.type === 'status_change'
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
                          className="text-slate-300 hover:text-rose-600 p-1 rounded-md transition"
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
