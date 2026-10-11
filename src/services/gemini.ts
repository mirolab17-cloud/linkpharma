// src/services/gemini.ts
import { GoogleGenAI } from '@google/genai';
import { cleanPrice } from '../utils/formatPrice';

export interface ExtractedPriceItem {
  id: string;
  name: string;
  price: number;
  publicPrice?: number;
}

// الحصول على المفتاح من متغيرات البيئة
function getApiKey(): string | null {
  return (
    import.meta.env.VITE_GEMINI_KEY ||
    (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
    null
  );
}

/**
 * استخراج الأسعار من نص ملصوق عبر Gemini
 */
export async function extractPricesFromText(text: string): Promise<ExtractedPriceItem[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('مفتاح Gemini API غير مهيأ. يرجى إضافة VITE_GEMINI_KEY في ملف .env');
  }

  const ai = new GoogleGenAI({ apiKey });

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
export async function extractPricesFromImage(file: File): Promise<ExtractedPriceItem[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('مفتاح Gemini API غير مهيأ. يرجى إضافة VITE_GEMINI_KEY في ملف .env');
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

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
استخرج قائمة الأصناف الدوائية وأسعارها من صورة قائمة الأسعار / الفاتورة هذه بدقة عالية.
أعد الناتج حصراً على هيئة JSON Array بالصيغة التالية:
[
  { "name": "اسم الصنف الدوائي بدقة", "price": 14.5 }
]
لا تضف أي نص توضيحي، فقط مصفوفة JSON.
`;

  try {
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
