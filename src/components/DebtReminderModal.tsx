import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Check,
  Copy,
  Dices,
  MessageCircle,
  Send,
  Share2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../contexts/ToastContext';
import type { AppLanguage, CurrencyCode } from '../types';
import { formatCurrency } from '../utils/finance';
import { formatSerbianAccount, isValidSerbianAccount } from '../utils/ipsQr';
import { buildGroupShareUrl, copyToClipboard } from '../utils/share';
import { getAppBaseUrl } from '../lib/supabase';
import {
  buildReminderMessage,
  buildViberShareUrl,
  buildWhatsAppShareUrl,
  getReminderVariantCount,
  type ReminderTone,
} from '../utils/reminderTemplates';

export interface DebtReminderData {
  debtorName: string;
  amountMinor: number;
  currency: CurrencyCode;
  groupName: string;
  shareToken: string;
  creditorBankAccount?: string | null;
}

interface DebtReminderModalProps {
  open: boolean;
  data: DebtReminderData | null;
  onClose: () => void;
}

const TONES: ReminderTone[] = ['polite', 'friendly', 'urgent_joke'];

export const DebtReminderModal: React.FC<DebtReminderModalProps> = ({
  open,
  data,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';
  const { showToast } = useToast();

  const [tone, setTone] = useState<ReminderTone>('friendly');
  const [variantIndex, setVariantIndex] = useState(0);
  const [includeBankAccount, setIncludeBankAccount] = useState(true);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const hasValidBank = Boolean(
    data?.creditorBankAccount && isValidSerbianAccount(data.creditorBankAccount)
  );

  const formattedBank = useMemo(() => {
    if (!hasValidBank || !data?.creditorBankAccount) return null;
    return formatSerbianAccount(data.creditorBankAccount);
  }, [hasValidBank, data?.creditorBankAccount]);

  const amountFormatted = useMemo(() => {
    if (!data) return '';
    return formatCurrency(data.amountMinor, data.currency, lang, {
      compactZeroDecimals: true,
    });
  }, [data, lang]);

  const shareUrl = useMemo(() => {
    if (!data) return '';
    return data.shareToken ? buildGroupShareUrl(data.shareToken) : getAppBaseUrl();
  }, [data]);

  // Reset defaults when opening for a new debt
  useEffect(() => {
    if (!open || !data) return;
    setTone('friendly');
    setVariantIndex(0);
    setIncludeBankAccount(hasValidBank);
    setCopied(false);
  }, [open, data, hasValidBank]);

  // Re-generate editable message whenever tone, variant, or bank toggle changes
  useEffect(() => {
    if (!open || !data) return;
    setMessage(
      buildReminderMessage({
        tone,
        variantIndex,
        debtorName: data.debtorName,
        amountFormatted,
        groupName: data.groupName,
        shareUrl,
        bankAccountFormatted: formattedBank,
        includeBankAccount: hasValidBank && includeBankAccount,
      })
    );
  }, [
    open,
    data,
    tone,
    variantIndex,
    amountFormatted,
    shareUrl,
    formattedBank,
    hasValidBank,
    includeBankAccount,
  ]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !data) return null;

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleCycleVariant = () => {
    const count = getReminderVariantCount(tone);
    setVariantIndex((prev) => (prev + 1) % count);
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(message);
    if (ok) {
      setCopied(true);
      showToast(t('reminder.copiedToast'), 'success');
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleNativeShare = async () => {
    if (!canNativeShare) return;
    try {
      await navigator.share({
        title: t('reminder.modalTitle', { name: data.debtorName }),
        text: message,
      });
    } catch {
      // User dismissed share sheet
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#171C19]/50 backdrop-blur-[2px] animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full sm:max-w-md rounded-3xl border border-[#E8ECE9] shadow-(--shadow-modal) max-h-[88dvh] flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-[#E8ECE9] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#E8F1EB] text-[#35483F] flex items-center justify-center shrink-0">
              <Bell className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-[#171C19] truncate">
                {t('reminder.modalTitle', { name: data.debtorName })}
              </h2>
              <p className="text-xs text-[#818A84] truncate">
                {amountFormatted} • {data.groupName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 rounded-xl text-[#818A84] hover:bg-[#F5F7F6] shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto overscroll-contain flex-1 space-y-3">
          {/* Tone Selector Pills */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#606A64]">
                {t('reminder.toneLabel')}
              </span>
              <button
                type="button"
                onClick={handleCycleVariant}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F5F7F6] hover:bg-[#E8F1EB] text-[#35483F] text-xs font-semibold transition-colors"
              >
                <Dices className="w-3.5 h-3.5" />
                <span>{t('reminder.anotherMessage')}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#F5F7F6] rounded-2xl border border-[#E8ECE9]">
              {TONES.map((item) => {
                const active = tone === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setTone(item);
                      setVariantIndex(0);
                    }}
                    className={`min-h-[36px] px-2 py-1.5 rounded-xl text-xs font-semibold transition-all truncate ${
                      active
                        ? 'bg-[#35483F] text-white shadow-xs'
                        : 'text-[#606A64] hover:text-[#171C19]'
                    }`}
                  >
                    {t(`reminder.tones.${item}`)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chat-bubble Editable Message */}
          <div className="rounded-2xl rounded-tl-md bg-[#E8F1EB]/60 border border-[#35483F]/15 p-3">
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-label={t('reminder.messageLabel')}
              className="w-full bg-transparent text-sm text-[#171C19] leading-relaxed resize-none focus:outline-none"
            />
          </div>

          {/* Smart Bank Account Toggle (only if creditor has saved bank_account) */}
          {hasValidBank && (
            <label className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-2xl bg-[#F5F7F6] border border-[#E8ECE9] cursor-pointer">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#171C19]">
                  {t('reminder.includeBankToggle')}
                </p>
                {formattedBank && (
                  <p className="text-[11px] font-mono text-[#818A84] truncate mt-0.5">
                    {formattedBank}
                  </p>
                )}
              </div>
              <input
                type="checkbox"
                checked={includeBankAccount}
                onChange={(e) => setIncludeBankAccount(e.target.checked)}
                className="w-4 h-4 accent-[#35483F] rounded shrink-0"
              />
            </label>
          )}
        </div>

        {/* Fixed Bottom 1-Click Share Actions (always visible without scrolling) */}
        <div className="px-4 sm:px-5 py-3.5 border-t border-[#E8ECE9] bg-white space-y-2 shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <a
              href={buildWhatsAppShareUrl(message)}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-3 py-2 rounded-2xl bg-[#25D366] hover:bg-[#1FB858] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shadow-2xs"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp</span>
            </a>

            <a
              href={buildViberShareUrl(message)}
              className="min-h-[44px] px-3 py-2 rounded-2xl bg-[#7360F2] hover:bg-[#614EE0] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shadow-2xs"
            >
              <Send className="w-4 h-4" />
              <span>Viber</span>
            </a>
          </div>

          <div className={`grid gap-2 ${canNativeShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              type="button"
              onClick={handleCopy}
              className="min-h-[42px] px-3 py-2 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>{t('common.copied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>{t('reminder.copyMessage')}</span>
                </>
              )}
            </button>

            {canNativeShare && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="min-h-[42px] px-3 py-2 rounded-2xl bg-white hover:bg-[#F5F7F6] border border-[#E8ECE9] text-[#171C19] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Share2 className="w-4 h-4 text-[#35483F]" />
                <span>{t('reminder.otherApps')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
