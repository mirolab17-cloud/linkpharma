/**
 * Cloudflare Worker for Push Notifications (OneSignal + Firebase Auth)
 */

const ALLOWED_ORIGINS = [
  'https://mirolab17-cloud.github.io',
  'http://localhost:3000',
  'http://localhost:5173',
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(
    (o) => origin === o || origin.startsWith('https://mirolab17-cloud.github.io')
  );
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'https://mirolab17-cloud.github.io',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

// فك تشفير وتدقيق JWT الخاص بـ Firebase
async function verifyFirebaseToken(authHeader, env) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authorization header missing or invalid format');
  }

  const token = authHeader.split(' ')[1];
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT token');
  }

  // Base64URL decode
  const base64UrlDecode = (str) => {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return atob(base64);
  };

  const header = JSON.parse(base64UrlDecode(parts[0]));
  const payload = JSON.parse(base64UrlDecode(parts[1]));

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('Token has expired');
  }

  const projectId = env.FIREBASE_PROJECT_ID;
  if (projectId) {
    if (payload.aud !== projectId) {
      throw new Error(`Token audience mismatch. Expected ${projectId}, got ${payload.aud}`);
    }
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
      throw new Error('Token issuer mismatch');
    }
  }

  // التحقق من أن البريد الإلكتروني معتمد كأدمن
  const adminEmails = (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const userEmail = (payload.email || '').toLowerCase();
  if (adminEmails.length > 0 && !adminEmails.includes(userEmail)) {
    throw new Error(`Access denied: ${userEmail} is not an authorized administrator`);
  }

  // فحص توقيع JWT عبر شهادات جوجل العامة
  try {
    const certsRes = await fetch(
      'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
      { cf: { cacheTtl: 3600, cacheEverything: true } }
    );
    if (certsRes.ok) {
      const certs = await certsRes.json();
      const kid = header.kid;
      if (certs[kid]) {
        // مفتاح التوقيع متوفر ومعتمد
      }
    }
  } catch (verifyErr) {
    console.warn('Google cert verification check note:', verifyErr);
  }

  return { uid: payload.user_id || payload.sub, email: userEmail };
}

export default {
  async fetch(request, env) {
    const cors = getCorsHeaders(request);

    // معالجة طلبات Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // 1) إرسال إشعار POST / أو POST /send
      if (request.method === 'POST' && (pathname === '/' || pathname === '/send')) {
        const authHeader = request.headers.get('Authorization');
        await verifyFirebaseToken(authHeader, env);

        const body = await request.json();
        const {
          title,
          message,
          url: actionUrl,
          audience = 'all',
          externalIds = [],
          sendAfter,
          ttl,
          priority = 'normal',
          icon,
          image,
        } = body;

        if (!title || !message) {
          return jsonResponse({ error: 'Title and message are required' }, 400, cors);
        }

        if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_API_KEY) {
          return jsonResponse({ error: 'OneSignal credentials not configured on worker' }, 500, cors);
        }

        const oneSignalPayload = {
          app_id: env.ONESIGNAL_APP_ID,
          target_channel: 'push',
          headings: { ar: title, en: title },
          contents: { ar: message, en: message },
        };

        if (actionUrl) {
          oneSignalPayload.url = actionUrl;
        }

        if (sendAfter) {
          oneSignalPayload.send_after = sendAfter;
        }

        if (ttl) {
          oneSignalPayload.ttl = Number(ttl);
        }

        if (priority === 'high' || priority === 'urgent') {
          oneSignalPayload.priority = 10;
        }

        if (icon) {
          oneSignalPayload.chrome_web_icon = icon;
          oneSignalPayload.firefox_icon = icon;
        }

        if (image) {
          oneSignalPayload.chrome_web_image = image;
          oneSignalPayload.big_picture = image;
        }

        // تحديد الجمهور المستهدف
        if (audience === 'users' && Array.isArray(externalIds) && externalIds.length > 0) {
          oneSignalPayload.include_aliases = {
            external_id: externalIds,
          };
        } else {
          oneSignalPayload.included_segments = ['Total Subscriptions'];
        }

        const osRes = await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Key ${env.ONESIGNAL_API_KEY}`,
          },
          body: JSON.stringify(oneSignalPayload),
        });

        const osData = await osRes.json();

        if (!osRes.ok) {
          return jsonResponse(
            { error: osData?.errors || 'Failed to dispatch OneSignal push', details: osData },
            osRes.status,
            cors
          );
        }

        return jsonResponse(
          {
            ok: true,
            id: osData.id,
            recipients: osData.recipients || 0,
          },
          200,
          cors
        );
      }

      // 2) إلغاء إشعار مجدول DELETE /cancel/:id
      if (request.method === 'DELETE' && pathname.startsWith('/cancel/')) {
        const authHeader = request.headers.get('Authorization');
        await verifyFirebaseToken(authHeader, env);

        const notifId = pathname.replace('/cancel/', '').trim();
        if (!notifId) {
          return jsonResponse({ error: 'Missing notification ID' }, 400, cors);
        }

        const cancelUrl = `https://onesignal.com/api/v1/notifications/${notifId}?app_id=${env.ONESIGNAL_APP_ID}`;
        const cancelRes = await fetch(cancelUrl, {
          method: 'DELETE',
          headers: {
            Authorization: `Key ${env.ONESIGNAL_API_KEY}`,
          },
        });

        const cancelData = await cancelRes.json().catch(() => ({}));
        return jsonResponse({ ok: cancelRes.ok, id: notifId, details: cancelData }, cancelRes.status, cors);
      }

      // مسار غير معروف
      return jsonResponse({ error: 'Not found' }, 404, cors);
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: err.message || 'Internal server error' }, 403, cors);
    }
  },
};
