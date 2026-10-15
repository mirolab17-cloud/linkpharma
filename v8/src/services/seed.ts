// src/services/seed.ts
import { ActiveIngredient, Product, Supplier, PriceRecord } from '../types';
import { normalizeArabic } from '../utils/arabicNormalize';

export const SEED_ACTIVE_INGREDIENTS: Omit<ActiveIngredient, 'createdAt'>[] = [
  { id: 'ing_1', name: 'Paracetamol (باراسيتامول)', category: 'مسكنات وخافضات حرارة' },
  { id: 'ing_2', name: 'Amoxicillin (أموكسيسيلين)', category: 'مضادات حيوية' },
  { id: 'ing_3', name: 'Ibuprofen (إيبوبروفين)', category: 'مضادات التهاب ومسكنات' },
  { id: 'ing_4', name: 'Omeprazole (أوميبرازول)', category: 'أدوية الجهاز الهضمي والمعدة' },
  { id: 'ing_5', name: 'Metformin (ميتفورمين)', category: 'أدوية السكري' },
  { id: 'ing_6', name: 'Atorvastatin (أتورفاستاتين)', category: 'أدوية الدهون والقلب' },
  { id: 'ing_7', name: 'Cetirizine (سيتريزين)', category: 'مضادات الحساسية' },
  { id: 'ing_8', name: 'Azithromycin (أزيثرومايسين)', category: 'مضادات حيوية' },
  { id: 'ing_9', name: 'Pantoprazole (بانتوبرازول)', category: 'أدوية الجهاز الهضمي والمعدة' },
  { id: 'ing_10', name: 'Losartan (لوسارتان)', category: 'أدوية ضغط الدم' },
];

export const SEED_SUPPLIERS: Omit<Supplier, 'createdAt'>[] = [
  {
    id: 'sup_1',
    name: 'مستودع المتحدة للأدوية',
    whatsapp: '966501112233',
    address: 'الرياض - المنطقة الصناعية الثانية',
    notes: 'توصيل يومي لكافة صيدليات العاصمة، خصم خاص على الدفع النقدي',
    status: 'active',
    lastPriceUpdate: new Date().toISOString(),
    importTemplate: {
      sheetName: 'Sheet1',
      startRow: 2,
      columns: {
        name: 'اسم الصنف',
        price: 'سعر الصيدلية',
        publicPrice: 'سعر العموم',
        availability: 'الحالة',
      },
    },
  },
  {
    id: 'sup_2',
    name: 'مستودع الدواء العربي الحديث',
    whatsapp: '966552223344',
    address: 'جدة - طريق مكة القديم كيلو 8',
    notes: 'وكيل حصري لمنتجات سبيماكو وجلفار، مواعيد تسليم من 8ص إلى 4م',
    status: 'active',
    lastPriceUpdate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'sup_3',
    name: 'مستودع الشفاء الطبي السريع',
    whatsapp: '966543334455',
    address: 'الدمام - حي الخالدية',
    notes: 'طلبيات المنطقة الشرقية، شحن مبرد معتمد',
    status: 'active',
    lastPriceUpdate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // أقدم من 7 أيام لتجربة التنبيه اللوني
  },
];

