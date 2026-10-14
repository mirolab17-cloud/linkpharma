from pathlib import Path

root = Path('/home/ubuntu/linkpharma')

def edit(path, fn):
    p = root / path
    text = p.read_text()
    updated = fn(text)
    if updated == text:
        raise SystemExit(f'No change made: {path}')
    p.write_text(updated)

# Theme: support automatic/system dark mode while preserving existing dark utility classes.
edit('src/store/useThemeStore.ts', lambda s: s.replace("export type ThemeMode = 'light';", "export type ThemeMode = 'light' | 'dark' | 'system';")
    .replace("function enforceDaytimeTheme() {\n  if (typeof document !== 'undefined') {\n    document.documentElement.classList.remove('dark');\n    document.documentElement.style.colorScheme = 'light';\n  }\n  if (typeof localStorage !== 'undefined') {\n    localStorage.removeItem('pharma_theme');\n  }\n}", """function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

function storedTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system';
  const saved = localStorage.getItem('pharma_theme');
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
}""")
    .replace("theme: 'light',\n  isDark: false,", "theme: 'system',\n  isDark: false,")
    .replace("  setTheme: () => {\n    enforceDaytimeTheme();\n    set({ theme: 'light', isDark: false });\n  },\n\n  toggleTheme: () => {\n    enforceDaytimeTheme();\n    set({ theme: 'light', isDark: false });\n  },\n\n  initializeTheme: () => {\n    enforceDaytimeTheme();\n    set({ theme: 'light', isDark: false });\n  },", """  setTheme: (theme) => {
    localStorage.setItem('pharma_theme', theme);
    applyTheme(theme);
    set({ theme, isDark: theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) });
  },

  toggleTheme: () => {
    const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    localStorage.setItem('pharma_theme', next);
    applyTheme(next);
    set({ theme: next, isDark: next === 'dark' });
  },

  initializeTheme: () => {
    const theme = storedTheme();
    applyTheme(theme);
    set({ theme, isDark: document.documentElement.classList.contains('dark') });
  },"""))

# Auth profiles: new accounts are incomplete until real details are entered.
edit('src/store/useAuthStore.ts', lambda s: s.replace("import { translateAuthError, TranslatedAuthError } from '../utils/authErrorTranslator';", "import { translateAuthError, TranslatedAuthError } from '../utils/authErrorTranslator';\nimport { isProfileComplete } from '../utils/profile';")
    .replace("profileComplete: true,\n                createdAt", "profileComplete: isRuntimeAdmin,\n                createdAt")
    .replace("profileComplete: true,\n          createdAt", "profileComplete: false,\n          createdAt")
    .replace("profileComplete: true,\n        createdAt", "profileComplete: isRuntimeAdmin,\n        createdAt")
    .replace("const profile = userSnap.data() as UserProfile;", "const profile = userSnap.data() as UserProfile;\n              // لا نعتبر الاسم الافتراضي أو الجوال غير المحلي ملفاً مكتملاً.\n              profile.profileComplete = profile.role === 'admin' ? true : isProfileComplete(profile);")
)

# Profile form: Saudi local phone, real pharmacy/pharmacist name, no SMS verification.
edit('src/pages/pharmacy/Profile.tsx', lambda s: s.replace("import { isValidPhone, cleanPhone } from '../../utils/phone';", "import { normalizeSaudiLocalPhone, isValidSaudiLocalPhone } from '../../utils/profile';")
    .replace("if (!isValidPhone(phone)) {\n      useToastStore.getState().error('رقم الجوال غير صالح. يجب أن يحتوي على 8 إلى 15 رقماً بالصيغة الدولية.');", "if (!isValidSaudiLocalPhone(phone)) {\n      useToastStore.getState().error('رقم الجوال غير صالح. أدخل رقماً يبدأ بـ 05 ويتكون من 10 أرقام، مثل 05XXXXXXXX.');")
    .replace("const cleaned = cleanPhone(phone);", "const cleaned = normalizeSaudiLocalPhone(phone);")
    .replace("اسم الصيدلية <span", "اسم الصيدلية أو الصيدلي <span")
    .replace("placeholder=\"صيدلية الشفاء الجديدة\"", "placeholder=\"صيدلية الشفاء أو د. محمد\"")
    .replace("placeholder=\"966501234567\"", "placeholder=\"05XXXXXXXX\"")
    .replace("أدخل الرقم بالصيغة الدولية للأرقام بدون مسافات أو علامة + (مثال: 966501234567)", "أدخل رقماً محلياً يبدأ بـ 05 ويتكون من 10 أرقام. لا يوجد تحقق برسالة SMS حالياً.")
    .replace("يرجى إكمال بيانات الصيدلية (الاسم، العنوان، ورقم الجوال)", "يرجى إكمال بيانات الصيدلية (اسم الصيدلية أو الصيدلي، العنوان، ورقم الجوال المحلي)")
)

