import React, { useEffect, useState } from 'react';
import { Beaker, Plus, Pencil, Trash2, Save, X, Search } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';
import { getDosageForms, saveDosageForm, deleteDosageForm } from '../../services/dataStorage';
import type { DosageForm } from '../../types';

export const DosageForms: React.FC = () => {
  const [items, setItems] = useState<DosageForm[]>([]);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { success, error } = useToastStore();

  const load = async () => {
    setLoading(true);
    try {
      let rows = await getDosageForms();
      if (rows.length === 0) {
        const defaults = ['Tablet','Capsule','Syrup','Oral Suspension','Injection','Ointment','Cream','Oral Drops','Eye Drops','Effervescent Tablet','Spray','Gel','Suppository'];
        for (const name of defaults) await saveDosageForm({ name });
        rows = await getDosageForms();
      }
      setItems(rows);
    }
    catch (e) { error(e instanceof Error ? e.message : 'Could not load dosage forms.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const reset = () => { setName(''); setEditingId(null); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) return error('Enter the dosage form name in English.');
    if (!/^[A-Za-z0-9 ()/.,+-]+$/.test(value)) return error('Use English letters and standard symbols only.');
    if (items.some((item) => item.name.toLowerCase() === value.toLowerCase() && item.id !== editingId)) return error('This dosage form already exists.');
    setSaving(true);
    try {
      const saved = await saveDosageForm({ id: editingId || undefined, name: value });
      setItems((old) => editingId ? old.map((item) => item.id === saved.id ? saved : item) : [saved, ...old]);
      reset(); success('Dosage form saved.');
    } catch (e) { error(e instanceof Error ? e.message : 'Could not save dosage form.'); }
    finally { setSaving(false); }
  };
  const remove = async (item: DosageForm) => {
    if (!window.confirm('Delete ' + item.name + '? Existing products will not be deleted.')) return;
    try { await deleteDosageForm(item.id); setItems((old) => old.filter((row) => row.id !== item.id)); success('Dosage form deleted.'); }
    catch (e) { error(e instanceof Error ? e.message : 'Could not delete dosage form.'); }
  };
  const filtered = items.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()));

  return <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6" dir="ltr">
    <header className="flex items-center gap-3">
      <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><Beaker className="h-6 w-6"/></div>
      <div><h1 className="text-2xl font-black text-slate-900">Dosage Forms</h1><p className="mt-1 text-sm text-slate-500">Manage the English names used across the catalog.</p></div>
    </header>
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="mb-2 block text-sm font-bold text-slate-700">Dosage form name (English)</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tablet, Oral Solution, Injection" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500" required/>
        <button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4"/>{saving ? 'Saving…' : editingId ? 'Update form' : <><Plus className="h-4 w-4"/>Add form</>}</button>
        {editingId && <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold text-slate-600"><X className="h-4 w-4"/>Cancel</button>}
      </div>
    </form>
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><h2 className="font-extrabold text-slate-800">Available forms <span className="ml-1 text-xs text-slate-400">({filtered.length})</span></h2><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search forms…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm sm:w-64"/></div></div>
      {loading ? <p className="p-8 text-center text-sm text-slate-500">Loading…</p> : filtered.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No dosage forms found.</p> : <div className="divide-y divide-slate-100">{filtered.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3"><span className="font-semibold text-slate-800">{item.name}</span><div className="flex gap-2"><button onClick={() => { setEditingId(item.id); setName(item.name); }} aria-label={'Edit ' + item.name} className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"><Pencil className="h-4 w-4"/></button><button onClick={() => void remove(item)} aria-label={'Delete ' + item.name} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4"/></button></div></div>)}</div>}
    </div>
  </div>;
};
