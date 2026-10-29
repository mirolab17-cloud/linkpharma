// src/services/whatsapp.ts
import { CartItem, UserProfile } from '../types';
import { formatCurrency } from '../utils/formatPrice';
import { formatGregorianDateTime } from '../utils/formatDate';
import { createWhatsAppLink } from '../utils/phone';

export function buildOrderWhatsAppMessage(params: {
  pharmacy: UserProfile;
  items: CartItem[];
  subtotal: number;
}): string {
  const { pharmacy, items, subtotal } = params;

  const nowFormatted = formatGregorianDateTime(new Date());

  const showPlatform = pharmacy.whatsappBranding !== 'invoice_only';
  const lines = [
    ...(showPlatform ? ['فارما لينك | منصة فارما لينك'] : []),
    showPlatform ? 'طلبية جديدة 🧾' : 'فاتورة طلبية 🧾',
    `الصيدلية: ${pharmacy.pharmacyName || pharmacy.name}`,
    `العنوان: ${pharmacy.address || 'غير محدد'}`,
    `الجوال: ${pharmacy.phone || 'غير محدد'}`,
    `التاريخ: ${nowFormatted}`,
    '——————',
    ...items.map(
      (item, idx) =>
        `${idx + 1}) ${item.tradeName} × ${item.qty} — ${formatCurrency(item.price * item.qty)}`
    ),
    '——————',
    `الإجمالي: ${formatCurrency(subtotal)}`,
  ];

  return lines.join('\n');
}

export function openWhatsAppOrder(whatsapp: string, message: string): void {
  const link = createWhatsAppLink(whatsapp, message);
  window.open(link, '_blank', 'noopener,noreferrer');
}
