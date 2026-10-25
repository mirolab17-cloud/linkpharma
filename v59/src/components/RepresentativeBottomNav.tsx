import React from 'react';
import { BarChart3, Boxes, ClipboardList, FileClock, UserRound } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

const items = [
  { label: 'المساحة', icon: BarChart3, path: '/app/representative' },
  { label: 'الطلبات', icon: ClipboardList, path: '/app/representative?tab=orders' },
  { label: 'الأصناف', icon: Boxes, path: '/app/representative?tab=catalog' },
  { label: 'السجل', icon: FileClock, path: '/app/representative?tab=history' },
  { label: 'ملفي', icon: UserRound, path: '/app/profile' },
];

export const RepresentativeBottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const active = (path: string) => location.pathname === '/app/profile' ? path === '/app/profile' : location.pathname === '/app/representative' && (new URLSearchParams(location.search).get('tab') || '') === (new URLSearchParams(path.split('?')[1] || '').get('tab') || '');
  return <nav dir="rtl" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur md:hidden"><div className="mx-auto flex max-w-lg items-center justify-around gap-1">{items.map(({ label, icon: Icon, path }) => <button key={path} onClick={() => navigate(path)} className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-black transition ${active(path) ? 'bg-emerald-50 text-[#0f9d7a]' : 'text-slate-500'}`}><Icon className="h-5 w-5" /><span className="truncate">{label}</span></button>)}</div></nav>;
};
