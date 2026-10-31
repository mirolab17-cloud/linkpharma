import { useEffect, useRef } from 'react';
import { subscribeToCollection } from '../services/dataStorage';

export type LiveCollectionName = 'products' | 'suppliers' | 'activeIngredients' | 'dosageForms';

/** يستدعي onChange (بعد تأخير قصير) كلما تغيّرت إحدى المجموعات، من هذه الصفحة أو من صفحة/مستخدم آخر. */
export function useLiveCollections(names: LiveCollectionName[], onChange: () => void, delayMs = 350): void {
  const handler = useRef(onChange);
  handler.current = onChange;
  const key = names.join(',');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => handler.current(), delayMs);
    };
    const unsubs = key.split(',').filter(Boolean).map((name) => subscribeToCollection(name, fire));
    return () => { if (timer) clearTimeout(timer); unsubs.forEach((u) => u()); };
  }, [key, delayMs]);
}
