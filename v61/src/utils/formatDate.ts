// src/utils/formatDate.ts

/**
 * تنسيق التواريخ بالتقويم الميلادي حصراً وبأرقام لاتينية (منع التقويم الهجري ar-SA)
 */
export function formatGregorianDate(
  dateInput: string | number | Date | undefined | null,
  options?: {
    includeTime?: boolean;
    format?: 'short' | 'medium' | 'full';
  }
): string {
  if (!dateInput) return '-';

  try {
    const date = typeof dateInput === 'string' || typeof dateInput === 'number'
      ? new Date(dateInput)
      : dateInput;

    if (isNaN(date.getTime())) return '-';

    const includeTime = options?.includeTime ?? false;

    // استخدام التقويم الميلادي الصريح والأرقام اللاتينية
    const formatter = new Intl.DateTimeFormat('ar-EG-u-ca-gregory-nu-latn', {
      year: 'numeric',
      month: options?.format === 'short' ? 'numeric' : 'short',
      day: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {})
    });

    return formatter.format(date);
  } catch {
    // تنسيق احتياطي قياسي بأرقام لاتينية
    try {
      const d = new Date(dateInput as any);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      if (options?.includeTime) {
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${year}/${month}/${day} ${hours}:${minutes}`;
      }
      return `${year}/${month}/${day}`;
    } catch {
      return String(dateInput);
    }
  }
}

export function formatGregorianDateTime(
  dateInput: string | number | Date | undefined | null
): string {
  return formatGregorianDate(dateInput, { includeTime: true });
}
