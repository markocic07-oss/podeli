import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Edit3,
  Plus,
  Scissors,
  Trash2,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppLanguage, CurrencyCode, Profile } from '../types';
import {
  calculateItemizedSplit,
  splitItemIntoUnits,
  type EditableReceiptItem,
  type TipDistributionMode,
} from '../utils/fiscalReceipt';
import {
  formatCurrency,
  minorToEditableString,
  parseMajorToMinor,
} from '../utils/finance';
import { MemberAvatar } from './MemberAvatar';

export interface ReceiptSplitterParticipant {
  id: string;
  name: string;
  profile?: Profile;
  isMe?: boolean;
}

interface ReceiptItemSplitterProps {
  participants: ReceiptSplitterParticipant[];
  paidById: string;
  onPaidByChange: (id: string) => void;
  items: EditableReceiptItem[];
  onItemsChange: (items: EditableReceiptItem[]) => void;
  currency: CurrencyCode;
  receiptTotalMinor?: number;
  tipPreset: 0 | 5 | 10 | 'custom';
  onTipPresetChange: (preset: 0 | 5 | 10 | 'custom') => void;
  customTipInput: string;
  onCustomTipInputChange: (val: string) => void;
  tipMode?: TipDistributionMode;
  onTipModeChange?: (mode: TipDistributionMode) => void;
  showPayerSelector?: boolean;
  showInlineSummary?: boolean;
}