export const SEED_PRODUCTS_RAW = [
  // باراسيتامول
  { id: 'prod_1', tradeName: 'Panadol Extra 500mg', form: 'أقراص', strength: '500mg / 65mg', manufacturer: 'GSK', category: 'مسكنات', activeIngredientId: 'ing_1', barcode: '628100100001' },
  { id: 'prod_2', tradeName: 'Panadol Advance 500mg', form: 'أقراص', strength: '500mg', manufacturer: 'GSK', category: 'مسكنات', activeIngredientId: 'ing_1', barcode: '628100100002' },
  { id: 'prod_3', tradeName: 'Adol 500mg Tablets', form: 'أقراص', strength: '500mg', manufacturer: 'Julphar', category: 'مسكنات', activeIngredientId: 'ing_1', barcode: '628100100003' },
  { id: 'prod_4', tradeName: 'Fevadol 500mg Tabs', form: 'أقراص', strength: '500mg', manufacturer: 'SPIMACO', category: 'مسكنات', activeIngredientId: 'ing_1', barcode: '628100100004' },
  { id: 'prod_5', tradeName: 'Fevadol Syrup 145ml', form: 'شراب', strength: '160mg/5ml', manufacturer: 'SPIMACO', category: 'أدوية أطفال', activeIngredientId: 'ing_1', barcode: '628100100005' },

  // أموكسيسيلين
  { id: 'prod_6', tradeName: 'Augmentin 1g Tablets', form: 'أقراص', strength: '1000mg', manufacturer: 'GSK', category: 'مضادات حيوية', activeIngredientId: 'ing_2', barcode: '628100100006' },
  { id: 'prod_7', tradeName: 'Augmentin 625mg Tablets', form: 'أقراص', strength: '625mg', manufacturer: 'GSK', category: 'مضادات حيوية', activeIngredientId: 'ing_2', barcode: '628100100007' },
  { id: 'prod_8', tradeName: 'Augmentin 312mg Suspension', form: 'شراب معلق', strength: '312mg/5ml', manufacturer: 'GSK', category: 'مضادات حيوية', activeIngredientId: 'ing_2', barcode: '628100100008' },
  { id: 'prod_9', tradeName: 'Julmentin 1g Tabs', form: 'أقراص', strength: '1g', manufacturer: 'Julphar', category: 'مضادات حيوية', activeIngredientId: 'ing_2', barcode: '628100100009' },
  { id: 'prod_10', tradeName: 'Amoclan 1g Tablets', form: 'أقراص', strength: '1000mg', manufacturer: 'Hikma', category: 'مضادات حيوية', activeIngredientId: 'ing_2', barcode: '628100100010' },

  // إيبوبروفين
  { id: 'prod_11', tradeName: 'Brufen 400mg Tablets', form: 'أقراص', strength: '400mg', manufacturer: 'Abbott', category: 'مسكنات', activeIngredientId: 'ing_3', barcode: '628100100011' },
  { id: 'prod_12', tradeName: 'Brufen 600mg Granules', form: 'فوار', strength: '600mg', manufacturer: 'Abbott', category: 'مسكنات', activeIngredientId: 'ing_3', barcode: '628100100012' },
  { id: 'prod_13', tradeName: 'Profinal 400mg Tablets', form: 'أقراص', strength: '400mg', manufacturer: 'Julphar', category: 'مسكنات', activeIngredientId: 'ing_3', barcode: '628100100013' },
  { id: 'prod_14', tradeName: 'Profinal Suspension 100ml', form: 'شراب', strength: '100mg/5ml', manufacturer: 'Julphar', category: 'أدوية أطفال', activeIngredientId: 'ing_3', barcode: '628100100014' },

  // أوميبرازول
  { id: 'prod_15', tradeName: 'Losec 20mg Capsules', form: 'كبسولات', strength: '20mg', manufacturer: 'AstraZeneca', category: 'جهاز هضمي', activeIngredientId: 'ing_4', barcode: '628100100015' },
  { id: 'prod_16', tradeName: 'Omepral 20mg Caps', form: 'كبسولات', strength: '20mg', manufacturer: 'Julphar', category: 'جهاز هضمي', activeIngredientId: 'ing_4', barcode: '628100100016' },
  { id: 'prod_17', tradeName: 'Gasec 20mg Capsules', form: 'كبسولات', strength: '20mg', manufacturer: 'Hikma', category: 'جهاز هضمي', activeIngredientId: 'ing_4', barcode: '628100100017' },

  // ميتفورمين
  { id: 'prod_18', tradeName: 'Glucophage 500mg Tabs', form: 'أقراص', strength: '500mg', manufacturer: 'Merck', category: 'سكري', activeIngredientId: 'ing_5', barcode: '628100100018' },
  { id: 'prod_19', tradeName: 'Glucophage 1000mg Tabs', form: 'أقراص', strength: '1000mg', manufacturer: 'Merck', category: 'سكري', activeIngredientId: 'ing_5', barcode: '628100100019' },
  { id: 'prod_20', tradeName: 'Formit 500mg Tablets', form: 'أقراص', strength: '500mg', manufacturer: 'SPIMACO', category: 'سكري', activeIngredientId: 'ing_5', barcode: '628100100020' },

  // أتورفاستاتين
  { id: 'prod_21', tradeName: 'Lipitor 20mg Tablets', form: 'أقراص', strength: '20mg', manufacturer: 'Pfizer', category: 'قلب وأوعية', activeIngredientId: 'ing_6', barcode: '628100100021' },
  { id: 'prod_22', tradeName: 'Lipitor 40mg Tablets', form: 'أقراص', strength: '40mg', manufacturer: 'Pfizer', category: 'قلب وأوعية', activeIngredientId: 'ing_6', barcode: '628100100022' },
  { id: 'prod_23', tradeName: 'Atorva 20mg Tablets', form: 'أقراص', strength: '20mg', manufacturer: 'Hikma', category: 'قلب وأوعية', activeIngredientId: 'ing_6', barcode: '628100100023' },

  // سيتريزين
  { id: 'prod_24', tradeName: 'Zyrtec 10mg Tablets', form: 'أقراص', strength: '10mg', manufacturer: 'GSK', category: 'حساسية', activeIngredientId: 'ing_7', barcode: '628100100024' },
  { id: 'prod_25', tradeName: 'Finistil Drops 20ml', form: 'نقط فموية', strength: '1mg/ml', manufacturer: 'Novartis', category: 'حساسية', activeIngredientId: 'ing_7', barcode: '628100100025' },
  { id: 'prod_26', tradeName: 'Cetrak 10mg Tablets', form: 'أقراص', strength: '10mg', manufacturer: 'Tabuk', category: 'حساسية', activeIngredientId: 'ing_7', barcode: '628100100026' },

  // أزيثرومايسين
  { id: 'prod_27', tradeName: 'Zithromax 500mg Caps', form: 'كبسولات', strength: '500mg', manufacturer: 'Pfizer', category: 'مضادات حيوية', activeIngredientId: 'ing_8', barcode: '628100100027' },
  { id: 'prod_28', tradeName: 'Azimycin 500mg Tablets', form: 'أقراص', strength: '500mg', manufacturer: 'SPIMACO', category: 'مضادات حيوية', activeIngredientId: 'ing_8', barcode: '628100100028' },

  // بانتوبرازول
  { id: 'prod_29', tradeName: 'Controloc 40mg Tablets', form: 'أقراص', strength: '40mg', manufacturer: 'Takeda', category: 'جهاز هضمي', activeIngredientId: 'ing_9', barcode: '628100100029' },
  
  // لوسارتان
  { id: 'prod_30', tradeName: 'Cozaar 50mg Tablets', form: 'أقراص', strength: '50mg', manufacturer: 'MSD', category: 'ضغط دم', activeIngredientId: 'ing_10', barcode: '628100100030' },
];

