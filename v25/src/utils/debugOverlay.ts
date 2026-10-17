// لوحة تشخيص تظهر فقط عند فتح الموقع بالرابط ?debug=1 (مفيدة لفحص مشاكل الهاتف)
export function installDebugOverlay() {
  try {
    if (!/[?&]debug=1/.test(window.location.search)) return;

    const box = document.createElement('div');
    box.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;max-height:45vh;overflow:auto;z-index:2147483647;' +
      'background:rgba(0,0,0,.88);color:#9fe;font:11px/1.45 monospace;padding:6px;direction:ltr;white-space:pre-wrap;word-break:break-all';
    const line = (level: string, args: unknown[]) => {
      const text = args
        .map((a) => {
          if (a instanceof Error) return `${a.name}: ${a.message}`;
          if (typeof a === 'object' && a !== null) {
            const any = a as any;
            if (any.code || any.message) return `${any.code || ''} ${any.message || ''}`;
            try { return JSON.stringify(a).slice(0, 300); } catch { return String(a); }
          }
          return String(a);
        })
        .join(' ');
      const row = document.createElement('div');
      row.style.color = level === 'error' ? '#f88' : level === 'warn' ? '#fd8' : '#9fe';
      row.textContent = `${new Date().toLocaleTimeString()} [${level}] ${text}`;
      box.appendChild(row);
      box.scrollTop = box.scrollHeight;
    };

    (['log', 'info', 'warn', 'error'] as const).forEach((level) => {
      const orig = console[level].bind(console);
      console[level] = (...args: unknown[]) => { line(level, args); orig(...args); };
    });
    window.addEventListener('error', (e) => line('error', ['window.onerror', e.message]));
    window.addEventListener('unhandledrejection', (e) => line('error', ['unhandledrejection', e.reason]));

    const attach = () => document.body.appendChild(box);
    if (document.body) attach(); else window.addEventListener('DOMContentLoaded', attach);
    console.info('[debug] overlay on | ua=' + navigator.userAgent);
  } catch { /* ignore */ }
}
