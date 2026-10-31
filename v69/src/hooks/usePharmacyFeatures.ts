// src/hooks/usePharmacyFeatures.ts
import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { getSystemSettings } from '../services/dataStorage';
import { DEFAULT_FEATURES, resolveAllFeatures } from '../utils/pharmacyFeatures';
import type { SystemSettings } from '../types';

export function usePharmacyFeatures() {
  const user = useAuthStore((state) => state.user);
  const [settings, setSettings] = useState<Pick<SystemSettings, 'pharmacyFeatureDefaults'> | null>(null);

  useEffect(() => {
    let active = true;
    void getSystemSettings().then((value) => { if (active) setSettings(value); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  return useMemo(() => (settings || user ? resolveAllFeatures(user, settings) : DEFAULT_FEATURES), [user, settings]);
}
