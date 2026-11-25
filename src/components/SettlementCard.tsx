import React from 'react';
import { ArrowRight, Banknote, Building2, Check, X, Clock, Ban, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppLanguage, CurrencyCode, Profile, Settlement } from '../types';
import { formatCurrency, formatDateTime } from '../utils/finance';
import { MemberAvatar } from './MemberAvatar';

interface SettlementCardProps {
  settlement: Settlement;
  currency: CurrencyCode;
  groupName?: string;
  profilesMap: Record<string, Profile>;
  currentUserId: string;
  isAdmin?: boolean;
  onConfirm?: (settlement: Settlement) => void;
  onReject?: (settlement: Settlement) => void;
  onCancel?: (settlement: Settlement) => void;
  onUndoConfirmed?: (settlement: Settlement) => void;
}

export const SettlementCard: React.FC<SettlementCardProps> = ({
  settlement,
  currency,
  groupName,
  profilesMap,
  currentUserId,
  isAdmin = false,
  onConfirm,
  onReject,
  onCancel,
  onUndoConfirmed,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';

  const sender = profilesMap[settlement.sender_id];
  const receiver = profilesMap[settlement.receiver_id];
  const senderName =
    settlement.sender_id === currentUserId
      ? t('common.you')
      : sender
      ? `${sender.first_name} ${sender.last_name}`.trim()
      : t('common.member');
  const receiverName =
    settlement.receiver_id === currentUserId
      ? t('common.you')
      : receiver
      ? `${receiver.first_name} ${receiver.last_name}`.trim()
      : t('common.member');

  const isPending = settlement.status === 'pending';
  const canConfirmOrReject = isPending && settlement.receiver_id === currentUserId;
  const canCancel = isPending && settlement.sender_id === currentUserId;
  const canUndoConfirmed =
    settlement.status === 'confirmed' &&
    Boolean(onUndoConfirmed) &&
    (settlement.sender_id === currentUserId ||
      settlement.receiver_id === currentUserId ||
      isAdmin);

  const statusConfig = {
    pending: {
      bg: 'bg-[#FDF4E6] text-[#B87314]',
      icon: Clock,
    },
    confirmed: {
      bg: 'bg-[#E6F4EE] text-[#16835B]',
      icon: Check,
    },
    rejected: {
      bg: 'bg-[#FCEEEE] text-[#C94A4A]',
      icon: X,
    },
    cancelled: {
      bg: 'bg-[#EEF1EF] text-[#818A84]',
      icon: Ban,
    },
  }[settlement.status];

  const StatusIcon = statusConfig.icon;
  const MethodIcon = settlement.payment_method === 'bank_transfer' ? Building2 : Banknote;

  return (
    <div className="bg-white rounded-2xl border border-[#E8ECE9] p-4 shadow-(--shadow-card)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center -space-x-2 shrink-0">
            <MemberAvatar profile={sender} size="sm" />
            <MemberAvatar profile={receiver} size="sm" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-[#171C19] flex-wrap">
              <span>{senderName}</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#818A84]" />
              <span>{receiverName}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#818A84] mt-0.5">
              {groupName && <span className="font-medium text-[#476457]">{groupName}</span>}
              {groupName && <span>•</span>}
              <span className="inline-flex items-center gap-1">
                <MethodIcon className="w-3 h-3" />
                {t(`settlements.methods.${settlement.payment_method}`)}
              </span>
              <span>•</span>
              <span>{formatDateTime(settlement.created_at, lang)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${statusConfig.bg}`}
          >
            <StatusIcon className="w-3.5 h-3.5" />
            {t(`settlements.status.${settlement.status}`)}
          </span>
          <span className="text-base font-bold text-[#171C19] tabular-nums">
            {formatCurrency(settlement.amount_minor, currency, lang)}
          </span>
        </div>
      </div>

      {settlement.note && (
        <p className="text-xs text-[#818A84] bg-[#F5F7F6] rounded-xl px-3 py-2 mt-3">
          {settlement.note}
        </p>
      )}

      {(canConfirmOrReject || canCancel || canUndoConfirmed) && (
        <div className="flex flex-wrap items-center justify-end gap-2 mt-3.5 pt-3 border-t border-[#E8ECE9]/70">
          {canConfirmOrReject && (
            <>
              <button
                type="button"
                onClick={() => onReject?.(settlement)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#C94A4A] bg-[#FCEEEE] hover:bg-[#F9DCDC] transition-colors"
              >
                {t('settlements.reject')}
              </button>
              <button
                type="button"
                onClick={() => onConfirm?.(settlement)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#16835B] hover:bg-[#126C4B] transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                {t('settlements.confirmReceipt')}
              </button>
            </>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => onCancel?.(settlement)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#818A84] bg-[#F5F7F6] hover:bg-[#E8ECE9] transition-colors"
            >
              {t('settlements.cancelPayment')}
            </button>
          )}
          {canUndoConfirmed && (
            <button
              type="button"
              onClick={() => onUndoConfirmed?.(settlement)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#C94A4A] bg-[#FCEEEE] hover:bg-[#F9DCDC] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('settlements.undoConfirmed')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
