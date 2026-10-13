// src/utils/authErrorTranslator.ts

export interface TranslatedAuthError {
  code: string;
  title: string;
  message: string;
  actionTip?: string;
  unauthorizedDomain?: string;
  isDomainError?: boolean;
  isPopupBlocked?: boolean;
}

/**
 * ترجمة كافة أخطاء المصادقة وFirebase إلى رسائل عربية واضحة ومفهومة مع إرشادات عملية للحل
 */
export function translateAuthError(error: any): TranslatedAuthError {
  if (!error) {
    return {
      code: 'unknown',
      title: 'خطأ غير متوقع',
      message: 'تعذر إتمام العملية. يرجى المحاولة مرة أخرى.',
      actionTip: 'يرجى إعادة المحاولة أو تحديث الصفحة.',
    };
  }

  const rawCode: string = error?.code || '';
  const rawMessage: string = error?.message || (typeof error === 'string' ? error : '');
  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';

  // 1. خطأ النطاق غير المصرح به (Unauthorized Domain)
  if (
    rawCode === 'auth/unauthorized-domain' ||
    rawMessage.includes('unauthorized-domain') ||
    rawMessage.includes('auth/unauthorized-domain') ||
    rawMessage.includes('is not authorized for OAuth operations')
  ) {
    return {
      code: 'auth/unauthorized-domain',
      title: 'نطاق الموقع غير مصرح به في Firebase',
      message: `النطاق الحالي (${currentHostname || 'هذا الرابط'}) غير مسجل في قائمة النطاقات المصرح لها بتسجيل الدخول في مشروع Firebase.`,
      actionTip: `لحل المشكلة نهائياً: اذهب إلى Firebase Console > Authentication > Settings > Authorized domains وأضف النطاق (${currentHostname}). في الوقت الحالي، يمكنك استخدام تسجيل الدخول بالبريد الإلكتروني وكلمة المرور أدناه.`,
      unauthorizedDomain: currentHostname,
      isDomainError: true,
    };
  }

  // 2. حظر النوافذ المنبثقة (Popup Blocked)
  if (
    rawCode === 'auth/popup-blocked' ||
    rawMessage.includes('popup-blocked') ||
    rawMessage.includes('Popup was blocked')
  ) {
    return {
      code: 'auth/popup-blocked',
      title: 'المتصفح حظر نافذة تسجيل الدخول',
      message: 'قام المتصفح بحظر النافذة المنبثقة الخاصة بحساب Google تلقائياً لمنع النوافذ الجديدة.',
      actionTip: 'يرجى النقر على أيقونة النافذة المحظورة أو القفل في شريط عنوان المتصفح، ثم اختيار "السماح دائماً بالنوافذ المنبثقة لهذا الموقع"، ثم أعد المحاولة.',
      isPopupBlocked: true,
    };
  }

  // 3. إغلاق النافذة من قبل المستخدم (Popup Closed By User)
  if (
    rawCode === 'auth/popup-closed-by-user' ||
    rawMessage.includes('popup-closed-by-user')
  ) {
    return {
      code: 'auth/popup-closed-by-user',
      title: 'تم إغلاق نافذة تسجيل الدخول',
      message: 'أُغلقت نافذة التحقق من Google قبل اختيار الحساب أو تأكيد الدخول.',
      actionTip: 'اضغط على زر الدخول مجدداً مع إكمال الخطوات حتى النهاية.',
    };
  }

  // 4. تضارب طلبات النوافذ المنبثقة (Cancelled Popup Request)
  if (
    rawCode === 'auth/cancelled-popup-request' ||
    rawMessage.includes('cancelled-popup-request')
  ) {
    return {
      code: 'auth/cancelled-popup-request',
      title: 'تم إلغاء المحاولة السابقة',
      message: 'تم الضغط عدة مرات متتالية مما أدى إلى إلغاء نافذة التحقق السابقة.',
      actionTip: 'انتظر ثانية واحدة ثم اضغط على زر الدخول مرة واحدة فقط.',
    };
  }

  // 5. انقطاع الاتصال بالإنترنت أو الخادم (Network Request Failed)
  if (
    rawCode === 'auth/network-request-failed' ||
    rawMessage.includes('network-request-failed') ||
    rawMessage.includes('Network Error') ||
    rawMessage.includes('Failed to fetch')
  ) {
    return {
      code: 'auth/network-request-failed',
      title: 'تعذر الاتصال بالخادم',
      message: 'حدث انقطاع مؤقت في الاتصال بالإنترنت أو خوادم المصادقة.',
      actionTip: 'يرجى التحقق من اتصال الإنترنت، والتأكد من عدم وجود جدار ناري أو إضافة حجب تفصل الاتصال بخدمات Google.',
    };
  }

  // 6. موفر تسجيل الدخول غير مفعل في Firebase (Operation Not Allowed)
  if (
    rawCode === 'auth/operation-not-allowed' ||
    rawMessage.includes('operation-not-allowed')
  ) {
    return {
      code: 'auth/operation-not-allowed',
      title: 'طريقة تسجيل الدخول غير مفعلة',
      message: 'تسجيل الدخول عبر حساب Google غير مفعل حالياً في لوحة تحكم مشروع Firebase الخاص بك.',
      actionTip: 'يرجى فتح Firebase Console > Authentication > Sign-in method وتفعيل خيار (Google)، ثم حفظ التغييرات.',
    };
  }

  // 7. حساب مسجل مسبقاً ببيانات اعتماد مختلفة (Account Exists With Different Credential)
  if (
    rawCode === 'auth/account-exists-with-different-credential' ||
    rawMessage.includes('account-exists-with-different-credential')
  ) {
    return {
      code: 'auth/account-exists-with-different-credential',
      title: 'البريد مسجل مسبقاً بكلمة مرور',
      message: 'هذا البريد الإلكتروني مسجل بالفعل بكلمة مرور سابقة.',
      actionTip: 'يرجى إدخال كلمة المرور الخاصة بحسابك لربط حساب Google تلقائياً.',
    };
  }

  // 8. بيانات الدخول غير صحيحة (Invalid Credential / Wrong Password)
  if (
    rawCode === 'auth/invalid-credential' ||
    rawCode === 'auth/wrong-password' ||
    rawMessage.includes('invalid-credential') ||
    rawMessage.includes('wrong-password')
  ) {
    return {
      code: 'auth/invalid-credential',
      title: 'بيانات الدخول غير صحيحة',
      message: 'البريد الإلكتروني أو كلمة المرور التي أدخلتها غير متطابقة.',
      actionTip: 'تأكد من كتابة البريد وكلمة المرور بشكل صحيح مع مراعاة حالة الأحرف الإنجليزية.',
    };
  }

  // 9. البريد غير مسجل (User Not Found)
  if (
    rawCode === 'auth/user-not-found' ||
    rawMessage.includes('user-not-found')
  ) {
    return {
      code: 'auth/user-not-found',
      title: 'البريد الإلكتروني غير مسجل',
      message: 'لا يوجد أي حساب مرتبط بعنوان هذا البريد الإلكتروني.',
      actionTip: 'تأكد من صحة البريد الإلكتروني، أو قم بإنشاء حساب صيدلية جديد عبر تبويب التسجيل.',
    };
  }

  // 10. الحساب معطل (User Disabled)
  if (
    rawCode === 'auth/user-disabled' ||
    rawMessage.includes('user-disabled')
  ) {
    return {
      code: 'auth/user-disabled',
      title: 'الحساب معطل',
      message: 'تم إيقاف هذا الحساب من قِبل إدارة النظام.',
      actionTip: 'يرجى التواصل مع إدارة المنصة للاستفسار عن سبب الإيقاف وإعادة تنشيط الحساب.',
    };
  }

  // 11. عدد محاولات كبير وتجميد مؤقت (Too Many Requests)
  if (
    rawCode === 'auth/too-many-requests' ||
    rawMessage.includes('too-many-requests')
  ) {
    return {
      code: 'auth/too-many-requests',
      title: 'تم تجميد المحاولات مؤقتاً',
      message: 'تم حظر محاولات تسجيل الدخول مؤقتاً لأسباب أمنية بسبب تكرار المحاولات الخاطئة.',
      actionTip: 'يرجى الانتظار دقيقتين أو إعادة تعيين كلمة المرور.',
    };
  }

  // 12. كلمة مرور ضعيفة عند إنشاء حساب (Weak Password)
  if (
    rawCode === 'auth/weak-password' ||
    rawMessage.includes('weak-password')
  ) {
    return {
      code: 'auth/weak-password',
      title: 'كلمة المرور ضعيفة',
      message: 'كلمة المرور المدخلة قصيرة جداً أو سهلة التخمين.',
      actionTip: 'يرجى استخدام كلمة مرور مكونة من 6 خانات على الأقل تحتوي على أرقام وحروف.',
    };
  }

  // 13. البريد مسجل بالفعل عند التسجيل (Email Already in Use)
  if (
    rawCode === 'auth/email-already-in-use' ||
    rawMessage.includes('email-already-in-use')
  ) {
    return {
      code: 'auth/email-already-in-use',
      title: 'البريد مسجل مسبقاً',
      message: 'هذا البريد الإلكتروني مستخدم بالفعل في حساب آخر.',
      actionTip: 'يرجى التبديل لتبويب تسجيل الدخول وإدخال كلمة المرور أو استخدام حساب Google.',
    };
  }

  // 14. صيغة البريد غير صالحة (Invalid Email)
  if (
    rawCode === 'auth/invalid-email' ||
    rawMessage.includes('invalid-email')
  ) {
    return {
      code: 'auth/invalid-email',
      title: 'صيغة البريد غير صحيحة',
      message: 'عنوان البريد الإلكتروني المدخل غير صالح أو ينقصه رمز @ أو النطاق.',
      actionTip: 'يرجى إدخال بريد إلكتروني صالح مثل: name@example.com.',
    };
  }

  // 15. مفتاح API غير صالح (Invalid API Key)
  if (
    rawCode === 'auth/invalid-api-key' ||
    rawMessage.includes('invalid-api-key') ||
    rawMessage.includes('API key not valid')
  ) {
    return {
      code: 'auth/invalid-api-key',
      title: 'مفتاح Firebase API غير صالح',
      message: 'مفتاح الربط مع مشروع Firebase (API Key) غير صالح أو تم تقييده.',
      actionTip: 'تأكد من قيمة VITE_FIREBASE_API_KEY في ملف البيئة أو في إعدادات النشر على GitHub Secrets.',
    };
  }

  // 16. خطأ غير محدد مع الحفاظ على نص الخطأ بالكامل
  const cleanMessage = rawMessage
    .replace(/^Firebase:\s*/i, '')
    .replace(/^Error\s*\(([^)]+)\):\s*/i, '')
    .trim();

  return {
    code: rawCode || 'auth/unknown',
    title: 'تعذر إتمام تسجيل الدخول',
    message: cleanMessage || 'حدث خطأ غير متوقع أثناء معالجة طلب الدخول.',
    actionTip: 'يرجى المحاولة مرة أخرى، أو استخدام وسيلة دخول بديلة (البريد وكلمة المرور).',
  };
}