export const SEED_PRODUCTS: Product[] = SEED_PRODUCTS_RAW.map((p) => ({
  ...p,
  normalizedName: normalizeArabic(p.tradeName),
  createdAt: new Date().toISOString(),
}));

// توليد أسعار واقعية ومتباينة للموردين الثلاثة للمقارنة
export const SEED_PRICES: PriceRecord[] = [];
SEED_PRODUCTS.forEach((prod, index) => {
  // قاعدة سعرية
  const basePrice = 12 + (index % 10) * 8 + (index > 15 ? 25 : 0);
  const publicPrice = Math.round(basePrice * 1.35 * 10) / 10;

  // المورد 1
  SEED_PRICES.push({
    id: `sup_1_${prod.id}`,
    supplierId: 'sup_1',
    productId: prod.id,
    price: Math.round((basePrice * 0.95) * 10) / 10,
    publicPrice,
    available: true,
    updatedAt: new Date().toISOString(),
  });

  // المورد 2
  SEED_PRICES.push({
    id: `sup_2_${prod.id}`,
    supplierId: 'sup_2',
    productId: prod.id,
    price: Math.round((basePrice * (index % 2 === 0 ? 0.92 : 1.02)) * 10) / 10,
    publicPrice,
    available: index % 7 !== 0,
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // المورد 3 (أسعار قديمة بعض الشيء لاختبار شارة التنبيه 7 أيام)
  SEED_PRICES.push({
    id: `sup_3_${prod.id}`,
    supplierId: 'sup_3',
    productId: prod.id,
    price: Math.round((basePrice * 0.98) * 10) / 10,
    publicPrice,
    available: true,
    updatedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
  });
});
