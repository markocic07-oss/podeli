import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  AppLanguage,
  ExpenseCategory,
  Group,
  GroupMember,
  ShareAllocation,
  SplitMethod,
  UpsertExpenseInput,
} from '../types';
import { EXPENSE_CATEGORIES } from '../utils/categories';
import {
  calculateEqualSplit,
  calculatePercentageSplit,
  formatCurrency,
  minorToEditableString,
  parseMajorToMinor,
  parsePercentToBasisPoints,
  validateCustomSplit,
} from '../utils/finance';
import { MemberAvatar } from './MemberAvatar';

interface GuestAddExpenseModalProps {
  open: boolean;
  group: Group;
  members: GroupMember[];
  actingMemberId: string;
  onSubmit: (input: UpsertExpenseInput) => Promise<void>;
  onClose: () => void;
}

export const GuestAddExpenseModal: React.FC<GuestAddExpenseModalProps> = ({
  open,
  group,
  members,
  actingMemberId,
  onSubmit,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';

  const [title, setTitle] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [paidBy, setPaidBy] = useState(actingMemberId);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [percentInputs, setPercentInputs] = useState<Record<string, string>>({});
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setAmountInput('');
    setPaidBy(actingMemberId);
    setParticipantIds(members.map((m) => m.user_id));
    setSplitMethod('equal');
    setCustomInputs({});
    setPercentInputs({});
    setCategory('food');
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setDescription('');
    setShowMore(false);
    setError(null);
  }, [open, actingMemberId, members]);

  const parsedAmountMinor = useMemo(() => parseMajorToMinor(amountInput), [amountInput]);

  const splitPreview = useMemo(() => {
    if (!parsedAmountMinor || parsedAmountMinor <= 0 || participantIds.length === 0) {
      return { valid: false, shares: [] as ShareAllocation[], diffMinor: 0, totalBps: 0 };
    }
    if (splitMethod === 'equal') {
      return {
        valid: true,
        shares: calculateEqualSplit(parsedAmountMinor, participantIds),
        diffMinor: 0,
        totalBps: 10000,
      };
    }
    if (splitMethod === 'custom') {
      const shares: ShareAllocation[] = [];
      for (const uid of participantIds) {
        const val = parseMajorToMinor(customInputs[uid] ?? '0');
        if (val === null) return { valid: false, shares: [], diffMinor: parsedAmountMinor, totalBps: 0 };
        shares.push({ userId: uid, shareAmountMinor: val });
      }
      const check = validateCustomSplit(parsedAmountMinor, shares);
      return { valid: check.valid, shares, diffMinor: check.diffMinor, totalBps: 0 };
    }
    const inputs = participantIds.map((uid) => ({
      userId: uid,
      basisPoints: parsePercentToBasisPoints(percentInputs[uid] ?? '0') ?? -1,
    }));
    if (inputs.some((i) => i.basisPoints < 0)) {
      return { valid: false, shares: [], diffMinor: 0, totalBps: 0 };
    }
    const res = calculatePercentageSplit(parsedAmountMinor, inputs);
    return { valid: res.valid, shares: res.shares, diffMinor: 0, totalBps: res.totalBasisPoints };
  }, [parsedAmountMinor, participantIds, splitMethod, customInputs, percentInputs]);

  if (!open) return null;

  const handleSelectSplitMethod = (method: SplitMethod) => {
    setSplitMethod(method);
    if (method === 'custom' && parsedAmountMinor && participantIds.length > 0) {
      const equal = calculateEqualSplit(parsedAmountMinor, participantIds);
      const next: Record<string, string> = {};
      for (const s of equal) next[s.userId] = minorToEditableString(s.shareAmountMinor);
      setCustomInputs(next);
    } else if (method === 'percentage' && participantIds.length > 0) {
      const base = Math.floor(10000 / participantIds.length);
      const rem = 10000 - base * participantIds.length;
      const next: Record<string, string> = {};
      participantIds.forEach((uid, idx) => {
        const bps = base + (idx < rem ? 1 : 0);
        next[uid] = (bps / 100).toFixed(2).replace(/\.00$/, '').replace('.', ',');
      });
      setPercentInputs(next);
    }
  };

  const toggleParticipant = (uid: string) => {
    setParticipantIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError(t('expenses.validation.titleRequired'));
      return;
    }
    if (!parsedAmountMinor || parsedAmountMinor <= 0) {
      setError(t('expenses.validation.amountInvalid'));
      return;
    }
    if (participantIds.length === 0) {
      setError(t('expenses.validation.participantsRequired'));
      return;
    }
    if (!splitPreview.valid) {
      setError(
        splitMethod === 'percentage'
          ? t('expenses.validation.percentSumMismatch')
          : t('expenses.validation.customSumMismatch')
      );
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        group_id: group.id,
        title: title.trim(),
        description: description.trim() || null,
        amount_minor: parsedAmountMinor,
        currency: group.currency,
        paid_by: paidBy,
        category,
        split_method: splitMethod,
        expense_date: expenseDate,
        receipt_url: null,
        shares: splitPreview.shares,
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#171C19]/45 backdrop-blur-[2px] animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white w-full sm:max-w-lg rounded-3xl border border-[#E8ECE9] shadow-(--shadow-modal) max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in">
        <div className="px-5 py-3.5 border-b border-[#E8ECE9] flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold text-[#171C19]">{t('expenses.addTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 rounded-xl text-[#818A84] hover:bg-[#F5F7F6]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-2xl bg-[#FCEEEE] text-[#C94A4A] text-sm font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#818A84] mb-1.5">
              {t('expenses.form.amount')} *
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                required
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0,00"
                className="w-full min-h-[54px] pl-4 pr-20 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6] text-2xl font-bold tabular-nums text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#35483F] bg-[#E8F1EB] px-2.5 py-1.5 rounded-xl">
                {group.currency}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
              {t('expenses.form.title')} *
            </label>
            <input
              type="text"
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('expenses.form.titlePlaceholder')}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
              {t('expenses.form.paidBy')}
            </label>
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm font-medium focus:bg-white focus:outline-none focus:border-[#35483F]"
            >
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {`${m.profile.first_name} ${m.profile.last_name}`.trim()}
                  {m.user_id === actingMemberId ? ` (${t('common.you')})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Split Method */}
          <div>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#F5F7F6] rounded-2xl border border-[#E8ECE9]">
              {(
                [
                  ['equal', t('expenses.form.splitEqual')],
                  ['custom', t('expenses.form.splitCustom')],
                  ['percentage', t('expenses.form.splitPercentage')],
                ] as const
              ).map(([method, label]) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => handleSelectSplitMethod(method)}
                  className={`min-h-[38px] py-1.5 px-2 rounded-xl text-xs font-semibold transition-all ${
                    splitMethod === method
                      ? 'bg-[#35483F] text-white shadow-xs'
                      : 'text-[#818A84] hover:text-[#171C19]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Participants */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#171C19]">
                {t('expenses.form.participants')} ({participantIds.length})
              </span>
              <button
                type="button"
                onClick={() => setParticipantIds(members.map((m) => m.user_id))}
                className="text-xs font-semibold text-[#35483F] hover:underline"
              >
                {t('expenses.form.selectAll')}
              </button>
            </div>

            {members.map((m) => {
              const checked = participantIds.includes(m.user_id);
              const share = splitPreview.shares.find((s) => s.userId === m.user_id);
              const fullName = `${m.profile.first_name} ${m.profile.last_name}`.trim();
              return (
                <div
                  key={m.user_id}
                  className={`flex items-center justify-between gap-2.5 p-2.5 rounded-2xl border ${
                    checked ? 'bg-white border-[#35483F]/30' : 'bg-[#F5F7F6]/60 border-[#E8ECE9] opacity-70'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleParticipant(m.user_id)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                  >
                    <span
                      className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
                        checked ? 'bg-[#35483F] border-[#35483F] text-white' : 'bg-white border-[#CBD4CE]'
                      }`}
                    >
                      {checked && <Check className="w-3.5 h-3.5" />}
                    </span>
                    <MemberAvatar profile={m.profile} size="xs" />
                    <span className="text-sm font-medium text-[#171C19] truncate">
                      {fullName}
                      {m.user_id === actingMemberId && (
                        <span className="text-xs text-[#818A84] ml-1">({t('common.you')})</span>
                      )}
                    </span>
                  </button>

                  {checked && splitMethod === 'equal' && share && (
                    <span className="text-xs sm:text-sm font-bold text-[#35483F] tabular-nums shrink-0">
                      {formatCurrency(share.shareAmountMinor, group.currency, lang)}
                    </span>
                  )}
                  {checked && splitMethod === 'custom' && (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={customInputs[m.user_id] ?? ''}
                      onChange={(e) =>
                        setCustomInputs((prev) => ({ ...prev, [m.user_id]: e.target.value }))
                      }
                      placeholder="0,00"
                      className="w-24 px-2.5 py-1.5 rounded-xl border border-[#E8ECE9] text-right text-sm font-semibold tabular-nums"
                    />
                  )}
                  {checked && splitMethod === 'percentage' && (
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={percentInputs[m.user_id] ?? ''}
                        onChange={(e) =>
                          setPercentInputs((prev) => ({ ...prev, [m.user_id]: e.target.value }))
                        }
                        placeholder="0"
                        className="w-20 pl-2 pr-6 py-1.5 rounded-xl border border-[#E8ECE9] text-right text-sm font-semibold tabular-nums"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#818A84]">
                        %
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Collapsible Optional Details */}
          <div className="rounded-2xl border border-[#E8ECE9] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="w-full min-h-[44px] px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-[#35483F] bg-[#F5F7F6]/60"
            >
              <span>{showMore ? t('guide.hints.hideOptions') : t('guide.hints.moreOptions')}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
            </button>
            {showMore && (
              <div className="p-4 space-y-3 bg-white border-t border-[#E8ECE9]">
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-[#E8ECE9] text-sm"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {t(`expenses.categories.${c.id}`)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-[#E8ECE9] text-sm"
                  />
                </div>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('expenses.form.descriptionPlaceholder')}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8ECE9] text-sm resize-none"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="min-h-[46px] px-5 py-2.5 rounded-2xl text-sm font-medium bg-[#F5F7F6] text-[#171C19]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[46px] px-6 py-2.5 rounded-2xl text-sm font-semibold bg-[#35483F] hover:bg-[#2B3B33] text-white disabled:opacity-50"
            >
              {submitting ? t('common.saving') : t('expenses.form.submitAdd')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
