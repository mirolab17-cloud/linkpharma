import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Copy, Check } from 'lucide-react';
import { recoverFromChunkLoadError } from '../utils/lazyImport';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      copied: false,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  private handleReload = () => {
    void recoverFromChunkLoadError();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.hash = '#/';
    void recoverFromChunkLoadError();
  };

  private isChunkError = () => /dynamically imported module|loading chunk|failed to fetch|importing a module script|module script/i.test(this.state.error?.message || '');

  private handleCopyError = () => {
    const errorText = `${this.state.error?.message || ''}\n\n${this.state.error?.stack || ''}\n\n${this.state.errorInfo?.componentStack || ''}`;
    navigator.clipboard.writeText(errorText);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen bg-slate-50 flex items-center justify-center p-4 selection:bg-emerald-500 selection:text-white"
        >
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 text-center">
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200 shadow-xs">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">
              {this.state.error?.message?.toLowerCase().includes('api-key') || this.state.error?.message?.toLowerCase().includes('invalid-api-key')
                ? 'إعدادات Firebase API Key غير مكتملة'
                : this.isChunkError() ? 'تم تحديث المنصة — نحدّث النسخة بأمان' : 'حدث خطأ غير متوقع'}
            </h1>

            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              {this.state.error?.message?.toLowerCase().includes('api-key') || this.state.error?.message?.toLowerCase().includes('invalid-api-key')
                ? 'مفتاح Firebase API Key مفقود أو غير صالح. يرجى التأكد من ضبط متغيرات البيئة أو إعدادات الربط للتشغيل بنجاح.'
                : this.isChunkError() ? 'تم نشر تحديث جديد للمنصة. اضغط إعادة تحميل لتنظيف الملفات القديمة تلقائياً دون فقدان حسابك أو بياناتك.' : 'نعتذر، واجه التطبيق مشكلة أثناء تحميل هذه الصفحة. يمكنك إعادة تحميل الصفحة أو العودة للصفحة الرئيسية للمتابعة.'}
            </p>

            {this.state.error && (
              <div className="mb-6 text-right">
                <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
                  <span>تفاصيل الخطأ:</span>
                  <button
                    onClick={this.handleCopyError}
                    className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-700 font-medium cursor-pointer"
                  >
                    {this.state.copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>تم النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>نسخ الخطأ</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-slate-900 text-slate-200 text-xs font-mono p-3 rounded-lg overflow-x-auto max-h-32 text-left dir-ltr">
                  {this.isChunkError() ? 'تم اكتشاف ملف قديم من نسخة سابقة وسيتم تنظيفه تلقائياً.' : (this.state.error.message || 'Unknown error')}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleReload}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-sm font-semibold transition-colors shadow-xs cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{this.isChunkError() ? 'تحديث المنصة' : 'إعادة تحميل'}</span>
              </button>

              <button
                onClick={this.handleGoHome}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors border border-slate-200 cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>الصفحة الرئيسية</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
