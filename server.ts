// server.ts
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

// Initialize Firebase Admin SDK
const adminApp = getApps().length > 0 
  ? getApps()[0] 
  : initializeApp({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'refined-might-8mn89',
    });

const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp);

// Parse JSON with 5MB limit
const MAX_PAYLOAD_LIMIT = '5mb';
app.use(express.json({ limit: MAX_PAYLOAD_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: MAX_PAYLOAD_LIMIT }));

// Rate limiter per UID/IP (max 20 requests per minute)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_MIN = 20;

function checkGeminiRateLimit(identifier: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_REQUESTS_PER_MIN) {
    return false;
  }
  entry.count++;
  return true;
}

// Clean up stale rate limits
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Admin Authentication Middleware
async function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'غير مصرح: يرجى تسجيل الدخول وتوفير رمز المصادقة.' });
  }

  const token = authHeader.substring(7).trim();
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = (decodedToken.email || '').toLowerCase();

    // Check admin eligibility: Custom Claim -> admins collection -> ADMIN_EMAILS -> Master admin
    let isAdmin = Boolean(decodedToken.admin);

    if (!isAdmin) {
      try {
        const adminDoc = await adminDb.collection('admins').doc(uid).get();
        if (adminDoc.exists) {
          isAdmin = true;
        }
      } catch (_) {}
    }

    if (!isAdmin && process.env.ADMIN_EMAILS) {
      const adminEmails = process.env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase());
      if (email && adminEmails.includes(email)) {
        isAdmin = true;
      }
    }

    if (!isAdmin && email === 'mirolab17@gmail.com') {
      isAdmin = true;
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'صلاحيات غير كافية: استخراج الأسعار بالذكاء الاصطناعي مقتصر على المشرفين فقط.' });
    }

    // Rate limit check based on UID
    if (!checkGeminiRateLimit(uid)) {
      return res.status(429).json({ error: 'تم تجاوز الحد المسموح به من الطلبات مؤقتاً. يرجى الانتظار دقيقة.' });
    }

    (req as any).user = decodedToken;
    next();
  } catch (err: any) {
    console.error('Firebase token verification error in server:', err);
    return res.status(401).json({ error: 'رمز المصادقة غير صالح أو منتهي الصلاحية.' });
  }
}

// Helper to get Gemini API instance strictly from server environment variables
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
    time: new Date().toISOString(),
  });
});

// Gemini text extraction route (Admin only, 5MB limit, rate limited, no customApiKey)
app.post('/api/gemini/extract-text', requireAdminAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'النص المطلوب استخراج الأسعار منه فارغ.' });
    }

    const ai = getAI();
    if (!ai) {
      return res.status(500).json({
        error: 'مفتاح Gemini API غير مهيأ على الخادم. يرجى ضبط GEMINI_API_KEY.',
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
      error: 'فشل استخراج الأسعار بالذكاء الاصطناعي: ' + (error?.message || 'خطأ غير معروف'),
    });
  }
});

// Gemini image extraction route (Admin only, 5MB limit, type check, size check, no customApiKey)
app.post('/api/gemini/extract-image', requireAdminAuth, async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'بيانات الصورة مفقودة أو غير صالحة.' });
    }

    // Validate MIME type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const validMimeType = (mimeType && allowedMimeTypes.includes(mimeType)) ? mimeType : 'image/jpeg';
    if (mimeType && !allowedMimeTypes.includes(mimeType)) {
      return res.status(400).json({
        error: `نوع الصورة غير مدعوم: ${mimeType}. الأنواع المدعومة هي JPEG و PNG و WEBP.`,
      });
    }

    // Validate image size (approximate decoded size: length * 0.75)
    const approxByteSize = Math.round((imageBase64.length * 3) / 4);
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
    if (approxByteSize > MAX_IMAGE_BYTES) {
      return res.status(400).json({
        error: 'حجم الصورة يتجاوز الحد الأقصى المسموح به (5 ميجابايت).',
      });
    }

    const ai = getAI();
    if (!ai) {
      return res.status(500).json({
        error: 'مفتاح Gemini API غير مهيأ على الخادم. يرجى ضبط GEMINI_API_KEY.',
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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: validMimeType,
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
      error: 'تعذر قراءة الصورة بالذكاء الاصطناعي: ' + (error?.message || 'خطأ غير معروف'),
    });
  }
});

// ======================= Vite / Static Files =======================
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
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
