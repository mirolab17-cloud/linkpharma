export const DEFAULT_GAZA_LOCATIONS: Record<string, string[]> = {
  'شمال غزة': ['جباليا', 'بيت لاهيا', 'بيت حانون', 'أم النصر'],
  'غزة': ['مدينة غزة', 'الشجاعية', 'الزيتون', 'الرمال', 'التفاح'],
  'دير البلح': ['دير البلح', 'النصيرات', 'البريج', 'المغازي', 'الزوايدة'],
  'خانيونس': ['خانيونس', 'بني سهيلا', 'عبسان الكبيرة', 'عبسان الجديدة', 'القرارة'],
  'رفح': ['رفح', 'الشوكة', 'النصر', 'خربة العدس'],
};
export function getGazaLocations(custom?: Record<string, string[]>): Record<string, string[]> {
  return custom && Object.keys(custom).length > 0 ? custom : DEFAULT_GAZA_LOCATIONS;
}


export interface LocationCatalogGovernorate {
  id: string;
  name: string;
  cities: Array<{ id: string; name: string; streets: Array<{ id: string; name: string }> }>; // streets retained only for legacy reads
}

export function createLocationId(prefix: string, name = ''): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replaceAll('-', '').slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const safeName = name.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 24);
  return `${prefix}_${safeName || 'item'}_${random}`;
}

function legacyStableId(prefix: string, name: string): string {
  const code = Array.from(name).map((letter) => letter.codePointAt(0)?.toString(16) || '0').join('-');
  return `${prefix}_legacy_${code.slice(0, 72)}`;
}

export function getLocationCatalog(
  catalog?: LocationCatalogGovernorate[],
  legacy?: Record<string, string[]>,
): LocationCatalogGovernorate[] {
  if (Array.isArray(catalog) && catalog.length) {
    return catalog.filter((region) => region?.id && region?.name && Array.isArray(region.cities)).map((region) => ({
      ...region,
      cities: region.cities.filter((city) => city?.id && city?.name).map((city) => ({ id: city.id, name: city.name, streets: [] })),
    }));
  }
  const source = legacy && Object.keys(legacy).length ? legacy : DEFAULT_GAZA_LOCATIONS;
  return Object.entries(source).map(([name, cities]) => ({
    id: legacyStableId('gov', name),
    name,
    cities: [...new Set(cities)].map((cityName) => ({
      id: legacyStableId('city', `${name}|${cityName}`),
      name: cityName,
      streets: [],
    })),
  }));
}

export function toLegacyLocations(catalog: LocationCatalogGovernorate[]): Record<string, string[]> {
  return Object.fromEntries(catalog.filter((region) => region.name.trim()).map((region) => [region.name.trim(), region.cities.map((city) => city.name.trim()).filter(Boolean)]));
}

export function getDeliveryAreaKeys(location?: {
  governorateId?: string; governorate?: string; cityId?: string; city?: string; } | null): string[] {
  if (!location) return ['عام', 'الكل', 'default'];
  const keys = [
    location.cityId ? `city:${location.cityId}` : '',
    location.governorateId ? `governorate:${location.governorateId}` : '',
    location.city || '', location.governorate || '',
  ].filter(Boolean);
  return [...keys, 'عام', 'الكل', 'default'];
}

export function formatBranchAddress(branch: {
  governorate?: string; city?: string; addressDetail?: string;
}): string {
  return [branch.governorate, branch.city, branch.addressDetail]
    .map((value) => String(value || '').trim()).filter(Boolean).join(' - ');
}
