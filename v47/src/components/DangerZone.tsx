// src/components/DangerZone.tsx — v47: أدوات خطرة (بيانات تجريبية / مسح كل البيانات) بعيداً عن الرئيسية
import React, { useState } from 'react';
import { AlertTriangle, Sparkles, Trash2 } from 'lucide-react';
import { clearDatabase, seedDatabase } from '../services/dataStorage';
import { useToastStore } from '../store/useToastStore';
import { ConfirmDialog } from './ConfirmDialog';

export const DangerZone: React.FC = () => {
  const { success, error } = useToastStore();
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [typed, setTyped] = useState('');

  const seed = async () => {
    setBusy(true);
    try { await seedDatabase(); success('تمت إضافة البيانات التجريبية (10 مواد فعالة، 30 صنفاً، 3 موردين، وأسعار).'); }
    catch (e: any) { error('فشل إدخال البيانات التجريبية: ' + (e?.message || '')); }
    finally { setBusy(false); }
  };
  const clear = async () => {
    setBusy(true);
    try { await clearDatabase(); success('تم مسح البيانات.'); setConfirmClear(false); setTyped(''); }
    catch (e: any) { error('فشل المسح: ' + (e?.message || '')); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-3xl border border-rose-200 bg-rose-50/60 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-black text-rose-800"><AlertTriangle className="h-5 w-5" />منطقة خطرة</h2>
      <p className="mt-1 text-xs leading-6 text-rose-900/80">هذه الأدوات للتجربة فقط. مسح البيانات يفرّغ قاعدة البيانات ولا يمكن التراجع عنه، فخذ نسخة احتياطية قبل أي خطوة.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void seed()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3.5 py-2 text-xs font-black text-[#0f9d7a] disabled:opacity-50"><Sparkles className="h-4 w-4" />إضافة بيانات تجريبية</button>
        <button type="button" onClick={() => setConfirmClear(true)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-black text-rose-700 disabled:opacity-50"><Trash2 className="h-4 w-4" />مسح كل البيانات</button>
      </div>
      <ConfirmDialog
        isOpen={confirmClear}
        onClose={() => { setConfirmClear(false); setTyped(''); }}
        onConfirm={() => { if (typed.trim() === 'مسح') void clear(); }}
        title="مسح كل البيانات"
        message={typed.trim() === 'مسح' ? 'سيتم تفريغ قاعدة البيانات بالكامل. هل أنت متأكد؟' : 'للتأكيد اكتب كلمة «مسح» في الحقل أدناه ثم اضغط تأكيد.'}
        confirmText="نعم، مسح الكل"
        isDestructive
        loading={busy}
      />
      {confirmClear && (
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="اكتب: مسح" className="fixed bottom-24 left-1/2 z-[100] w-64 -translate-x-1/2 rounded-xl border border-rose-300 bg-white p-3 text-center text-sm shadow-xl" autoFocus />
      )}
    </div>
  );
};
