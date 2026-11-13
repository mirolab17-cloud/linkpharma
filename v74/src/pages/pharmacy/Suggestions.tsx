import React, { useEffect, useState } from 'react';
import { Lightbulb, Send, Lock, Clock3, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useToastStore } from '../../store/useToastStore';
import { createSuggestion, getSuggestions } from '../../services/v18Features';
import { PharmacySuggestion } from '../../types';
import { formatGregorianDate } from '../../utils/formatDate';

export const Suggestions: React.FC = () => {
  const { user } = useAuthStore();
  const { success, error } = useToastStore();
  const [items, setItems] = useState<PharmacySuggestion[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { if (user) getSuggestions(user.uid).then(setItems); }, [user]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || subject.trim().length < 3 || message.trim().length < 8) {
      error('اكتب عنواناً واضحاً وتفاصيل لا تقل عن 8 أحرف.');
      return;
    }
    setSending(true);
    try {
      const created = await createSuggestion({ pharmacyId: user.uid, pharmacyName: user.pharmacyName || user.name, subject: subject.trim(), message: message.trim() });
      setItems((previous) => [created, ...previous]);
      setSubject(''); setMessage('');
      success('تم إرسال اقتراحك للإدارة. لا يمكن تعديل الاقتراح بعد الإرسال حفاظاً على السجل.');
    } catch { error('تعذر إرسال الاقتراح حالياً. حاول مرة أخرى.'); }
    finally { setSending(false); }
  };

  return <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28" dir="rtl">
    <div className="mb-6"><h1 className="text-2xl font-black text-slate-900 flex items-center gap-2"><Lightbulb className="w-6 h-6 text-amber-500" />اقتراحات وتحسينات</h1><p className="text-xs text-slate-500 mt-1">شارك فكرة عملية لتطوير فارما لينك. الاقتراح بعد الإرسال يصبح سجلاً ثابتاً.</p></div>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between"><h2 className="font-black text-slate-900">اقتراح جديد</h2><span className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" />ثابت بعد الإرسال</span></div>
        <label className="block text-xs font-bold text-slate-600">عنوان الاقتراح<input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-emerald-500" placeholder="مثال: إضافة فلتر لأيام التوصيل" /></label>
        <label className="block text-xs font-bold text-slate-600">التفاصيل<textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1500} rows={7} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-emerald-500 resize-none" placeholder="اشرح المشكلة أو الفائدة المتوقعة والخطوات المقترحة..." /></label>
        <button disabled={sending} className="w-full rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] disabled:opacity-50 text-white py-3 text-xs font-black flex items-center justify-center gap-2"><Send className="w-4 h-4" />{sending ? 'جاري الإرسال...' : 'إرسال الاقتراح'}</button>
      </form>
      <section className="space-y-3"><h2 className="font-black text-slate-900">اقتراحاتي السابقة ({items.length})</h2>{items.length === 0 ? <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-8 text-center text-sm text-slate-500">لا توجد اقتراحات سابقة.</div> : items.map((item) => <article key={item.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs"><div className="flex justify-between gap-3"><h3 className="font-black text-sm text-slate-900">{item.subject}</h3><span className={`text-[10px] px-2 py-1 rounded-lg font-bold ${item.status === 'resolved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.status === 'new' ? 'جديد' : item.status === 'reviewed' ? 'قيد المراجعة' : item.status === 'resolved' ? 'تمت المعالجة' : 'مغلق'}</span></div><p className="text-xs text-slate-600 leading-6 mt-2 whitespace-pre-wrap">{item.message}</p><div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-400 flex items-center gap-1"><Clock3 className="w-3 h-3" />{formatGregorianDate(item.createdAt, { includeTime: true })}{item.adminReply && <span className="mr-auto text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />رد الإدارة: {item.adminReply}</span>}</div></article>)}</section>
    </div>
  </div>;
};
