import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Edit3,
  QrCode,
  Smartphone,
  X,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { minorToEditableString, parseMajorToMinor } from '../utils/finance';
import {
  formatSerbianAccount,
  generateIpsQrString,
} from '../utils/ipsQr';

interface MyIpsQrModalProps {
  open: boolean;
  bankAccount: string;
  recipientName: string;
  suggestedAmountMinor?: number;
  onEditAccount?: () => void;
  onClose: () => void;
}

export const MyIpsQrModal: React.FC<MyIpsQrModalProps> = ({
  open,
  bankAccount,
  recipientName,
  suggestedAmountMinor = 0,
  onEditAccount,
  onClose,
}) => {
  const { t } = useTranslation();
  const qrWrapRef = useRef<HTMLDivElement | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [purposeInput, setPurposeInput] = useState('Podeli uplata');
  const [copiedAccount, setCopiedAccount] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmountInput(
      suggestedAmountMinor > 0 ? minorToEditableString(suggestedAmountMinor) : ''
    );
    setPurposeInput('Podeli uplata');
    setCopiedAccount(false);
  }, [open, suggestedAmountMinor]);

  const parsedMinor = useMemo(() => {
    const trimmed = amountInput.trim();
    if (!trimmed) return null;
    const minor = parseMajorToMinor(trimmed);
    return minor && minor > 0 ? minor : null;
  }, [amountInput]);

  const qrString = useMemo(() => {
    if (!open || !bankAccount) return null;
    try {
      return generateIpsQrString({
        recipientAccount: bankAccount,
        recipientName,
        amountMinor: parsedMinor,
        purpose: purposeInput.trim() || 'Podeli uplata',
      });
    } catch {
      return null;
    }
  }, [open, bankAccount, recipientName, parsedMinor, purposeInput]);

  if (!open || !qrString) return null;

  const formattedAccount = formatSerbianAccount(bankAccount);

  const handleCopyAccount = async () => {
    try {
      await navigator.clipboard.writeText(formattedAccount);
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadQrImage = () => {
    const canvas = qrWrapRef.current?.querySelector('canvas');
    if (!canvas) return;

    const pad = 24;
    const out = document.createElement('canvas');
    out.width = canvas.width + pad * 2;
    out.height = canvas.height + pad * 2;
    const ctx = out.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, pad, pad);

    const url = out.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = parsedMinor
      ? `moj-ips-qr-${Math.round(parsedMinor / 100)}rsd.png`
      : 'moj-ips-qr.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-[#171C19]/50 backdrop-blur-[2px] animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-[#E8ECE9] shadow-(--shadow-modal) max-h-[94vh] flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E8ECE9] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E8F1EB] text-[#35483F] flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#171C19]">{t('ips.myQrTitle')}</h2>
              <p className="text-[11px] text-[#818A84]">{t('ips.myQrSubtitle')}</p>
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

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Official NBS IPS QR — ALWAYS pure black on pure white */}
          <div className="flex flex-col items-center">
            <div
              ref={qrWrapRef}
              className="bg-white p-4 rounded-2xl border-2 border-[#E8ECE9] shadow-xs inline-flex items-center justify-center"
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <QRCodeCanvas
                value={qrString}
                size={232}
                level="M"
                includeMargin={true}
                bgColor="#FFFFFF"
                fgColor="#000000"
              />
            </div>

            <div className="mt-3 flex items-center gap-2 text-xs text-[#476457] bg-[#E8F1EB]/70 px-3.5 py-2 rounded-xl text-center">
              <Smartphone className="w-4 h-4 shrink-0 text-[#35483F]" />
              <span>{t('ips.myQrScanHint')}</span>
            </div>
          </div>

          {/* Optional live Amount & Purpose inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-[#818A84] mb-1">
                {t('ips.myQrOptionalAmount')}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder={t('ips.myQrAmountPlaceholder')}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm font-semibold text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#818A84] mb-1">
                {t('ips.purposeLabel')}
              </label>
              <input
                type="text"
                maxLength={35}
                value={purposeInput}
                onChange={(e) => setPurposeInput(e.target.value)}
                placeholder="Podeli uplata"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm font-semibold text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
              />
            </div>
          </div>

          {/* Account Summary Card */}
          <div className="rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/70 divide-y divide-[#E8ECE9] text-sm">
            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
              <span className="text-xs text-[#818A84]">{t('ips.recipientLabel')}</span>
              <span className="font-semibold text-[#171C19] text-right truncate">
                {recipientName}
              </span>
            </div>
            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-[#818A84]">{t('ips.accountLabel')}</p>
                <p className="font-mono text-xs sm:text-sm font-semibold text-[#171C19] mt-0.5 truncate">
                  {formattedAccount}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyAccount}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#E8ECE9] text-xs font-semibold text-[#35483F] hover:bg-[#E8F1EB]/50 transition-colors"
              >
                {copiedAccount ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#16835B]" />
                    <span className="text-[#16835B]">{t('common.copied')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{t('common.copy')}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleDownloadQrImage}
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>{t('ips.saveQrImageShort')}</span>
            </button>

            {onEditAccount && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditAccount();
                }}
                className="min-h-[44px] px-3.5 py-2.5 rounded-2xl bg-white hover:bg-[#F5F7F6] border border-[#E8ECE9] text-[#606A64] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{t('common.edit')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
