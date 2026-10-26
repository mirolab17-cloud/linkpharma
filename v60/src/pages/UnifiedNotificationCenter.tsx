import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, ExternalLink, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { deleteNotification, getNotifications, markAllNotificationsAsRead, markNotificationAsRead } from '../services/dataStorage';
import { AppNotification } from '../types';
import { SectionHeading, StatusPill } from '../components/designSystem';

export const UnifiedNotificationCenter: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const load = async () => { if (user) setItems(await getNotifications(user.uid, user.createdAt)); };
  useEffect(() => { void load(); }, [user?.uid, user?.createdAt]);
  const displayed = useMemo(() => filter === 'unread' ? items.filter((item) => !item.read) : items, [filter, items]);
  const markAll = async () => { if (!user) return; await markAllNotificationsAsRead(user.uid); await load(); };
  const open = async (item: AppNotification) => { if (!item.read) await markNotificationAsRead(item.id, user?.uid); if (item.metadata?.actionUrl) navigate(item.metadata.actionUrl); else if (item.type === 'order_update') navigate('/app/cart'); else if (item.type === 'price_alert') navigate('/app/prices'); await load(); };
  return <div className="mx-auto max-w-3xl space-y-5 pb-20" dir="rtl"><SectionHeading eyebrow="مركز التنبيهات" title="الإشعارات والتنبيهات" description="كل تحديثات الأسعار والطلبات والتعميمات في مكان واحد، مع روابط مباشرة للإجراء المطلوب." icon={<Bell className="h-6 w-6 text-[#0f9d7a]" />} action={items.some((item) => !item.read) ? <button onClick={() => void markAll()} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800"><CheckCheck className="ml-1 inline h-4 w-4" />تحديد الكل كمقروء</button> : null} /><div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"><button onClick={() => setFilter('all')} className={`flex-1 rounded-xl px-3 py-2 text-xs font-black ${filter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>الكل ({items.length})</button><button onClick={() => setFilter('unread')} className={`flex-1 rounded-xl px-3 py-2 text-xs font-black ${filter === 'unread' ? 'bg-[#0f9d7a] text-white' : 'text-slate-500'}`}>غير المقروءة ({items.filter((item) => !item.read).length})</button></div><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{displayed.length === 0 ? <div className="p-12 text-center text-sm text-slate-500"><Bell className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 font-black">لا توجد إشعارات في هذا العرض</p></div> : displayed.map((item) => <article key={item.id} className={`flex items-start gap-3 border-b border-slate-100 p-4 last:border-0 ${item.read ? '' : 'bg-emerald-50/40'}`}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Bell className="h-4 w-4" /></div><button onClick={() => void open(item)} className="min-w-0 flex-1 text-right"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-black text-slate-900">{item.title}</h2>{!item.read && <StatusPill status="safe">جديد</StatusPill>}</div><p className="mt-1 text-xs leading-6 text-slate-600">{item.message}</p><span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-[#0f9d7a]">فتح الإجراء <ExternalLink className="h-3 w-3" /></span></button><button onClick={() => void deleteNotification(item.id).then(load)} className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-600" title="حذف الإشعار"><Trash2 className="h-4 w-4" /></button></article>)}</section></div>;
};
