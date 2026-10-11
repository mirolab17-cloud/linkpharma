// src/services/gemini.ts
import { GoogleGenAI } from '@google/genai';
import { cleanPrice } from '../utils/formatPrice';
import { db, doc, getDoc, setDoc, deleteDoc } from '../firebase';

export interface ExtractedPriceItem {
  id: string;
  name: string;
  price: number;
  publicPrice?: number;
}

const GEMINI_LOCAL_STORAGE_KEY = 'linkpharma_gemini_api_key';

/**
 * الحصول على مفتاح Gemini بأمان:
 * 1. من الذاكرة المحلية للمشرف (localStorage)
 * 2. أو من Firestore في وثيقة settings/gemini (التي لا يقرأها إلا المشرف)
 * 3. أو من متغير البيئة VITE_GEMINI_KEY إن وجد محلياً
 */
export async function getStoredGeminiKey(): Promise<string | null> {
  // 1. فحص الكاش المحلي
  try {
    const cached = localStorage.getItem(GEMINI_LOCAL_STORAGE_KEY);
    if (cached && cached.trim()) {
      return cached.trim();
    }
  } catch (_) {}

  // 2. القراءة من Firestore (مقتصرة على المشرف فقط عبر قواعد الأمان)
  try {
    const snap = await getDoc(doc(db, 'settings', 'gemini'));
    if (snap.exists()) {
      const data = snap.data();
      if (data?.apiKey && typeof data.apiKey === 'string' && data.apiKey.trim()) {
        const key = data.apiKey.trim();
        try {
          localStorage.setItem(GEMINI_LOCAL_STORAGE_KEY, key);
        } catch (_) {}
        return key;
      }
    }
  } catch (_) {}

  // 3. فحص متغير البيئة كخيار احتياطي للتطوير
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_KEY) {
      const envKey = String(import.meta.env.VITE_GEMINI_KEY).trim();
      if (envKey) return envKey;
    }
  } catch (_) {}

  return null;
}

/**
 * حفظ مفتاح Gemini في Firestore وفي المتصفح للمشرف
 */
export async function saveGeminiKey(apiKey: string): Promise<void> {
  const clean = apiKey.trim();
  if (!clean) {
    throw new Error('يرجى إدخال مفتاح API صالح.');
  }

  // الحفظ في Firestore
  await setDoc(doc(db, 'settings', 'gemini'), {
    apiKey: clean,
    updatedAt: new Date().toISOString(),
  });

  // الحفظ في التخزين المحلي للمشرف
  try {
    localStorage.setItem(GEMINI_LOCAL_STORAGE_KEY, clean);
  } catch (_) {}
}

/**
 * مسح مفتاح Gemini
 */
export async function deleteGeminiKey(): Promise<void> {
  try {
    await deleteDoc(doc(db, 'settings', 'gemini'));
  } catch (_) {}
  try {
    localStorage.removeItem(GEMINI_LOCAL_STORAGE_KEY);
  } catch (_) {}
}

/**
 * استخراج الأسعار من نص ملصوق عبر Gemini
 */
export async function extractPricesFromText(text: string, customApiKey?: string): Promise<ExtractedPriceItem[]> {
  const apiKey = (customApiKey && customApiKey.trim()) || await getStoredGeminiKey();
  if (!apiKey) {
    throw new Error('مفتاح Gemini API غير مهيأ. يرجى إدخال المفتاح وحفظه من لوحة الإدارة أعلاه، أو استخدام استيراد ملفات Excel/CSV.');
  }

  const prompt = `
أنت خبير في التعرف على فواتير وقوائم أسعار الأدوية والمستحضرات الطبية.
المطلوب استخراج أسماء الأدوية وأسعارها من النص التالي، وإرجاع الناتج حصراً كـ JSON Array بدون أي كود ماركداون إضافي.
الصيغة المطلوبة تماماً:
[
  { "name": "اسم الدواء أو الصنف التجاري", "price": 25.5 }
]

ملاحظات هامة:
1. استخرج السعر كرقم float أو int فقط.
2. تجاهل السطور العامة مثل العناوين وأرقام الهواتف والتذييلات.
3. إذا كان هناك سعر صيدلية وسعر عموم، اختر سعر الشراء/التوريد في "price".

النص:
${text}
`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '';
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    if (!Array.isArray(parsed)) {
      throw new Error('الاستجابة المستلمة ليست مصفوفة أصناف صالحة.');
    }

    return parsed.map((item, idx) => ({
      id: 'ext_' + Date.now() + '_' + idx,
      name: String(item.name || '').trim(),
      price: cleanPrice(item.price) || 0,
      publicPrice: item.publicPrice ? cleanPrice(item.publicPrice) || undefined : undefined,
    })).filter((i) => i.name && i.price > 0);
  } catch (err: any) {
    console.error('Gemini text extraction failed:', err);
    throw new Error('فشل استخراج الأسعار عبر الذكاء الاصطناعي: ' + (err.message || ''));
  }
}

/**
 * استخراج الأسعار من صورة (قائمة أسعار / فاتورة / كشف مستودع) عبر Gemini Vision
 */
export async function extractPricesFromImage(file: File, customApiKey?: string): Promise<ExtractedPriceItem[]> {
  const apiKey = (customApiKey && customApiKey.trim()) || await getStoredGeminiKey();
  if (!apiKey) {
    throw new Error('مفتاح Gemini API غير مهيأ. يرجى إدخال المفتاح وحفظه من لوحة الإدارة أعلاه، أو استخدام استيراد ملفات Excel/CSV.');
  }

  // تحويل الملف إلى Base64
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const prompt = `
استخرج قائمة الأصناف الدوائية وأسعارها من صورة قائمة الأسعار / الفاتورة هذه بدقة عالية.
أعد الناتج حصراً على هيئة JSON Array بالصيغة التالية:
[
  { "name": "اسم الصنف الدوائي بدقة", "price": 14.5 }
]
لا تضف أي نص توضيحي، فقط مصفوفة JSON.
`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: file.type || 'image/jpeg',
                data: base64Data,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '';
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    if (!Array.isArray(parsed)) {
      throw new Error('الاستجابة المستلمة ليست مصفوفة أصناف صالحة.');
    }

    return parsed.map((item, idx) => ({
      id: 'ext_img_' + Date.now() + '_' + idx,
      name: String(item.name || '').trim(),
      price: cleanPrice(item.price) || 0,
    })).filter((i) => i.name && i.price > 0);
  } catch (err: any) {
    console.error('Gemini image extraction failed:', err);
    throw new Error('تعذر قراءة الصورة بالذكاء الاصطناعي: ' + (err.message || ''));
  }
}
