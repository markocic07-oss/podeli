import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  AppLanguage,
  ExpenseCategory,
  Group,
  GroupMember,
  UpsertExpenseInput,
} from '../types';
import {
  buildEditableReceiptItems,
  calculateItemizedSplit,
  majorToMinor,
  type EditableReceiptItem,
  type ParsedFiscalReceipt,
  type TipDistributionMode,
} from '../utils/fiscalReceipt';
import {
  formatCurrency,
  formatDate,
  parseMajorToMinor,
} from '../utils/finance';
import {
  ReceiptItemSplitter,
  type ReceiptSplitterParticipant,
} from './ReceiptItemSplitter';

interface ItemizedSplitModalProps {
  open: boolean;
  receipt: ParsedFiscalReceipt | null;
  group: Group;
  members: GroupMember[];
  actingMemberId: string;
  onSave: (input: UpsertExpenseInput) => Promise<void>;
  onClose: () => void;
}

export const ItemizedSplitModal: React.FC<ItemizedSplitModalProps> = ({
  open,
  receipt,
  group,
  members,
  actingMemberId,
  onSave,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';

  const [title, setTitle] = useState('');
  const [paidBy, setPaidBy] = useState(actingMemberId);
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [items, setItems] = useState<EditableReceiptItem[]>([]);

  // Tip controls
  const [tipPreset, setTipPreset] = useState<0 | 5 | 10 | 'custom'>(0);
  const [customTipInput, setCustomTipInput] = useState('');
  const [tipMode, setTipMode] = useState<TipDistributionMode>('proportional');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !receipt) return;
    setTitle(receipt.merchantName || 'Račun');
    setPaidBy(actingMemberId || members[0]?.user_id || '');
    setCategory(receipt.category ?? 'other');
    const allIds = members.map((m) => m.user_id);
    setItems(buildEditableReceiptItems(receipt.items, allIds));
    setTipPreset(0);
    setCustomTipInput('');
    setTipMode('proportional');
    setError(null);
  }, [open, receipt, actingMemberId, members]);

  const participants = useMemo<ReceiptSplitterParticipant[]>(
    () =>
      members.map((m) => ({
        id: m.user_id,
        name: m.profile.first_name || t('common.member'),
        profile: m.profile,
        isMe: m.user_id === actingMemberId,
      })),
    [members, actingMemberId, t]
  );

  const itemsSubtotalMinor = useMemo(
    () => items.reduce((acc, it) => acc + it.totalPriceMinor, 0),
    [items]
  );

  const tipMinor = useMemo(() => {
    if (tipPreset === 'custom') {
      return parseMajorToMinor(customTipInput) ?? 0;
    }
    if (tipPreset === 0) return 0;
    return Math.round((itemsSubtotalMinor * tipPreset) / 100);
  }, [tipPreset, customTipInput, itemsSubtotalMinor]);

  const splitResult = useMemo(
    () => calculateItemizedSplit(items, tipMinor, tipMode),
    [items, tipMinor, tipMode]
  );

  if (!open || !receipt) return null;

  const receiptTotalMinor = majorToMinor(receipt.totalAmount);

  const handleSaveExpense = async () => {
    setError(null);
    if (!splitResult.allItemsAssigned) {
      setError(t('receipt.unassignedWarning'));
      return;
    }
    if (!paidBy) {
      setError(t('expenses.validation.payerRequired'));
      return;
    }

    const totalExpenseMinor = splitResult.assignedItemsTotalMinor + splitResult.tipMinor;
    if (totalExpenseMinor <= 0 || splitResult.shares.length === 0) {
      setError(t('expenses.validation.amountInvalid'));
      return;
    }

    // Build concise itemized description
    const itemLines = items.map((it) => {
      const names = it.assignedMemberIds
        .map((uid) => members.find((m) => m.user_id === uid)?.profile.first_name ?? '')
        .filter(Boolean)
        .join(', ');
      return `• ${it.name} (${formatCurrency(it.totalPriceMinor, group.currency, lang)}) → ${names}`;
    });
    if (splitResult.tipMinor > 0) {
      itemLines.push(
        `• ${t('receipt.tipLabel')}: ${formatCurrency(splitResult.tipMinor, group.currency, lang)}`
      );
    }
    const description = itemLines.join('\n').slice(0, 980);

    setSubmitting(true);
    try {
      await onSave({
        group_id: group.id,
        title: title.trim() || receipt.merchantName,
        description,
        amount_minor: totalExpenseMinor,
        currency: group.currency,
        paid_by: paidBy,
        category,
        split_method: 'custom',
        expense_date: receipt.date.slice(0, 10),
        receipt_url: null,
        shares: splitResult.shares,
      });
      onClose();
    } catch {
      setError(t('app.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-[#171C19]/50 backdrop-blur-[2px] animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-[#F5F7F6] w-full sm:max-w-2xl rounded-3xl border border-[#E8ECE9] shadow-(--shadow-modal) max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-[#E8ECE9] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-[#171C19] truncate">
              {t('receipt.itemizedTitle')}
            </h2>
            <p className="text-xs text-[#818A84] truncate">
              {receipt.merchantName} • {formatDate(receipt.date, lang)}
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 rounded-xl text-[#818A84] hover:bg-[#F5F7F6]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-2xl bg-[#FCEEEE] text-[#C94A4A] text-sm font-medium">
              {error}
            </div>
          )}

          {/* Title & Category */}
          <div className="bg-white rounded-2xl border border-[#E8ECE9] p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#818A84] mb-1">
                {t('expenses.form.title')}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full min-h-[42px] px-3 py-1.5 rounded-xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm font-semibold text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#818A84] mb-1">
                {t('expenses.form.category')}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full min-h-[42px] px-3 py-1.5 rounded-xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm font-semibold text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
              >
                {(
                  [
                    'drinks',
                    'food',
                    'groceries',
                    'transport',
                    'accommodation',
                    'bills',
                    'entertainment',
                    'gifts',
                    'other',
                  ] as ExpenseCategory[]
                ).map((cat) => (
                  <option key={cat} value={cat}>
                    {t(`expenses.categories.${cat}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Reusable Itemized Splitter */}
          <ReceiptItemSplitter
            participants={participants}
            paidById={paidBy}
            onPaidByChange={setPaidBy}
            items={items}
            onItemsChange={setItems}
            currency={group.currency}
            receiptTotalMinor={receiptTotalMinor}
            tipPreset={tipPreset}
            onTipPresetChange={setTipPreset}
            customTipInput={customTipInput}
            onCustomTipInputChange={setCustomTipInput}
            tipMode={tipMode}
            onTipModeChange={setTipMode}
            showPayerSelector
            showInlineSummary={false}
          />
        </div>

        {/* Sticky Real-Time Footer */}
        <div className="p-4 sm:p-5 bg-white border-t border-[#E8ECE9] space-y-3 shrink-0 safe-area-bottom">
          {/* Live Assigned vs Total Progress */}
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span
              className={`font-semibold ${
                splitResult.allItemsAssigned ? 'text-[#16835B]' : 'text-[#B87314]'
              }`}
            >
              Raspoređeno:{' '}
              <strong className="tabular-nums">
                {formatCurrency(splitResult.assignedItemsTotalMinor, group.currency, lang, {
                  compactZeroDecimals: true,
                })}
              </strong>{' '}
              /{' '}
              <strong className="tabular-nums">
                {formatCurrency(splitResult.allItemsTotalMinor, group.currency, lang, {
                  compactZeroDecimals: true,
                })}
              </strong>
            </span>
            <span className="font-bold text-[#35483F] tabular-nums">
              {formatCurrency(splitResult.grandTotalMinor, group.currency, lang, {
                compactZeroDecimals: true,
              })}
            </span>
          </div>

          {/* Live Per-Person Breakdown */}
          {splitResult.shares.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#818A84]">
                {t('receipt.whoOwesPreview', {
                  payer:
                    members.find((m) => m.user_id === paidBy)?.profile.first_name ??
                    t('common.member'),
                })}
              </p>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {splitResult.shares.map((s) => {
                  const m = members.find((mem) => mem.user_id === s.userId);
                  const isPayer = s.userId === paidBy;
                  return (
                    <span
                      key={s.userId}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 tabular-nums ${
                        isPayer
                          ? 'bg-[#F5F7F6] text-[#606A64]'
                          : 'bg-[#E8F1EB] text-[#35483F]'
                      }`}
                    >
                      <span>{m?.profile.first_name ?? t('common.member')}:</span>
                      <strong>
                        {formatCurrency(s.shareAmountMinor, group.currency, lang, {
                          compactZeroDecimals: true,
                        })}
                      </strong>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={submitting || !splitResult.allItemsAssigned}
            onClick={handleSaveExpense}
            className="w-full min-h-[48px] py-3 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-45"
          >
            {submitting ? t('common.saving') : t('expenses.form.submitAdd')}
          </button>
        </div>
      </div>
    </div>
  );
};
