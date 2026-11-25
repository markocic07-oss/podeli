import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171C19]/45 backdrop-blur-[2px] animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-(--shadow-modal) border border-[#E8ECE9] animate-scale-in">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            {variant === 'danger' && (
              <div className="w-10 h-10 rounded-2xl bg-[#FCEEEE] text-[#C94A4A] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
            )}
            <div>
              <h3 id="confirm-dialog-title" className="text-lg font-semibold text-[#171C19]">
                {title}
              </h3>
              <p className="text-sm text-[#818A84] mt-1.5 leading-relaxed">{description}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="text-[#818A84] hover:text-[#171C19] p-1 rounded-lg transition-colors"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2.5 mt-6">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-[#171C19] bg-[#F5F7F6] hover:bg-[#E8ECE9] transition-colors disabled:opacity-50"
          >
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
              variant === 'danger'
                ? 'bg-[#C94A4A] hover:bg-[#B33D3D]'
                : 'bg-[#35483F] hover:bg-[#2B3B33]'
            }`}
          >
            {loading ? t('common.saving') : confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};
