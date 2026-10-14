// server.ts
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

// Parse JSON with larger limit for image uploads
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Helper to get Gemini API instance
function getAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

// ======================= API Routes =======================

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_KEY),
    time: new Date().toISOString()
  });
});

// Gemini text extraction route
app.post('/api/gemini/extract-text', async (req, res) => {
  try {
    const { text, customApiKey } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'النص المطلوب استخراج الأسعار منه فارغ.' });
    }

    const apiKey = (customApiKey && typeof customApiKey === 'string' && customApiKey.trim())
      ? customApiKey.trim()
      : (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_KEY);

    if (!apiKey) {
      return res.status(400).json({
        error: 'مفتاح Gemini API غير مهيأ على الخادم. يرجى توفيره أو استخدام استيراد ملفات Excel.'
      });
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

    return res.json({ items: parsed });
  } catch (error: any) {
    console.error('Server Gemini text extraction error:', error);
    return res.status(500).json({
      error: 'فشل استخراج الأسعار بالذكاء الاصطناعي: ' + (error?.message || 'خطأ غير معروف')
    });
  }
});

// Gemini image extraction route
app.post('/api/gemini/extract-image', async (req, res) => {
  try {
    const { imageBase64, mimeType, customApiKey } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'بيانات الصورة مفقودة.' });
    }

    const apiKey = (customApiKey && typeof customApiKey === 'string' && customApiKey.trim())
      ? customApiKey.trim()
      : (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_KEY);

    if (!apiKey) {
      return res.status(400).json({
        error: 'مفتاح Gemini API غير مهيأ على الخادم. يرجى توفيره أو استخدام استيراد ملفات Excel.'
      });
    }

    const prompt = `
استخرج قائمة الأصناف الدوائية وأسعارها من صورة قائمة الأسعار / الفاتورة هذه بدقة عالية.
أعد الناتج حصراً على هيئة JSON Array بالصيغة التالية:
[
  { "name": "اسم الصنف الدوائي بدقة", "price": 14.5 }
]
لا تضف أي نص توضيحي، فقط مصفوفة JSON.
`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: imageBase64,
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

    return res.json({ items: parsed });
  } catch (error: any) {
    console.error('Server Gemini image extraction error:', error);
    return res.status(500).json({
      error: 'تعذر قراءة الصورة بالذكاء الاصطناعي: ' + (error?.message || 'خطأ غير معروف')
    });
  }
});

// ======================= Vite / Static Files =======================
async function startServer() {
  if (!isProd) {
    // In development: mount Vite dev server as middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production: serve dist files
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port} (mode: ${isProd ? 'production' : 'development'})`);
  });
}

startServer();
