// src/pages/admin/Suppliers.tsx
import React, { useState, useEffect } from 'react';
import { 
  getSuppliers, 
  saveSupplier, 
  deleteSupplier 
} from '../../services/dataStorage';
import { Supplier } from '../../types';
import { isValidPhone, cleanPhone, createWhatsAppLink } from '../../utils/phone';
import { useToastStore } from '../../store/useToastStore';
import { 
  Truck, 
  Plus, 
  Edit, 
  Trash2, 
  MessageCircle, 
  FileSpreadsheet, 
  Clock, 
  CheckCircle2, 
  PauseCircle,
  MapPin,
  FileText
} from 'lucide-react';
import { Table, Column } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { formatGregorianDate } from '../../utils/formatDate';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { Spinner } from '../../components/Loader';

export const Suppliers: React.FC = () => {
  const { success, error } = useToastStore();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  // Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'active' | 'paused'>('active');
  const [submitting, setSubmitting] = useState(false);

  // Delete Confirm
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [targetDeleteId, setTargetDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getSuppliers();
      setSuppliers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setName('');
    setWhatsapp('');
    setAddress('');
    setNotes('');
    setStatus('active');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (sup: Supplier) => {
    setEditingSupplier(sup);
    setName(sup.name);
    setWhatsapp(sup.whatsapp);
    setAddress(sup.address);
    setNotes(sup.notes || '');
    setStatus(sup.status);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !whatsapp.trim() || !address.trim()) {
      error('يرجى تعبئة الحقول الأساسية المطلوبة.');
      return;
    }

    if (!isValidPhone(whatsapp)) {
      error('رقم الواتساب غير صالح. أدخل الرقم بصيغة دولية للأرقام فقط (8-15 رقماً بدون +).');
      return;
    }

    setSubmitting(true);
    try {
      const cleanedPhone = cleanPhone(whatsapp);
      await saveSupplier({
        id: editingSupplier ? editingSupplier.id : undefined,
        name: name.trim(),
        whatsapp: cleanedPhone,
        address: address.trim(),
        notes: notes.trim(),
        status,
        importTemplate: editingSupplier?.importTemplate,
        lastPriceUpdate: editingSupplier?.lastPriceUpdate,
        createdAt: editingSupplier ? editingSupplier.createdAt : new Date().toISOString(),
      });

      success(editingSupplier ? 'تم تعديل بيانات المورد بنجاح' : 'تمت إضافة المورد بنجاح');
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      error('حدث خطأ أثناء الحفظ: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (id: string) => {
    setTargetDeleteId(id);
    setIsConfirmOpen(true);
  };

  const executeDelete = async () => {
    if (!targetDeleteId) return;
    try {
      await deleteSupplier(targetDeleteId);
      success('تم حذف المورد بنجاح.');
      setIsConfirmOpen(false);
      await loadData();
    } catch (err: any) {
      error('تعذر الحذف: ' + err.message);
    }
  };

  // زر اختبار محادثة واتساب
  const handleTestWhatsApp = (sup: Supplier) => {
    const testMsg = `السلام عليكم ورحمة الله، رسالة تجريبية من منصة مقارنة أسعار الأدوية إلى مستودع (${sup.name}).`;
    const link = createWhatsAppLink(sup.whatsapp, testMsg);
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const columns: Column<Supplier>[] = [
    {
      key: 'name',
      header: 'اسم المورد / المستودع',
      sortable: true,
      render: (item) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-800">{item.name}</span>
            {item.importTemplate ? (
              <span className="px-2 py-0.5 bg-emerald-50 text-[#0f9d7a] border border-emerald-200 text-[10px] font-bold rounded-md flex items-center gap-1">
                <FileSpreadsheet className="w-3 h-3" />
                <span>قالب محفوظ</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-400 text-[10px] font-bold rounded-md">
                بدون قالب
              </span>
            )}
          </div>
          <span className="text-xs text-slate-400 block mt-0.5">{item.address}</span>
        </div>
      ),
    },
    {
      key: 'whatsapp',
      header: 'رقم الواتساب',
      render: (item) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-slate-700" dir="ltr">
            +{item.whatsapp}
          </span>
          <button
            onClick={() => handleTestWhatsApp(item)}
            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md transition"
            title="فتح محادثة واتساب تجريبية"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (item) => (
        <span
          className={`px-2.5 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5 w-fit ${
            item.status === 'active'
              ? 'bg-emerald-50 text-[#0f9d7a] border border-emerald-200'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          {item.status === 'active' ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <PauseCircle className="w-3.5 h-3.5" />
          )}
          <span>{item.status === 'active' ? 'نشط' : 'متوقف'}</span>
        </span>
      ),
    },
    {
      key: 'lastPriceUpdate',
      header: 'آخر تحديث أسعار',
      render: (item) => (
        <span className="text-xs text-slate-500 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>
            {item.lastPriceUpdate
              ? formatGregorianDate(item.lastPriceUpdate)
              : 'لم تُرفع أسعار بعد'}
          </span>
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      render: (item) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenEdit(item)}
            className="p-1.5 text-slate-500 hover:text-[#0f9d7a] hover:bg-emerald-50 rounded-lg transition"
            title="تعديل"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => confirmDelete(item.id)}
            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
            title="حذف"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Truck className="w-6 h-6 text-[#0f9d7a]" />
            <span>الموردون والمستودعات (Suppliers)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            إدارة مستودعات الأدوية، أرقام واتساب الطلبيات، وقوالب ربط ملفات الأسعار
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 bg-[#0f9d7a] hover:bg-[#0b7a5e] text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-2 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة مورد جديد</span>
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner text="جاري جلب الموردين..." />
        </div>
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon={<Truck className="w-8 h-8" />}
          title="لا يوجد موردون مسجلون"
          description="أضف أول مستودع لتتمكن من رفع قوائم الأسعار واستقبال طلبيات الصيدليات."
          actionText="إضافة مورد الآن"
          onAction={handleOpenAdd}
        />
      ) : (
        <Table
          columns={columns}
          data={suppliers}
          keyExtractor={(item) => item.id}
          mobileCardRender={(item) => (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-800">{item.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{item.address}</p>
                </div>
                {item.importTemplate && (
                  <span className="px-2 py-0.5 bg-emerald-50 text-[#0f9d7a] text-[10px] font-bold rounded-md flex items-center gap-1">
                    <FileSpreadsheet className="w-3 h-3" />
                    <span>قالب</span>
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                <button
                  onClick={() => handleTestWhatsApp(item)}
                  className="flex items-center gap-1.5 text-emerald-700 font-bold"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span dir="ltr">+{item.whatsapp}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEdit(item)}
                    className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => confirmDelete(item.id)}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        />
      )}

      {/* نافذة الإضافة والتعديل */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSupplier ? 'تعديل بيانات مورد' : 'إضافة مورد / مستودع جديد'}
        maxWidth="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="supplier-form"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold text-white bg-[#0f9d7a] hover:bg-[#0b7a5e] rounded-xl shadow-xs"
            >
              {submitting ? 'جاري الحفظ...' : 'حفظ المورد'}
            </button>
          </>
        }
      >
        <form id="supplier-form" onSubmit={handleSave} className="space-y-4 text-right">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              اسم المستودع / المورد <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: مستودع المتحدة للأدوية"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              رقم الواتساب لاستقبال الطلبيات <span className="text-rose-500">*</span>
            </label>
            <input
              type="tel"
              required
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="966501112233"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a]"
              dir="ltr"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              أدخل الأرقام فقط بالصيغة الدولية بدون مسافات أو علامة + (مثال: 966501112233)
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              العنوان / المستودع <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="مثال: الرياض - المنطقة الصناعية الثانية"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              حالة المورد في النظام
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'paused')}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a] bg-white"
            >
              <option value="active">نشط (تظهر أسعاره وتُرسل إليه الطلبيات)</option>
              <option value="paused">متوقف مؤقتاً</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">ملاحظات إضافية</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="شروط التوصيل، الحد الأدنى للطلب، أوقات الاستلام..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-[#0f9d7a]"
            />
          </div>
        </form>
      </Modal>

      {/* تأكيد الحذف */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={executeDelete}
        title="تأكيد حذف المورد"
        message="هل أنت متأكد من رغبتك في حذف هذا المورد؟"
        confirmText="نعم، حذف المورد"
      />
    </div>
  );
};