# Order guard must use exact profile rules, not only truthy fields.
edit('src/pages/pharmacy/Cart.tsx', lambda s: s.replace("import { ConfirmDialog } from '../../components/ConfirmDialog';", "import { ConfirmDialog } from '../../components/ConfirmDialog';\nimport { isProfileComplete, triggerHaptic, playSuccessSound } from '../../utils/profile';")
    .replace("if (!user.profileComplete || !user.pharmacyName || !user.phone || !user.address) {", "if (!isProfileComplete(user)) {")
    .replace("if (!user?.profileComplete) {\n      warning('يرجى استكمال بيانات ملف الصيدلية أولاً.');", "if (!isProfileComplete(user)) {\n      warning('لا يمكن إرسال الطلبية قبل إكمال اسم الصيدلية أو الصيدلي والعنوان ورقم جوال يبدأ بـ 05 ويتكون من 10 أرقام.');")
    .replace("    setSendingSupplierId(supplierId);", "    setSendingSupplierId(supplierId);\n    triggerHaptic([10, 35, 10]);")
    .replace("      success(`تم تسجيل طلبية (${group.supplierName}) وفتح محادثة واتساب لإرسالها.`);", "      triggerHaptic([20, 50, 20]);\n      playSuccessSound();\n      success(`تم تسجيل طلبية (${group.supplierName}) وفتح محادثة واتساب لإرسالها.`);")
)

# Navbar: visible Google name and a compact theme control.
edit('src/components/Navbar.tsx', lambda s: s.replace("  X\n} from 'lucide-react';", "  X,\n  Moon,\n  Sun\n} from 'lucide-react';")
    .replace("import { PWAInstallButton } from './PWAInstallButton';", "import { PWAInstallButton } from './PWAInstallButton';\nimport { useThemeStore } from '../store/useThemeStore';")
    .replace("  const { user, logout } = useAuthStore();", "  const { user, logout } = useAuthStore();\n  const { isDark, toggleTheme } = useThemeStore();")
    .replace("          {/* زر تثبيت PWA */}", "          <button type=\"button\" onClick={toggleTheme} className=\"p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition\" aria-label={isDark ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'} title={isDark ? 'الوضع النهاري' : 'الوضع الليلي'}>\n            {isDark ? <Sun className=\"w-4 h-4\" /> : <Moon className=\"w-4 h-4\" />}\n          </button>\n\n          {/* زر تثبيت PWA */}")
    .replace("{user.pharmacyName || user.name}", "{user.pharmacyName && user.pharmacyName !== 'صيدليتي' ? user.pharmacyName : user.name}")
)

# Login: remember-me, online feedback, WhatsApp support, privacy copy.
edit('src/pages/auth/Login.tsx', lambda s: s.replace("  ArrowRight,\n  Send", "  ArrowRight,\n  Send,\n  MessageCircle,\n  WifiOff")
    .replace("  const [showPassword, setShowPassword] = useState(false);", "  const [showPassword, setShowPassword] = useState(false);\n  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('pharma_remember_me') !== 'off');\n  const [isOnline, setIsOnline] = useState(() => navigator.onLine);")
    .replace("  // إذا كان المستخدم مسجلاً بالفعل", "  useEffect(() => {\n    const online = () => setIsOnline(true);\n    const offline = () => setIsOnline(false);\n    window.addEventListener('online', online); window.addEventListener('offline', offline);\n    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };\n  }, []);\n\n  useEffect(() => {\n    localStorage.setItem('pharma_remember_me', rememberMe ? 'on' : 'off');\n  }, [rememberMe]);\n\n  // إذا كان المستخدم مسجلاً بالفعل")
    .replace("{/* شبكة العرض الرئيسية */}", "{!isOnline && <div className=\"mb-4 max-w-6xl w-full mx-auto rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-xs font-bold flex items-center gap-2\"><WifiOff className=\"w-4 h-4\" /> لا يوجد اتصال بالإنترنت. تحقق من الشبكة ثم أعد المحاولة.</div>}\n      {/* شبكة العرض الرئيسية */}")
    .replace("{/* نقاط الأمان والموثوقية */}", "<div className=\"mt-4 p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-2\">\n              <input id=\"remember-me\" type=\"checkbox\" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className=\"w-4 h-4 accent-emerald-600\" />\n              <label htmlFor=\"remember-me\" className=\"text-xs font-bold text-slate-700\">تذكرني على هذا الجهاز</label>\n            </div>\n            <p className=\"mt-3 text-[11px] text-slate-500 leading-relaxed text-center\">بدخولك أنت توافق على استخدام بيانات الحساب لتجهيز الطلبات فقط. لا نشارك بياناتك خارج أطراف التوريد اللازمة.</p>\n            {/* نقاط الأمان والموثوقية */}")
    .replace("    </div>\n  );\n};", "    </div>\n      <a href=\"https://wa.me/?text=مرحباً، أحتاج مساعدة في تسجيل الدخول إلى LinkPharma\" target=\"_blank\" rel=\"noreferrer\" className=\"fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white px-4 py-3 text-xs font-black shadow-lg hover:scale-105 transition-transform\" aria-label=\"مساعدة عبر واتساب\">\n        <MessageCircle className=\"w-4 h-4\" /> مساعدة واتساب\n      </a>\n  );\n};", 1)
)

# Global styles for dark mode and smoother route transitions.
edit('src/index.css', lambda s: s + """

html { scroll-behavior: smooth; }
body { transition: background-color .25s ease, color .25s ease; }
.dark body { background: #020617; }
button, a, input, select, textarea { -webkit-tap-highlight-color: transparent; }
@media (max-width: 640px) { button, a { min-height: 44px; } }
""")

# Routes manifest.
(root / 'public/manus-routes.json').write_text('{"routes":[{"path":"/","title":"الرئيسية"},{"path":"/login","title":"تسجيل الدخول"},{"path":"/app/prices","title":"مقارنة الأسعار"},{"path":"/app/suppliers","title":"الموردون"},{"path":"/app/cart","title":"السلة"},{"path":"/app/orders","title":"طلباتي"},{"path":"/app/profile","title":"الملف الشخصي"},{"path":"/admin","title":"الإدارة"}]}')
print('v3 changes applied')
