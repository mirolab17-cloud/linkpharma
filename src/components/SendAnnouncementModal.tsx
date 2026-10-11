// src/components/SendAnnouncementModal.tsx
import React, { useState } from 'react';
import { Modal } from './Modal';
import { createNotification, getUsers } from '../services/dataStorage';
import { UserProfile } from '../types';
import { useToastStore } from '../store/useToastStore';
import { Megaphone, Send, Sparkles, Users, User, BellRing } from 'lucide-react';

interface SendAnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRecipientId?: string; // UID of pharmacy if opened from specific row
  pharmacies?: UserProfile[];
}

export const SendAnnouncementModal: React.FC<SendAnnouncementModalProps> = ({
  isOpen,
  onClose,
  defaultRecipientId = 'all',
  pharmacies = [],
}) => {
  const { success, error } = useToastStore();
  const [recipient, setRecipient] = useState<string>(defaultRecipientId);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [sending, setSending] = useState(false);

  // تحديث المستلم الافتراضي إذا تغير
  React.useEffect(() => {
    setRecipient(defaultRecipientId);
  }, [defaultRecipientId]);

  const QUICK_TEMPLATES = [
    {
      title: 'تحديث لوائح أسعار المستودعات اليوم',
      message: 'تم تحديث عروض الأسعار والكميات المتوفرة لدى مستودعات الأدوية الشريكة. نوصيكم بمقارنة الأسعار واختيار العروض الأنسب لصيدليتكم.',
      priority: 'high' as const,
    },
    {
      title: 'عروض وتخفيضات حصرية على أصناف مميزة',
      message: 'تتوفر الآن خصومات إضافية على مجموعة من الأدوية الأساسية والمضادات الحيوية. تفضلوا بالاطلاع على مقارنة الأسعار للاستفادة من العروض.',
      priority: 'normal' as const,
    },
    {
      title: 'تنبيه إداري بخصوص مواعيد استلام وتوصيل الطلبيات',
      message: 'نحيطكم علماً بأن مواعيد شحن وتوصيل الطلبيات تبدأ من الساعة 8 صباحاً وحتى 5 مساءً. يرجى تأكيد الطلبيات عبر واتساب فور اعتمادها في المنصة.',
      priority: 'normal' as const,
    },
    {
      title: 'إشعار هام: مراجعة واستكمال بيانات الصيدلية',
      message: 'يرجى التأكد من صحة رقم الجوال وعنوان الصيدلية المسجل في ملفكم لتسهيل عملية التوصيل من قبل المستودعات.',
      priority: 'urgent' as const,
    },
  ];

  const handleApplyTemplate = (tmpl: typeof QUICK_TEMPLATES[0]) => {
    setTitle(tmpl.title);
    setMessage(tmpl.message);
    setPriority(tmpl.priority);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      error('يرجى كتابة عنوان ونص التحديث للإرسال.');
      return;
    }

    setSending(true);
    try {
      await createNotification({
        userId: recipient,
        title: title.trim(),
        message: message.trim(),
        type: 'admin_announcement',
        metadata: {
          senderName: 'إدارة المنصة',
          priority,
        },
      });

      const recipientLabel = recipient === 'all' 
        ? 'جميع الصيدليات المشتركة' 
        : (pharmacies.find((p) => p.uid === recipient)?.pharmacyName || 'الصيدلية المحددة');

      success(`تم إرسال التنبيه الفوري بنجاح إلى: ${recipientLabel}`);
      setTitle('');
      setMessage('');
      onClose();
    } catch (err: any) {
      error('حدث خطأ أثناء إرسال التحديث: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="إرسال تعميم / تحديث إداري للصيدليات"
      maxWidth="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !title.trim() || !message.trim()}
            className="px-5 py-2 text-xs font-bold text-white bg-[#0f9d7a] hover:bg-[#0b7a5e] disabled:opacity-50 rounded-xl transition flex items-center gap-1.5 shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{sending ? 'جاري الإرسال...' : 'إرسال التنبيه الآن'}</span>
          </button>
        </>
      }
    >
      <form onSubmit={handleSend} className="space-y-4 text-right">
        {/* اختيار المستلم */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
            <span>المرسل إليه</span>
            <span className="text-[11px] text-slate-400 font-normal">
              {recipient === 'all' ? 'يصل فورياً لكافة الصيدليات' : 'إشعار مخصص لصيدلية محددة'}
            </span>
          </label>
          <select
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-hidden focus:border-[#0f9d7a]"
          >
            <option value="all">📢 جميع الصيدليات المشتركة (تعميم عام)</option>
            {pharmacies
              .filter((p) => p.role === 'pharmacy')
              .map((p) => (
                <option key={p.uid} value={p.uid}>
                  🏥 {p.pharmacyName || p.name} ({p.phone ? `+${p.phone}` : p.email})
                </option>
              ))}
          </select>
        </div>

        {/* قوالب جاهزة سريعة */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-[#0f9d7a]" />
            <span>قوالب رسائل سريعة (اضغط للتعبئة):</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {QUICK_TEMPLATES.map((tmpl, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyTemplate(tmpl)}
                className="p-2.5 rounded-xl border border-slate-200 hover:border-[#0f9d7a] hover:bg-emerald-50/50 text-right transition group"
              >
                <div className="text-xs font-bold text-slate-800 group-hover:text-[#0f9d7a] line-clamp-1">
                  {tmpl.title}
                </div>
                <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                  {tmpl.message}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* عنوان الإشعار */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            عنوان التحديث أو التنبيه <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثال: تحديث أسعار مستودعات الأدوية اليوم..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-[#0f9d7a]"
            required
          />
        </div>

        {/* محتوى الرسالة */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            نص التنبيه والملاحظات <span className="text-rose-500">*</span>
          </label>
          <textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="اكتب التوجيهات أو التحديثات الهامة التي ترغب بإيصالها لأصحاب الصيدليات..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-hidden focus:border-[#0f9d7a] leading-relaxed"
            required
          />
        </div>

        {/* الأهمية */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            مستوى الأهمية
          </label>
          <div className="flex items-center gap-3">
            {[
              { id: 'normal', label: 'عادي', color: 'text-slate-700' },
              { id: 'high', label: 'تحديث هام', color: 'text-amber-700' },
              { id: 'urgent', label: 'عاجل جداً', color: 'text-rose-700' },
            ].map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700"
              >
                <input
                  type="radio"
                  name="priority"
                  value={p.id}
                  checked={priority === p.id}
                  onChange={() => setPriority(p.id as any)}
                  className="accent-[#0f9d7a]"
                />
                <span className={p.color}>{p.label}</span>
              </label>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
};
