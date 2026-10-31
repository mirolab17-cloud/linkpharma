import React, { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Download, ExternalLink, Share2 } from 'lucide-react';
import { useToastStore } from '../store/useToastStore';

const PLATFORM_URL = 'https://mirolab17-cloud.github.io/linkpharma/v68/';
const SHARE_TITLE = 'LinkPharma';
const SHARE_TEXT = 'اكتشف LinkPharma، المنصة الذكية لمتابعة وإدارة أسعار الأصناف الدوائية.';

export const PlatformShareCard: React.FC = () => {
  const qrContainer = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const { success, error } = useToastStore();

  const copyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(PLATFORM_URL);
      } else {
        const input = document.createElement('textarea');
        input.value = PLATFORM_URL;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const copiedSuccessfully = document.execCommand('copy');
        input.remove();
        if (!copiedSuccessfully) throw new Error('copy-failed');
      }
      setCopied(true);
      success('تم نسخ رابط LinkPharma.');
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      error('تعذر نسخ الرابط تلقائياً. يمكنك تحديده ونسخه يدوياً.');
    }
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: PLATFORM_URL });
      } catch (exception) {
        if ((exception as DOMException)?.name !== 'AbortError') error('تعذرت مشاركة الرابط من هذا الجهاز.');
      }
      return;
    }
    await copyLink();
  };

  const downloadQr = () => {
    const svg = qrContainer.current?.querySelector('svg');
    if (!svg) return error('تعذر تجهيز رمز QR للتنزيل.');
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.setAttribute('width', '320');
    copy.setAttribute('height', '320');
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'LinkPharma-v68-QR.svg';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    success('تم تنزيل رمز QR بصيغة SVG.');
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm" dir="rtl">
      <div className="bg-gradient-to-l from-emerald-700 to-teal-600 p-4 text-white sm:p-5">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15"><Share2 className="h-5 w-5" /></span><div><h2 className="text-sm font-black">شارك LinkPharma</h2><p className="mt-1 text-xs text-emerald-50">أرسل الرابط أو امسح رمز QR لفتح المنصة.</p></div></div>
      </div>
      <div className="grid gap-5 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-600">رابط المنصة</p>
          <a href={PLATFORM_URL} target="_blank" rel="noopener noreferrer" dir="ltr" className="mt-2 block break-all rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-xs font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2">{PLATFORM_URL}</a>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyLink()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white transition hover:bg-emerald-800">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'تم النسخ' : 'نسخ الرابط'}</button>
            <button type="button" onClick={() => void shareLink()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-black text-emerald-800 transition hover:bg-emerald-100"><Share2 className="h-4 w-4" />مشاركة</button>
            <a href={PLATFORM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"><ExternalLink className="h-4 w-4" />فتح المنصة</a>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">زر المشاركة يفتح خيارات المشاركة في الهاتف، مثل واتساب والرسائل. إذا لم يدعمها المتصفح، سينسخ الرابط تلقائياً.</p>
        </div>
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <div ref={qrContainer} className="rounded-xl bg-white p-2" aria-label="رمز QR لرابط منصة LinkPharma"><QRCodeSVG value={PLATFORM_URL} size={144} level="H" marginSize={2} title="افتح LinkPharma" /></div>
          <p className="text-[11px] font-bold text-slate-600">رمز QR للرابط</p>
          <button type="button" onClick={downloadQr} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-100"><Download className="h-3.5 w-3.5" />تنزيل الرمز</button>
        </div>
      </div>
    </section>
  );
};
