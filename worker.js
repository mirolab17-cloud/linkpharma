/**
 * Cloudflare Worker for Push Notifications (OneSignal + Firebase Auth)
 * Fully hardened with WebCrypto RS256 JWT signature verification against Google securetoken x509 certs.
 */

const ALLOWED_ORIGINS = [
  'https://mirolab17-cloud.github.io',
  'http://localhost:3000',
  'http://localhost:5173',
];

const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_EXTERNAL_IDS = 200;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20;

// Simple in-memory rate limiter per UID
const rateLimitMap = new Map();
let lastRateLimitCleanup = 0;

function checkRateLimit(uid) {
  const now = Date.now();
  if (now - lastRateLimitCleanup >= 5 * 60 * 1000) {
    lastRateLimitCleanup = now;
    for (const [key, val] of rateLimitMap.entries()) {
      if (now > val.resetAt) rateLimitMap.delete(key);
    }
  }
  const userRate = rateLimitMap.get(uid);

  if (!userRate || now > userRate.resetAt) {
    rateLimitMap.set(uid, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (userRate.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  userRate.count++;
  return true;
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = [...ALLOWED_ORIGINS];
  if (env?.ALLOWED_ORIGIN) {
    allowed.push(env.ALLOWED_ORIGIN.trim());
  }

  // Strict exact match only, NO startsWith
  const isAllowed = allowed.includes(origin);
  const allowOrigin = isAllowed ? origin : 'https://mirolab17-cloud.github.io';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
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

function base64ToUint8Array(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlToUint8Array(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return base64ToUint8Array(base64);
}

function base64UrlDecodeText(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return atob(base64);
}

function parseDerTlv(der, offset) {
  const tag = der[offset];
  let len = der[offset + 1];
  let headerLen = 2;
  if (len & 0x80) {
    const numBytes = len & 0x7f;
    len = 0;
    for (let i = 0; i < numBytes; i++) {
      len = (len << 8) | der[offset + 2 + i];
    }
    headerLen = 2 + numBytes;
  }
  return {
    tag,
    len,
    headerLen,
    totalLen: headerLen + len,
    contentOffset: offset + headerLen,
  };
}

/**
 * Extracts the SubjectPublicKeyInfo (SPKI) SEQUENCE from an X.509 Certificate DER.
 * Structure of X.509 v3:
 * Certificate ::= SEQUENCE {
 *   tbsCertificate       TBSCertificate,
 *   signatureAlgorithm   AlgorithmIdentifier,
 *   signatureValue       BIT STRING
 * }
 * TBSCertificate ::= SEQUENCE {
 *   version         [0]  EXPLICIT Version DEFAULT v1,
 *   serialNumber         CertificateSerialNumber,
 *   signature            AlgorithmIdentifier,
 *   issuer               Name,
 *   validity             Validity,
 *   subject              Name,
 *   subjectPublicKeyInfo SubjectPublicKeyInfo,
 *   ...
 * }
 */
function extractSpkiFromCertDer(certDer) {
  const root = parseDerTlv(certDer, 0);
  if (root.tag !== 0x30) throw new Error('Root element is not ASN.1 SEQUENCE');

  const tbs = parseDerTlv(certDer, root.contentOffset);
  if (tbs.tag !== 0x30) throw new Error('TBSCertificate is not ASN.1 SEQUENCE');

  let cur = tbs.contentOffset;

  // 1. Version [0] (optional in ASN.1, present in v3)
  const f0 = parseDerTlv(certDer, cur);
  if (f0.tag === 0xa0) {
    cur += f0.totalLen;
  }

  // 2. Serial Number (INTEGER)
  const serial = parseDerTlv(certDer, cur);
  cur += serial.totalLen;

  // 3. Signature Algorithm (SEQUENCE)
  const sigAlg = parseDerTlv(certDer, cur);
  cur += sigAlg.totalLen;

  // 4. Issuer (SEQUENCE)
  const issuer = parseDerTlv(certDer, cur);
  cur += issuer.totalLen;

  // 5. Validity (SEQUENCE)
  const validity = parseDerTlv(certDer, cur);
  cur += validity.totalLen;

  // 6. Subject (SEQUENCE)
  const subject = parseDerTlv(certDer, cur);
  cur += subject.totalLen;

  // 7. SubjectPublicKeyInfo (SEQUENCE)
  const spki = parseDerTlv(certDer, cur);
  if (spki.tag !== 0x30) {
    throw new Error('SubjectPublicKeyInfo not found at expected position in X.509');
  }

  return certDer.slice(cur, cur + spki.totalLen);
}

// In-memory cache for Google public x509 certs
let cachedCerts = null;
let cachedCertsExpiry = 0;

async function getGooglePublicCerts() {
  const now = Date.now();
  if (cachedCerts && now < cachedCertsExpiry) {
    return cachedCerts;
  }

  const res = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch Google securetoken x509 certs: HTTP ${res.status}`);
  }

  const cacheControl = res.headers.get('Cache-Control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const ttlSec = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;

  cachedCerts = await res.json();
  cachedCertsExpiry = now + ttlSec * 1000;
  return cachedCerts;
}

/**
 * Validates Firebase ID Token with WebCrypto RS256 signature verification against Google x509 public certificates.
 */
async function verifyFirebaseToken(authHeader, env) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authorization header missing or invalid format');
  }

  const token = authHeader.substring(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT token structure');
  }

  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecodeText(parts[0]));
    payload = JSON.parse(base64UrlDecodeText(parts[1]));
  } catch (parseErr) {
    throw new Error('Invalid JSON encoding in JWT header or payload');
  }

  // 1) Algorithm check
  if (header.alg !== 'RS256') {
    throw new Error(`Unsupported JWT algorithm: ${header.alg}. Expected RS256.`);
  }

  const kid = header.kid;
  if (!kid) {
    throw new Error('JWT header missing key ID (kid)');
  }

  // 2) Expiration and time checks
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    throw new Error('Firebase ID token has expired');
  }
  if (!payload.iat || payload.iat > now + 300) {
    throw new Error('Firebase ID token iat is in the future');
  }

  // 3) Audience & Issuer checks
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID environment variable is missing on worker');
  }
  if (payload.aud !== projectId) {
    throw new Error(`Token audience mismatch. Expected ${projectId}, got ${payload.aud}`);
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error(`Token issuer mismatch. Expected https://securetoken.google.com/${projectId}`);
  }

  // 4) Subject check
  const sub = payload.sub || payload.user_id;
  if (!sub || typeof sub !== 'string' || !sub.trim()) {
    throw new Error('Token subject (sub) is missing or empty');
  }

  // 5) Email verified requirement
  if (payload.email_verified !== true) {
    throw new Error('Access denied: Email address must be verified');
  }

  // 6) Mandatory ADMIN_EMAILS check
  const rawAdminEmails = (env.ADMIN_EMAILS || '').trim();
  if (!rawAdminEmails) {
    throw new Error('ADMIN_EMAILS configuration is mandatory and empty on worker');
  }

  const adminEmails = rawAdminEmails
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0) {
    throw new Error('No authorized admin emails configured');
  }

  const userEmail = (payload.email || '').toLowerCase();
  if (!userEmail || !adminEmails.includes(userEmail)) {
    throw new Error(`Access denied: ${userEmail || 'unknown email'} is not in ADMIN_EMAILS`);
  }

  // 7) RS256 Signature Verification via crypto.subtle and Google x509 public certificates
  const certs = await getGooglePublicCerts();
  let certPem = certs[kid];

  // If kid was not in cache, refresh once
  if (!certPem) {
    cachedCerts = null;
    const freshCerts = await getGooglePublicCerts();
    certPem = freshCerts[kid];
  }

  if (!certPem) {
    throw new Error(`No public key certificate found matching kid: ${kid}`);
  }

  // Convert PEM to DER, then extract SPKI
  const certDer = base64ToUint8Array(certPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
  const spkiBytes = extractSpkiFromCertDer(certDer);

  const cryptoKey = await crypto.subtle.importKey(
    'spki',
    spkiBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const encoder = new TextEncoder();
  const signedData = encoder.encode(`${parts[0]}.${parts[1]}`);
  const signatureBytes = base64UrlToUint8Array(parts[2]);

  const isValidSignature = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBytes,
    signedData
  );

  if (!isValidSignature) {
    throw new Error('Invalid JWT cryptographic signature');
  }

  return { uid: sub, email: userEmail };
}

export default {
  async fetch(request, env) {
    const cors = getCorsHeaders(request, env);

    // Preflight OPTIONS requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // 1) Send push notification POST / or POST /send
      if (request.method === 'POST' && (pathname === '/' || pathname === '/send')) {
        const authHeader = request.headers.get('Authorization');
        const authUser = await verifyFirebaseToken(authHeader, env);

        // Rate limit check per UID
        if (!checkRateLimit(authUser.uid)) {
          return jsonResponse(
            { error: 'تم تجاوز الحد المسموح به من الطلبات مؤقتاً. يرجى الانتظار قليلاً.' },
            429,
            cors
          );
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') {
          return jsonResponse({ error: 'Payload must be a valid JSON object' }, 400, cors);
        }

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

        // Input validations & limits
        if (!title || typeof title !== 'string' || !title.trim()) {
          return jsonResponse({ error: 'Title is required' }, 400, cors);
        }
        if (title.length > MAX_TITLE_LENGTH) {
          return jsonResponse(
            { error: `Title exceeds maximum allowed length of ${MAX_TITLE_LENGTH} characters` },
            400,
            cors
          );
        }

        if (!message || typeof message !== 'string' || !message.trim()) {
          return jsonResponse({ error: 'Message is required' }, 400, cors);
        }
        if (message.length > MAX_MESSAGE_LENGTH) {
          return jsonResponse(
            { error: `Message exceeds maximum allowed length of ${MAX_MESSAGE_LENGTH} characters` },
            400,
            cors
          );
        }

        if (Array.isArray(externalIds) && externalIds.length > MAX_EXTERNAL_IDS) {
          return jsonResponse(
            { error: `externalIds cannot contain more than ${MAX_EXTERNAL_IDS} items` },
            400,
            cors
          );
        }

        if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_API_KEY) {
          return jsonResponse({ error: 'OneSignal credentials not configured on worker' }, 500, cors);
        }

        const oneSignalPayload = {
          app_id: env.ONESIGNAL_APP_ID,
          target_channel: 'push',
          headings: { ar: title.trim(), en: title.trim() },
          contents: { ar: message.trim(), en: message.trim() },
        };

        if (actionUrl && typeof actionUrl === 'string') {
          oneSignalPayload.url = actionUrl.trim();
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

        // Target audience
        if (audience === 'users' && Array.isArray(externalIds) && externalIds.length > 0) {
          oneSignalPayload.include_aliases = {
            external_id: externalIds.map(String).slice(0, MAX_EXTERNAL_IDS),
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

        const osData = await osRes.json().catch(() => ({}));

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

      // 2) Cancel scheduled push DELETE /cancel/:id
      if (request.method === 'DELETE' && pathname.startsWith('/cancel/')) {
        const authHeader = request.headers.get('Authorization');
        const authUser = await verifyFirebaseToken(authHeader, env);

        if (!checkRateLimit(authUser.uid)) {
          return jsonResponse({ error: 'Rate limit exceeded' }, 429, cors);
        }

        const notifId = pathname.replace('/cancel/', '').trim();
        if (!notifId) {
          return jsonResponse({ error: 'Missing notification ID' }, 400, cors);
        }

        const cancelUrl = `https://onesignal.com/api/v1/notifications/${encodeURIComponent(notifId)}?app_id=${env.ONESIGNAL_APP_ID}`;
        const cancelRes = await fetch(cancelUrl, {
          method: 'DELETE',
          headers: {
            Authorization: `Key ${env.ONESIGNAL_API_KEY}`,
          },
        });

        const cancelData = await cancelRes.json().catch(() => ({}));
        return jsonResponse({ ok: cancelRes.ok, id: notifId, details: cancelData }, cancelRes.status, cors);
      }

      return jsonResponse({ error: 'Endpoint not found' }, 404, cors);
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: err.message || 'Unauthorized / Forbidden' }, 403, cors);
    }
  },
};
