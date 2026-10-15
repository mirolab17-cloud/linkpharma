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
