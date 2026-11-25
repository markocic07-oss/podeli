import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  formatSerbianAccount,
  parseAndValidateSerbianAccount,
} from '../utils/ipsQr';

interface BankAccountQuickModalProps {
  open: boolean;
  initialAccount?: string | null;
  initialRecipientName?: string | null;
  defaultRecipientName: string;
  onSave: (bankAccount: string | null, bankRecipientName: string | null) => Promise<void>;
  onClose: () => void;
}

export const BankAccountQuickModal: React.FC<BankAccountQuickModalProps> = ({
  open,
  initialAccount,
  initialRecipientName,
  defaultRecipientName,
  onSave,
  onClose,
}) => {
  const { t } = useTranslation();
  const [accountInput, setAccountInput] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAccountInput(initialAccount ? formatSerbianAccount(initialAccount) : '');
    setRecipientName(initialRecipientName || defaultRecipientName);
    setError(null);
  }, [open, initialAccount, initialRecipientName, defaultRecipientName]);

  if (!open) return null;

  const trimmed = accountInput.trim();
  const liveCheck = trimmed ? parseAndValidateSerbianAccount(trimmed) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!trimmed) {
      // Allow clearing bank account
      setSaving(true);
      try {
        await onSave(null, null);
        onClose();
      } catch {
        setError(t('app.errorGeneric'));
      } finally {
        setSaving(false);
      }
      return;
    }

    const check = parseAndValidateSerbianAccount(trimmed);
    if (!check.valid || !check.normalized) {
      setError(t('ips.invalidAccountError'));
      return;
    }

    setSaving(true);
    try {
      const cleanName = recipientName.trim().slice(0, 70) || defaultRecipientName;
      await onSave(check.normalized, cleanName);
      onClose();
    } catch {
      setError(t('app.errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-[#171C19]/50 backdrop-blur-[2px] animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-[#E8ECE9] shadow-(--shadow-modal) overflow-hidden animate-scale-in">
        <div className="px-5 py-4 border-b border-[#E8ECE9] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E8F1EB] text-[#35483F] flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#171C19]">{t('ips.bankFormTitle')}</h2>
              <p className="text-[11px] text-[#818A84]">{t('ips.bankFormSubtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 rounded-xl text-[#818A84] hover:bg-[#F5F7F6]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-2xl bg-[#FCEEEE] text-[#C94A4A] text-xs font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#171C19] mb-1.5">
              {t('ips.accountLabel')}
            </label>
            <input
              type="text"
              inputMode="text"
              value={accountInput}
              onChange={(e) => {
                setAccountInput(e.target.value);
                setError(null);
              }}
              placeholder="160-123456-90"
              className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E8ECE9] bg-[#F5F7F6]/60 font-mono text-base sm:text-sm text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
            />
            <p className="text-[11px] text-[#818A84] mt-1">{t('ips.accountFormatHint')}</p>
            {liveCheck?.valid && liveCheck.normalized && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#16835B] bg-[#E6F4EE] px-2.5 py-1 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{formatSerbianAccount(liveCheck.normalized)}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#171C19] mb-1.5">
              {t('ips.recipientNameLabel')}
            </label>
            <input
              type="text"
              maxLength={70}
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder={defaultRecipientName}
              className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-[#E8ECE9] text-sm font-semibold text-[#606A64]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold disabled:opacity-60"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
