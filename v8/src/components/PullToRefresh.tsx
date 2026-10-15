// src/components/PullToRefresh.tsx
import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const THRESHOLD = 70; // المسافة (px) اللازمة لتفعيل التحديث
const MAX_PULL = 100;

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
}

/**
 * السحب للتحديث على الجوال: اسحب الصفحة للأسفل وهي في أعلاها لإعادة تحميل البيانات.
 * يعمل بأحداث اللمس فقط، فلا يؤثر على سطح المكتب.
 */
export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    const atTop = () => (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;

    const onTouchStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1 || !atTop()) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null || busy.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || !atTop()) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const distance = Math.min(dy * 0.5, MAX_PULL);
      pullRef.current = distance;
      setPull(distance);
    };

    const onTouchEnd = async () => {
      if (startY.current === null) return;
      startY.current = null;
      const reached = pullRef.current >= THRESHOLD;
      pullRef.current = 0;
      if (!reached || busy.current) {
        setPull(0);
        return;
      }
      busy.current = true;
      setRefreshing(true);
      setPull(THRESHOLD * 0.6);
      try {
        await onRefresh();
      } finally {
        busy.current = false;
        setRefreshing(false);
        setPull(0);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [onRefresh]);

  const visible = pull > 4 || refreshing;
  const ready = pull >= THRESHOLD;

  return (
    <>
      <div
        className="fixed left-1/2 top-16 z-50 -translate-x-1/2 pointer-events-none md:hidden"
        style={{
          transform: `translate(-50%, ${Math.max(pull - 24, 0)}px)`,
          opacity: visible ? 1 : 0,
          transition: refreshing || pull === 0 ? 'transform 0.2s, opacity 0.2s' : 'none',
        }}
        aria-hidden={!visible}
      >
        <div
          className={`w-10 h-10 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center ${
            ready || refreshing ? 'text-[#0f9d7a]' : 'text-slate-400'
          }`}
        >
          <RefreshCw
            className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
            style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
          />
        </div>
      </div>
      {children}
    </>
  );
};