export const ReceiptItemSplitter: React.FC<ReceiptItemSplitterProps> = ({
  participants,
  paidById,
  onPaidByChange,
  items,
  onItemsChange,
  currency,
  receiptTotalMinor,
  tipPreset,
  onTipPresetChange,
  customTipInput,
  onCustomTipInputChange,
  tipMode = 'proportional',
  onTipModeChange,
  showPayerSelector = true,
  showInlineSummary = true,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [dismissedDiscrepancy, setDismissedDiscrepancy] = useState(false);

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

  const currentDiffMinor =
    typeof receiptTotalMinor === 'number' && receiptTotalMinor > 0
      ? receiptTotalMinor - itemsSubtotalMinor
      : 0;
  // Flag discrepancy if difference > 1 RSD (100 minor units)
  const hasMathDiff = !dismissedDiscrepancy && Math.abs(currentDiffMinor) > 100;

  const allParticipantIds = useMemo(() => participants.map((p) => p.id), [participants]);

  const toggleParticipantOnItem = (itemId: string, participantId: string) => {
    onItemsChange(
      items.map((it) => {
        if (it.id !== itemId) return it;
        const exists = it.assignedMemberIds.includes(participantId);
        return {
          ...it,
          assignedMemberIds: exists
            ? it.assignedMemberIds.filter((id) => id !== participantId)
            : [...it.assignedMemberIds, participantId],
        };
      })
    );
  };

  const toggleAllOnItem = (itemId: string) => {
    onItemsChange(
      items.map((it) => {
        if (it.id !== itemId) return it;
        const allSelected =
          allParticipantIds.length > 0 &&
          allParticipantIds.every((id) => it.assignedMemberIds.includes(id));
        return {
          ...it,
          assignedMemberIds: allSelected ? [] : [...allParticipantIds],
        };
      })
    );
  };

  const handleSplitAllEqually = () => {
    onItemsChange(items.map((it) => ({ ...it, assignedMemberIds: [...allParticipantIds] })));
  };

  const handleSplitUnits = (itemId: string) => {
    const idx = items.findIndex((it) => it.id === itemId);
    if (idx === -1) return;
    const expanded = splitItemIntoUnits(items[idx]);
    onItemsChange([...items.slice(0, idx), ...expanded, ...items.slice(idx + 1)]);
  };

  const startEditItem = (item: EditableReceiptItem) => {
    setEditingItemId(item.id);
    setEditName(item.name);
    setEditPrice(minorToEditableString(item.totalPriceMinor));
  };

  const saveEditItem = (itemId: string) => {
    const parsedMinor = parseMajorToMinor(editPrice);
    if (!editName.trim() || !parsedMinor || parsedMinor <= 0) return;
    onItemsChange(
      items.map((it) =>
        it.id === itemId
          ? {
              ...it,
              name: editName.trim(),
              totalPriceMinor: parsedMinor,
              unitPriceMinor: Math.round(parsedMinor / Math.max(it.quantity, 1)),
            }
          : it
      )
    );
    setEditingItemId(null);
  };

  const handleAddManualItem = (prefillMinor?: number, prefillName?: string) => {
    const newId = `item_custom_${Date.now()}`;
    const defaultMinor =
      prefillMinor && prefillMinor > 0
        ? prefillMinor
        : currentDiffMinor > 0
          ? currentDiffMinor
          : 10000;
    const newItem: EditableReceiptItem = {
      id: newId,
      name: prefillName || t('receipt.newItemDefaultName'),
      quantity: 1,
      unitPriceMinor: defaultMinor,
      totalPriceMinor: defaultMinor,
      assignedMemberIds: prefillName ? [...allParticipantIds] : [],
    };
    onItemsChange([...items, newItem]);
    if (!prefillName) {
      startEditItem(newItem);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    onItemsChange(items.filter((it) => it.id !== itemId));
    if (editingItemId === itemId) setEditingItemId(null);
  };

  return (
    <div className="space-y-4">
      {/* Math Discrepancy Warning with 1-click correction */}
      {hasMathDiff && typeof receiptTotalMinor === 'number' && (
        <div className="p-3.5 rounded-2xl bg-[#FDF4E6] border border-[#B87314]/30 space-y-2.5 text-xs text-[#8C5A10]">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">Zbir stavki se razlikuje od ukupnog iznosa na računu</p>
              <p>
                Stavke:{' '}
                <strong className="tabular-nums">
                  {formatCurrency(itemsSubtotalMinor, currency, lang, {
                    compactZeroDecimals: true,
                  })}
                </strong>{' '}
                • Račun:{' '}
                <strong className="tabular-nums">
                  {formatCurrency(receiptTotalMinor, currency, lang, {
                    compactZeroDecimals: true,
                  })}
                </strong>{' '}
                (razlika:{' '}
                <strong className="tabular-nums">
                  {formatCurrency(Math.abs(currentDiffMinor), currency, lang, {
                    compactZeroDecimals: true,
                  })}
                </strong>
                )
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {currentDiffMinor > 0 && (
              <button
                type="button"
                onClick={() => handleAddManualItem(currentDiffMinor, 'Razlika / dopuna računa')}
                className="px-3 py-1.5 rounded-xl bg-[#8C5A10] text-white font-semibold text-[11px] hover:bg-[#73490C] transition-colors"
              >
                + Dodaj razliku ({formatCurrency(currentDiffMinor, currency, lang, { compactZeroDecimals: true })})
              </button>
            )}
            <button
              type="button"
              onClick={() => setDismissedDiscrepancy(true)}
              className="px-3 py-1.5 rounded-xl bg-white border border-[#B87314]/25 text-[#8C5A10] font-semibold text-[11px] hover:bg-[#F5F7F6]"
            >
              Koristi zbir stavki
            </button>
          </div>
        </div>
      )}

      {/* Who Paid Selector */}
      {showPayerSelector && participants.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E8ECE9] p-3.5 space-y-2">
          <p className="text-xs font-semibold text-[#818A84]">{t('expenses.form.paidBy')}</p>
          <div className="flex flex-wrap gap-1.5">
            {participants.map((p) => {
              const active = p.id === paidById;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPaidByChange(p.id)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-full text-xs font-semibold border transition-all inline-flex items-center gap-1.5 ${
                    active
                      ? 'bg-[#35483F] text-white border-[#35483F] shadow-2xs'
                      : 'bg-[#F5F7F6] text-[#606A64] border-[#E8ECE9] hover:text-[#171C19]'
                  }`}
                >
                  <span>
                    {p.name}
                    {p.isMe ? ` (${t('common.you')})` : ''}
                  </span>
                  {active && <Check className="w-3.5 h-3.5" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tap Hint + 1-Tap Split All Equally */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-xs text-[#606A64] flex-1 min-w-[180px]">
          Dodirni imena ispod svake stavke ko je to uzeo (1 osoba = 100%, više = jednako).
        </p>
        <button
          type="button"
          onClick={handleSplitAllEqually}
          className="min-h-[34px] px-3 py-1.5 rounded-full bg-[#35483F] hover:bg-[#2B3B33] text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors"
        >
          <Users className="w-3.5 h-3.5" />
          <span>{t('receipt.splitAllEqually')}</span>
        </button>
      </div>

      {/* Items List */}
      <div className="space-y-2.5">
        {items.map((item) => {
          const isEditing = editingItemId === item.id;
          const isAssigned = item.assignedMemberIds.length > 0;
          const canSplitUnits = Number.isInteger(item.quantity) && item.quantity > 1;
          const allSelected =
            allParticipantIds.length > 0 &&
            allParticipantIds.every((id) => item.assignedMemberIds.includes(id));

          return (
            <div
              key={item.id}
              className={`bg-white rounded-2xl border p-3.5 transition-all space-y-2.5 ${
                isAssigned
                  ? 'border-[#35483F]/30 shadow-2xs'
                  : 'border-[#B87314]/45'
              }`}
            >
              {isEditing ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Naziv stavke"
                      className="sm:col-span-2 min-h-[42px] px-3 py-1.5 rounded-xl border border-[#35483F] text-base sm:text-sm font-medium"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      placeholder="Cena"
                      className="min-h-[42px] px-3 py-1.5 rounded-xl border border-[#35483F] text-right text-base sm:text-sm font-bold tabular-nums"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingItemId(null)}
                      className="px-3 py-1.5 rounded-xl bg-[#F5F7F6] text-xs font-semibold text-[#818A84]"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEditItem(item.id)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#35483F] text-white text-xs font-semibold"
                    >
                      {t('common.confirm')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-[#171C19] leading-snug">
                        {item.name}
                      </span>
                      {item.quantity !== 1 && (
                        <span className="text-[11px] font-bold text-[#476457] bg-[#E8F1EB] px-2 py-0.5 rounded-full tabular-nums">
                          {Number.isInteger(item.quantity)
                            ? `${item.quantity}x`
                            : `${item.quantity} kg/kom`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-sm sm:text-base font-bold text-[#171C19] tabular-nums mr-0.5">
                      {formatCurrency(item.totalPriceMinor, currency, lang, {
                        compactZeroDecimals: true,
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEditItem(item)}
                      aria-label={t('common.edit')}
                      className="p-1.5 rounded-lg text-[#818A84] hover:text-[#171C19] hover:bg-[#F5F7F6]"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      aria-label={t('common.delete')}
                      className="p-1.5 rounded-lg text-[#818A84] hover:text-[#C94A4A] hover:bg-[#FCEEEE]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Actions Row: "Svi" + optional "Razdvoji po komadu" */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleAllOnItem(item.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                    allSelected
                      ? 'bg-[#35483F] text-white'
                      : 'bg-[#F5F7F6] text-[#606A64] hover:bg-[#E8ECE9]'
                  }`}
                >
                  <Users className="w-3 h-3" />
                  <span>Svi</span>
                </button>

                {canSplitUnits && (
                  <button
                    type="button"
                    onClick={() => handleSplitUnits(item.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FDF4E6] text-[#8C5A10] hover:bg-[#FBEBD0] text-[11px] font-semibold transition-colors"
                  >
                    <Scissors className="w-3 h-3" />
                    <span>{t('receipt.splitByUnit')}</span>
                  </button>
                )}

                {item.assignedMemberIds.length > 1 && (
                  <span className="text-[11px] text-[#818A84] ml-auto tabular-nums">
                    {formatCurrency(
                      Math.round(item.totalPriceMinor / item.assignedMemberIds.length),
                      currency,
                      lang,
                      { compactZeroDecimals: true }
                    )}{' '}
                    / os.
                  </span>
                )}
              </div>

              {/* Participant Chips */}
              <div className="flex flex-wrap gap-1.5">
                {participants.map((p) => {
                  const selected = item.assignedMemberIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleParticipantOnItem(item.id, p.id)}
                      className={`min-h-[34px] inline-flex items-center gap-1.5 ${
                        p.profile ? 'pl-1.5 pr-3' : 'px-3'
                      } py-1 rounded-full border text-xs font-semibold transition-all ${
                        selected
                          ? 'bg-[#E8F1EB] border-[#35483F] text-[#35483F]'
                          : 'bg-white border-[#E8ECE9] text-[#606A64] hover:bg-[#F5F7F6]'
                      }`}
                    >
                      {p.profile && <MemberAvatar profile={p.profile} size="xs" />}
                      <span>{p.name}</span>
                      {selected && <Check className="w-3.5 h-3.5 text-[#16835B]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => handleAddManualItem()}
          className="w-full min-h-[42px] py-2 px-4 rounded-2xl border border-dashed border-[#CBD4CE] text-xs font-semibold text-[#476457] hover:bg-white inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>{t('receipt.addMissingItem')}</span>
        </button>
      </div>

      {/* Optional Tip (Bakšiš) */}
      <div className="bg-white rounded-2xl border border-[#E8ECE9] p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#171C19]">{t('receipt.tipLabel')}</span>
          {tipMinor > 0 && (
            <span className="text-xs font-bold text-[#16835B] tabular-nums">
              +{formatCurrency(tipMinor, currency, lang, { compactZeroDecimals: true })}
            </span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {([0, 5, 10, 'custom'] as const).map((preset) => {
            const active = tipPreset === preset;
            return (
              <button
                key={String(preset)}
                type="button"
                onClick={() => onTipPresetChange(preset)}
                className={`min-h-[38px] rounded-xl border text-xs font-bold transition-all ${
                  active
                    ? 'bg-[#35483F] text-white border-[#35483F]'
                    : 'bg-[#F5F7F6] text-[#171C19] border-[#E8ECE9]'
                }`}
              >
                {preset === 'custom' ? t('receipt.tipCustom') : `${preset}%`}
              </button>
            );
          })}
        </div>

        {tipPreset === 'custom' && (
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={customTipInput}
              onChange={(e) => onCustomTipInputChange(e.target.value)}
              placeholder="0"
              className="w-full min-h-[42px] pl-3.5 pr-14 py-2 rounded-xl border border-[#E8ECE9] bg-[#F5F7F6] text-base sm:text-sm font-bold tabular-nums focus:bg-white focus:outline-none focus:border-[#35483F]"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#476457]">
              {currency}
            </span>
          </div>
        )}

        {tipMinor > 0 && onTipModeChange && (
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F5F7F6] rounded-xl">
            <button
              type="button"
              onClick={() => onTipModeChange('proportional')}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all ${
                tipMode === 'proportional'
                  ? 'bg-white text-[#35483F] shadow-2xs'
                  : 'text-[#818A84]'
              }`}
            >
              {t('receipt.tipProportional')}
            </button>
            <button
              type="button"
              onClick={() => onTipModeChange('equal')}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all ${
                tipMode === 'equal'
                  ? 'bg-white text-[#35483F] shadow-2xs'
                  : 'text-[#818A84]'
              }`}
            >
              {t('receipt.tipEqual')}
            </button>
          </div>
        )}
      </div>

      {/* Real-Time Per-Person Breakdown Card */}
      {showInlineSummary && (
        <div className="bg-white rounded-2xl border border-[#E8ECE9] p-4 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span
              className={
                splitResult.allItemsAssigned ? 'text-[#16835B]' : 'text-[#B87314]'
              }
            >
              Raspoređeno:{' '}
              <strong className="tabular-nums">
                {formatCurrency(splitResult.assignedItemsTotalMinor, currency, lang, {
                  compactZeroDecimals: true,
                })}
              </strong>{' '}
              /{' '}
              <strong className="tabular-nums">
                {formatCurrency(splitResult.allItemsTotalMinor, currency, lang, {
                  compactZeroDecimals: true,
                })}
              </strong>
            </span>
            <span className="text-[#35483F] font-bold tabular-nums">
              Ukupno:{' '}
              {formatCurrency(splitResult.grandTotalMinor, currency, lang, {
                compactZeroDecimals: true,
              })}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {participants.map((p) => {
              const amt = splitResult.sharesByUser[p.id] ?? 0;
              const isPayer = p.id === paidById;
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs ${
                    isPayer
                      ? 'bg-[#F5F7F6] text-[#606A64]'
                      : 'bg-[#E8F1EB]/75 text-[#171C19]'
                  }`}
                >
                  <span className="font-semibold truncate">
                    {p.name}
                    {isPayer ? ' (Platio)' : ''}
                  </span>
                  <strong className="tabular-nums shrink-0 text-[#35483F]">
                    {formatCurrency(amt, currency, lang, { compactZeroDecimals: true })}
                  </strong>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
