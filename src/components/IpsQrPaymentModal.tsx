import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  QrCode,
  Smartphone,
  X,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import type { AppLanguage } from '../types';
import { formatCurrency } from '../utils/finance';
import {
  formatSerbianAccount,
  generateIpsQrString,
} from '../utils/ipsQr';

export interface IpsQrPaymentData {
  recipientAccount: string;
  recipientName: string;
  amountMinor: number;
  groupName: string;
  receiverId: string;
  /** Optional note when converted from EUR/BAM to RSD for Serbian NBS IPS QR */
  convertedFromLabel?: string;
}

interface IpsQrPaymentModalProps {
  open: boolean;
  data: IpsQrPaymentData | null;
  onMarkAsPaid: () => void;
  onClose: () => void;
}

export const IpsQrPaymentModal: React.FC<IpsQrPaymentModalProps> = ({
  open,
  data,
  onMarkAsPaid,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';
  const qrWrapRef = useRef<HTMLDivElement | null>(null);
  const [copiedField, setCopiedField] = useState<'account' | 'amount' | null>(null);

  const purpose = useMemo(() => {
    if (!data) return '';
    return `Podeli - ${data.groupName}`.slice(0, 35).trim();
  }, [data]);

  const qrString = useMemo(() => {
    if (!data) return null;
    try {
      return generateIpsQrString({
        recipientAccount: data.recipientAccount,
        recipientName: data.recipientName,
        amountMinor: data.amountMinor,
        purpose,
      });
    } catch {
      return null;
    }
  }, [data, purpose]);

  if (!open || !data || !qrString) return null;

  const formattedAccount = formatSerbianAccount(data.recipientAccount);
  const formattedAmount = formatCurrency(data.amountMinor, 'RSD', lang);
  const copyableAmount = `${Math.floor(data.amountMinor / 100)},${String(
    data.amountMinor % 100
  ).padStart(2, '0')}`;

  const handleCopy = async (text: string, field: 'account' | 'amount') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField((prev) => (prev === field ? null : prev)), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadQrImage = () => {
    const canvas = qrWrapRef.current?.querySelector('canvas');
    if (!canvas) return;

    // Add extra white padding around the canvas so banking gallery scanners read it reliably
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
    a.download = `podeli-ips-qr-${Math.round(data.amountMinor / 100)}rsd.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#171C19]/50 backdrop-blur-[2px] animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white w-full sm:max-w-md rounded-3xl border border-[#E8ECE9] shadow-(--shadow-modal) max-h-[88dvh] flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E8ECE9] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E8F1EB] text-[#35483F] flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#171C19]">{t('ips.modalTitle')}</h2>
              <p className="text-[11px] text-[#818A84]">{t('ips.modalSubtitle')}</p>
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
          {/* Official NBS IPS QR Code — ALWAYS pure black on pure white with quiet zone */}
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
              <span>{t('ips.scanInstruction')}</span>
            </div>
          </div>

          {/* Payment Details */}
          <div className="rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/70 divide-y divide-[#E8ECE9] text-sm">
            {/* Recipient */}
            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
              <span className="text-xs text-[#818A84]">{t('ips.recipientLabel')}</span>
              <span className="font-semibold text-[#171C19] text-right truncate">
                {data.recipientName}
              </span>
            </div>

            {/* Account Number + Copy */}
            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-[#818A84]">{t('ips.accountLabel')}</p>
                <p className="font-mono text-xs sm:text-sm font-semibold text-[#171C19] mt-0.5 truncate">
                  {formattedAccount}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(formattedAccount, 'account')}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#E8ECE9] text-xs font-semibold text-[#35483F] hover:bg-[#E8F1EB]/50 transition-colors"
              >
                {copiedField === 'account' ? (
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

            {/* Amount + Copy */}
            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-[#818A84]">{t('ips.amountLabel')}</p>
                <p className="text-base font-bold text-[#35483F] tabular-nums mt-0.5">
                  {formattedAmount}
                </p>
                {data.convertedFromLabel && (
                  <p className="text-[11px] text-[#818A84] mt-0.5">
                    {data.convertedFromLabel}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleCopy(copyableAmount, 'amount')}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#E8ECE9] text-xs font-semibold text-[#35483F] hover:bg-[#E8F1EB]/50 transition-colors"
              >
                {copiedField === 'amount' ? (
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

            {/* Purpose */}
            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
              <span className="text-xs text-[#818A84]">{t('ips.purposeLabel')}</span>
              <span className="text-xs font-semibold text-[#171C19] text-right truncate">
                {purpose}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={handleDownloadQrImage}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-white hover:bg-[#F5F7F6] border border-[#E8ECE9] text-[#35483F] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>{t('ips.saveQrImage')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onMarkAsPaid();
              }}
              className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{t('ips.paidMarkSettled')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
