import React from 'react';
import { CheckCircle2, CircleAlert, Info, XCircle } from 'lucide-react';

export const designTokens = {
  brand: '#0f9d7a',
  ink: '#0f172a',
  review: '#d97706',
  danger: '#e11d48',
  surface: 'rounded-2xl border border-slate-200 bg-white shadow-sm',
  control: 'rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-[#0f9d7a] focus:ring-2 focus:ring-emerald-100',
};

export const SectionHeading: React.FC<{ eyebrow?: string; title: string; description?: string; icon?: React.ReactNode; action?: React.ReactNode }> = ({ eyebrow, title, description, icon, action }) => (
  <header className="flex flex-wrap items-start justify-between gap-3">
    <div>{eyebrow && <p className="text-[11px] font-black uppercase tracking-wide text-[#0f9d7a]">{eyebrow}</p>}<h1 className="mt-1 flex items-center gap-2 text-xl font-black text-slate-900 sm:text-2xl">{icon}{title}</h1>{description && <p className="mt-1 max-w-2xl text-xs leading-6 text-slate-500">{description}</p>}</div>{action}
  </header>
);

export const MetricCard: React.FC<{ label: string; value: string | number; hint?: string; tone?: 'brand' | 'review' | 'danger' | 'neutral' }> = ({ label, value, hint, tone = 'neutral' }) => {
  const colors = { brand: 'text-emerald-700 bg-emerald-50', review: 'text-amber-700 bg-amber-50', danger: 'text-rose-700 bg-rose-50', neutral: 'text-slate-700 bg-slate-50' };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[11px] font-bold text-slate-500">{label}</p><strong className={`mt-2 block w-fit rounded-xl px-2.5 py-1 text-2xl font-black ${colors[tone]}`}>{value}</strong>{hint && <p className="mt-2 text-[10px] text-slate-500">{hint}</p>}</div>;
};

export const StatusPill: React.FC<{ status: 'safe' | 'review' | 'danger' | 'info'; children: React.ReactNode }> = ({ status, children }) => {
  const config = { safe: ['bg-emerald-100 text-emerald-800', CheckCircle2], review: ['bg-amber-100 text-amber-800', CircleAlert], danger: ['bg-rose-100 text-rose-800', XCircle], info: ['bg-sky-100 text-sky-800', Info] } as const;
  const [classes, Icon] = config[status];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black ${classes}`}><Icon className="h-3.5 w-3.5" />{children}</span>;
};

export const ActionButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'brand' | 'neutral' | 'danger' }> = ({ tone = 'brand', className = '', children, ...props }) => {
  const toneClass = tone === 'brand' ? 'bg-[#0f9d7a] text-white hover:bg-[#0b7a5e]' : tone === 'danger' ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50';
  return <button {...props} className={`rounded-xl px-4 py-2.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClass} ${className}`}>{children}</button>;
};
