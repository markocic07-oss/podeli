import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ImagePlus, Info, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import type {
  AppLanguage,
  Expense,
  ExpenseCategory,
  ShareAllocation,
  SplitMethod,
} from '../types';
import { EXPENSE_CATEGORIES } from '../utils/categories';
import {
  calculateEqualSplit,
  calculatePercentageSplit,
  computeMultiPayerTransfers,
  expandMultiPayerExpenses,
  formatCurrency,
  minorToEditableString,
  parseMajorToMinor,
  parsePercentToBasisPoints,
  validateCustomSplit,
  type PayerContribution,
} from '../utils/finance';
import { MemberAvatar } from './MemberAvatar';

interface AddExpenseModalProps {
  open: boolean;
  defaultGroupId?: string;
  editingExpense?: Expense | null;
  onClose: () => void;
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  open,
  defaultGroupId,
  editingExpense = null,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';
  const { user } = useAuth();
  const { groups, createExpense, updateExpense, uploadFile, openCreateGroupModal } = useData();
  const { showToast } = useToast();

  const [groupId, setGroupId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [payerMode, setPayerMode] = useState<'single' | 'multiple'>('single');
  const [payerInputs, setPayerInputs] = useState<Record<string, string>>({});
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [percentInputs, setPercentInputs] = useState<Record<string, string>>({});
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  const selectedGroupDetails = useMemo(
    () => groups.find((g) => g.group.id === groupId) ?? null,
    [groups, groupId]
  );

  // Initialize form whenever opened
  useEffect(() => {
    if (!open) return;

    if (editingExpense) {
      const grp = groups.find((g) => g.group.id === editingExpense.group_id);
      setGroupId(editingExpense.group_id);
      setTitle(editingExpense.title);
      setAmountInput(minorToEditableString(editingExpense.amount_minor));
      setPaidBy(editingExpense.paid_by);
      setPayerMode('single');
      setPayerInputs({});
      const pIds = editingExpense.shares.map((s) => s.user_id);
      setParticipantIds(pIds);
      setSplitMethod(editingExpense.split_method);
      setCategory(editingExpense.category);
      setExpenseDate(editingExpense.expense_date);
      setDescription(editingExpense.description ?? '');
      setReceiptUrl(editingExpense.receipt_url);

      const customMap: Record<string, string> = {};
      const pctMap: Record<string, string> = {};
      for (const s of editingExpense.shares) {
        customMap[s.user_id] = minorToEditableString(s.share_amount_minor);
        const pct = ((s.share_amount_minor / editingExpense.amount_minor) * 100).toFixed(2);
        pctMap[s.user_id] = pct.replace(/\.00$/, '').replace('.', ',');
      }
      if (grp) {
        for (const m of grp.members) {
          if (!(m.user_id in customMap)) customMap[m.user_id] = '';
          if (!(m.user_id in pctMap)) pctMap[m.user_id] = '';
        }
      }
      setCustomInputs(customMap);
      setPercentInputs(pctMap);
      setShowMoreOptions(true);
    } else {
      const initialGroup =
        groups.find((g) => g.group.id === defaultGroupId) ?? groups[0] ?? null;
      const gId = initialGroup?.group.id ?? '';
      setGroupId(gId);
      setTitle('');
      setAmountInput('');
      setPaidBy(user?.id ?? initialGroup?.members[0]?.user_id ?? '');
      setPayerMode('single');
      setPayerInputs({});
      const allIds = initialGroup?.members.map((m) => m.user_id) ?? [];
      setParticipantIds(allIds);
      setSplitMethod('equal');
      setCategory('food');
      setExpenseDate(new Date().toISOString().slice(0, 10));
      setDescription('');
      setReceiptUrl(null);
      setCustomInputs({});
      setPercentInputs({});
      setShowMoreOptions(false);
    }
    setError(null);
  }, [open, editingExpense, defaultGroupId, groups, user?.id]);

  // When switching group on new expense, reset payer and participants to that group's members
  const handleGroupChange = (newGroupId: string) => {
    setGroupId(newGroupId);
    const grp = groups.find((g) => g.group.id === newGroupId);
    if (!grp) return;
    const memberIds = grp.members.map((m) => m.user_id);
    setParticipantIds(memberIds);
    setPaidBy(memberIds.includes(user?.id ?? '') ? user!.id : memberIds[0] ?? '');
    setPayerMode('single');
    setPayerInputs({});
    setCustomInputs({});
    setPercentInputs({});
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  const parsedAmountMinor = useMemo(() => parseMajorToMinor(amountInput), [amountInput]);
  const currency = selectedGroupDetails?.group.currency ?? 'RSD';

  // Multi-payer contributions validation
  const multiPayerSummary = useMemo(() => {
    const members = selectedGroupDetails?.members ?? [];
    if (payerMode !== 'multiple' || !parsedAmountMinor || parsedAmountMinor <= 0) {
      return { valid: true, contributions: [] as PayerContribution[], diffMinor: 0 };
    }
    const contributions: PayerContribution[] = [];
    let sum = 0;
    for (const m of members) {
      const raw = (payerInputs[m.user_id] ?? '').trim();
      const val = raw === '' ? 0 : parseMajorToMinor(raw);
      if (val === null || val < 0) {
        return { valid: false, contributions: [], diffMinor: parsedAmountMinor };
      }
      if (val > 0) {
        contributions.push({ userId: m.user_id, paidMinor: val });
        sum += val;
      }
    }
    const diffMinor = parsedAmountMinor - sum;
    return {
      valid: contributions.length > 0 && diffMinor === 0,
      contributions,
      diffMinor,
    };
  }, [payerMode, parsedAmountMinor, payerInputs, selectedGroupDetails?.members]);

  // Compute live split preview
  const splitPreview = useMemo(() => {
    if (!parsedAmountMinor || parsedAmountMinor <= 0 || participantIds.length === 0) {
      return { valid: false, shares: [] as ShareAllocation[], diffMinor: 0, totalBps: 0 };
    }

    if (splitMethod === 'equal') {
      const shares = calculateEqualSplit(parsedAmountMinor, participantIds);
      return { valid: true, shares, diffMinor: 0, totalBps: 10000 };
    }

    if (splitMethod === 'custom') {
      const shares: ShareAllocation[] = [];
      for (const uid of participantIds) {
        const val = parseMajorToMinor(customInputs[uid] ?? '0');
        if (val === null) {
          return { valid: false, shares: [], diffMinor: parsedAmountMinor, totalBps: 0 };
        }
        shares.push({ userId: uid, shareAmountMinor: val });
      }
      const check = validateCustomSplit(parsedAmountMinor, shares);
      return { valid: check.valid, shares, diffMinor: check.diffMinor, totalBps: 0 };
    }

    // Percentage
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

  // Helper to pre-fill equal values when switching to custom/percentage tabs
  const handleSelectSplitMethod = (method: SplitMethod) => {
    setSplitMethod(method);
    if (method === 'custom' && parsedAmountMinor && participantIds.length > 0) {
      const equal = calculateEqualSplit(parsedAmountMinor, participantIds);
      const next: Record<string, string> = {};
      for (const s of equal) {
        next[s.userId] = minorToEditableString(s.shareAmountMinor);
      }
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

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedGroupDetails) return;
    setUploading(true);
    try {
      const url = await uploadFile('receipts', selectedGroupDetails.group.id, file);
      setReceiptUrl(url);
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setUploading(false);
    }
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
    if (!selectedGroupDetails) {
      setError(t('expenses.validation.groupRequired'));
      return;
    }
    if (payerMode === 'single' && !paidBy) {
      setError(t('expenses.validation.payerRequired'));
      return;
    }
    if (payerMode === 'multiple' && !multiPayerSummary.valid) {
      setError('Zbir iznosa koje su osobe platile mora tačno da se poklopi sa ukupnim iznosom troška.');
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
      if (!editingExpense && payerMode === 'multiple' && multiPayerSummary.contributions.length > 1) {
        const expanded = expandMultiPayerExpenses(
          multiPayerSummary.contributions,
          splitPreview.shares
        );
        const breakdownNote = multiPayerSummary.contributions
          .map((c) => {
            const mem = selectedGroupDetails.members.find((m) => m.user_id === c.userId);
            const name = mem?.profile.first_name ?? t('common.member');
            return `${name}: ${formatCurrency(c.paidMinor, currency, lang, { compactZeroDecimals: true })}`;
          })
          .join(', ');
        const combinedDesc = [
          description.trim(),
          `Zajedničko plaćanje (ukupno ${formatCurrency(parsedAmountMinor, currency, lang, { compactZeroDecimals: true })} — ${breakdownNote})`,
        ]
          .filter(Boolean)
          .join('\n');

        for (const item of expanded) {
          const payerMem = selectedGroupDetails.members.find((m) => m.user_id === item.paidBy);
          const payerName = payerMem?.profile.first_name ?? t('common.member');
          await createExpense({
            group_id: selectedGroupDetails.group.id,
            title: `${title.trim()} (${payerName})`,
            description: combinedDesc,
            amount_minor: item.amountMinor,
            currency: selectedGroupDetails.group.currency,
            paid_by: item.paidBy,
            category,
            split_method: 'custom',
            expense_date: expenseDate,
            receipt_url: receiptUrl,
            shares: item.shares,
          });
        }
        showToast(t('expenses.createdSuccess'), 'success');
        onClose();
        return;
      }

      const effectivePaidBy =
        payerMode === 'multiple' && multiPayerSummary.contributions.length === 1
          ? multiPayerSummary.contributions[0].userId
          : paidBy;

      const payload = {
        group_id: selectedGroupDetails.group.id,
        title: title.trim(),
        description: description.trim() || null,
        amount_minor: parsedAmountMinor,
        currency: selectedGroupDetails.group.currency,
        paid_by: effectivePaidBy,
        category,
        split_method: splitMethod,
        expense_date: expenseDate,
        receipt_url: receiptUrl,
        shares: splitPreview.shares,
      };

      if (editingExpense) {
        await updateExpense(editingExpense.id, payload);
        showToast(t('expenses.updatedSuccess'), 'success');
      } else {
        await createExpense(payload);
        showToast(t('expenses.createdSuccess'), 'success');
      }
      onClose();
    } catch {
      setError(t('app.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const payerExcluded = Boolean(
    payerMode === 'single' && paidBy && !participantIds.includes(paidBy)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-[#171C19]/45 backdrop-blur-[2px] animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl border border-[#E8ECE9] shadow-(--shadow-modal) max-h-[94vh] flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E8ECE9] flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold text-[#171C19]">
            {editingExpense ? t('expenses.editTitle') : t('expenses.addTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#818A84] hover:bg-[#F5F7F6] hover:text-[#171C19]"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {groups.length === 0 ? (
          <div className="p-8 text-center space-y-4">
            <p className="text-sm text-[#818A84]">{t('expenses.noGroupsForExpense')}</p>
            <button
              type="button"
              onClick={() => {
                onClose();
                openCreateGroupModal();
              }}
              className="px-5 py-2.5 rounded-2xl bg-[#35483F] text-white text-sm font-semibold hover:bg-[#2B3B33]"
            >
              {t('groups.createGroup')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5">
            {error && (
              <div className="px-4 py-3 rounded-2xl bg-[#FCEEEE] text-[#C94A4A] text-sm font-medium">
                {error}
              </div>
            )}

            {/* Hero Amount Input + Title (Fast Mobile Entry) */}
            <div className="space-y-3.5">
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
                    placeholder={t('expenses.form.amountPlaceholder')}
                    className="w-full min-h-[56px] pl-4 pr-20 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6] text-2xl font-bold tabular-nums text-[#171C19] placeholder:text-[#818A84]/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#35483F]/20 focus:border-[#35483F]"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#35483F] bg-[#E8F1EB] px-2.5 py-1.5 rounded-xl">
                    {currency}
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
                  className="w-full min-h-[46px] px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm text-[#171C19] placeholder:text-[#818A84] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#35483F]/20 focus:border-[#35483F]"
                />
              </div>
            </div>

            {/* Group & Paid By */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
                  {t('expenses.form.group')}
                </label>
                <select
                  disabled={Boolean(editingExpense)}
                  value={groupId}
                  onChange={(e) => handleGroupChange(e.target.value)}
                  className="w-full min-h-[46px] px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm font-medium text-[#171C19] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#35483F]/20 focus:border-[#35483F] disabled:opacity-60"
                >
                  {groups.map((g) => (
                    <option key={g.group.id} value={g.group.id}>
                      {g.group.name} ({g.group.currency})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-sm font-semibold text-[#171C19]">
                    {t('expenses.form.paidBy')}
                  </label>
                  {!editingExpense && (selectedGroupDetails?.members.length ?? 0) >= 2 && (
                    <div className="inline-flex rounded-xl bg-[#F5F7F6] p-0.5 border border-[#E8ECE9] text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setPayerMode('single')}
                        className={`px-2.5 py-1 rounded-lg transition-all ${
                          payerMode === 'single'
                            ? 'bg-[#35483F] text-white shadow-2xs'
                            : 'text-[#606A64] hover:text-[#171C19]'
                        }`}
                      >
                        1 osoba
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPayerMode('multiple');
                          if (Object.keys(payerInputs).length === 0 && parsedAmountMinor && selectedGroupDetails) {
                            const init: Record<string, string> = {};
                            for (const m of selectedGroupDetails.members) {
                              init[m.user_id] = m.user_id === paidBy ? minorToEditableString(parsedAmountMinor) : '';
                            }
                            setPayerInputs(init);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg transition-all ${
                          payerMode === 'multiple'
                            ? 'bg-[#35483F] text-white shadow-2xs'
                            : 'text-[#606A64] hover:text-[#171C19]'
                        }`}
                      >
                        Više osoba
                      </button>
                    </div>
                  )}
                </div>

                {payerMode === 'single' ? (
                  <select
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    className="w-full min-h-[46px] px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm font-medium text-[#171C19] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#35483F]/20 focus:border-[#35483F]"
                  >
                    {selectedGroupDetails?.members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.user_id === user?.id
                          ? `${m.profile.first_name} ${m.profile.last_name} (${t('common.you')})`
                          : `${m.profile.first_name} ${m.profile.last_name}`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-[#606A64] py-2.5 px-3 rounded-2xl bg-[#E8F1EB]/60 border border-[#35483F]/15">
                    Unesi ispod koliko je svako <strong>dao novca</strong> za ovaj račun.
                  </p>
                )}
              </div>
            </div>

            {/* Multi-Payer Inputs Card (Splitwise "Multiple people paid") */}
            {payerMode === 'multiple' && selectedGroupDetails && (
              <div className="p-4 rounded-2xl bg-[#F5F7F6] border border-[#E8ECE9] space-y-2.5">
                <p className="text-xs font-bold text-[#35483F]">
                  Ko je koliko platio (dao novca)?
                </p>
                <div className="space-y-2">
                  {selectedGroupDetails.members.map((m) => {
                    const fullName = `${m.profile.first_name} ${m.profile.last_name}`.trim();
                    return (
                      <div
                        key={m.user_id}
                        className="flex items-center justify-between gap-2.5 bg-white px-3 py-2 rounded-xl border border-[#E8ECE9]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <MemberAvatar profile={m.profile} size="xs" />
                          <span className="text-xs sm:text-sm font-medium text-[#171C19] truncate">
                            {fullName}
                            {m.user_id === user?.id && (
                              <span className="text-xs text-[#818A84] ml-1">({t('common.you')})</span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={payerInputs[m.user_id] ?? ''}
                            onChange={(e) =>
                              setPayerInputs((prev) => ({
                                ...prev,
                                [m.user_id]: e.target.value,
                              }))
                            }
                            placeholder="0"
                            className="w-28 px-3 py-1.5 rounded-xl border border-[#E8ECE9] text-right text-sm font-semibold tabular-nums focus:outline-none focus:border-[#35483F]"
                          />
                          <span className="text-xs text-[#818A84] w-8">{currency}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {parsedAmountMinor && parsedAmountMinor > 0 && (
                  <div
                    className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between ${
                      multiPayerSummary.valid
                        ? 'bg-[#E6F4EE] text-[#16835B]'
                        : 'bg-[#FDF4E6] text-[#B87314]'
                    }`}
                  >
                    <span>
                      {multiPayerSummary.valid
                        ? t('expenses.form.exactMatch')
                        : multiPayerSummary.diffMinor > 0
                        ? 'Preostalo za unos uplata'
                        : 'Prekoračen ukupan iznos za'}
                    </span>
                    {!multiPayerSummary.valid && (
                      <span className="tabular-nums">
                        {formatCurrency(Math.abs(multiPayerSummary.diffMinor), currency, lang)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Split Method Tabs + Friendly 1-Line Explanation */}
            <div>
              <label className="block text-sm font-semibold text-[#171C19] mb-2">
                {t('expenses.form.splitMethod')}
              </label>
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
                    className={`min-h-[40px] py-2 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                      splitMethod === method
                        ? 'bg-[#35483F] text-white shadow-xs'
                        : 'text-[#818A84] hover:text-[#171C19]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#818A84] mt-2">
                {splitMethod === 'equal'
                  ? t('guide.hints.splitEqual')
                  : splitMethod === 'custom'
                  ? 'Unesi koliko je svako POTROŠIO (čiji je koliki deo računa). Ako je više osoba dalo novac za račun, izaberi gore „Više osoba“ kod Ko je platio.'
                  : t('guide.hints.splitPercentage')}
              </p>
            </div>

            {/* Participants & Per-Participant Split Inputs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-[#171C19]">
                  {t('expenses.form.participants')} ({participantIds.length})
                </label>
                <div className="flex items-center gap-3 text-xs font-semibold text-[#35483F]">
                  <button
                    type="button"
                    onClick={() =>
                      setParticipantIds(
                        selectedGroupDetails?.members.map((m) => m.user_id) ?? []
                      )
                    }
                    className="hover:underline"
                  >
                    {t('expenses.form.selectAll')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setParticipantIds([])}
                    className="text-[#818A84] hover:text-[#171C19]"
                  >
                    {t('expenses.form.deselectAll')}
                  </button>
                </div>
              </div>

              {payerExcluded && (
                <div className="flex items-start gap-2 px-3.5 py-2.5 mb-2.5 rounded-2xl bg-[#E8F1EB]/70 text-xs text-[#35483F]">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{t('expenses.form.payerExcludedHint')}</span>
                </div>
              )}

              <div className="space-y-2">
                {selectedGroupDetails?.members.map((m) => {
                  const checked = participantIds.includes(m.user_id);
                  const equalShare = splitPreview.shares.find((s) => s.userId === m.user_id);
                  const fullName = `${m.profile.first_name} ${m.profile.last_name}`.trim();

                  return (
                    <div
                      key={m.user_id}
                      className={`flex items-center justify-between gap-3 p-3 rounded-2xl border transition-all ${
                        checked
                          ? 'bg-white border-[#35483F]/30 shadow-xs'
                          : 'bg-[#F5F7F6]/60 border-[#E8ECE9] opacity-70'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleParticipant(m.user_id)}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left"
                      >
                        <span
                          className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition-colors ${
                            checked
                              ? 'bg-[#35483F] border-[#35483F] text-white'
                              : 'bg-white border-[#CBD4CE]'
                          }`}
                        >
                          {checked && <Check className="w-3.5 h-3.5" />}
                        </span>
                        <MemberAvatar profile={m.profile} size="sm" />
                        <span className="text-sm font-medium text-[#171C19] truncate">
                          {fullName}
                          {m.user_id === user?.id && (
                            <span className="text-xs text-[#818A84] ml-1">({t('common.you')})</span>
                          )}
                        </span>
                      </button>

                      {checked && splitMethod === 'equal' && equalShare && (
                        <span className="text-sm font-bold text-[#35483F] tabular-nums shrink-0">
                          {formatCurrency(equalShare.shareAmountMinor, currency, lang)}
                        </span>
                      )}

                      {checked && splitMethod === 'custom' && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={customInputs[m.user_id] ?? ''}
                            onChange={(e) =>
                              setCustomInputs((prev) => ({
                                ...prev,
                                [m.user_id]: e.target.value,
                              }))
                            }
                            placeholder="0,00"
                            className="w-28 px-3 py-1.5 rounded-xl border border-[#E8ECE9] text-right text-sm font-semibold tabular-nums focus:outline-none focus:border-[#35483F]"
                          />
                          <span className="text-xs text-[#818A84] w-8">{currency}</span>
                        </div>
                      )}

                      {checked && splitMethod === 'percentage' && (
                        <div className="flex items-center gap-2 shrink-0">
                          {equalShare && splitPreview.valid && (
                            <span className="text-xs text-[#818A84] tabular-nums hidden sm:inline">
                              {formatCurrency(equalShare.shareAmountMinor, currency, lang)}
                            </span>
                          )}
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={percentInputs[m.user_id] ?? ''}
                              onChange={(e) =>
                                setPercentInputs((prev) => ({
                                  ...prev,
                                  [m.user_id]: e.target.value,
                                }))
                              }
                              placeholder="0"
                              className="w-20 pl-2.5 pr-6 py-1.5 rounded-xl border border-[#E8ECE9] text-right text-sm font-semibold tabular-nums focus:outline-none focus:border-[#35483F]"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#818A84]">
                              %
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Live Validation Status Bar for Custom / Percentage */}
              {parsedAmountMinor && parsedAmountMinor > 0 && participantIds.length > 0 && splitMethod === 'custom' && (
                <div
                  className={`mt-2.5 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between ${
                    splitPreview.valid
                      ? 'bg-[#E6F4EE] text-[#16835B]'
                      : 'bg-[#FDF4E6] text-[#B87314]'
                  }`}
                >
                  <span>
                    {splitPreview.valid
                      ? t('expenses.form.exactMatch')
                      : splitPreview.diffMinor > 0
                      ? t('expenses.form.remaining')
                      : t('expenses.form.overAllocated')}
                  </span>
                  {!splitPreview.valid && (
                    <span className="tabular-nums">
                      {formatCurrency(Math.abs(splitPreview.diffMinor), currency, lang)}
                    </span>
                  )}
                </div>
              )}

              {parsedAmountMinor && parsedAmountMinor > 0 && participantIds.length > 0 && splitMethod === 'percentage' && (
                <div
                  className={`mt-2.5 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between ${
                    splitPreview.valid
                      ? 'bg-[#E6F4EE] text-[#16835B]'
                      : 'bg-[#FDF4E6] text-[#B87314]'
                  }`}
                >
                  <span>{t('expenses.form.percentTotal')}</span>
                  <span className="tabular-nums">{(splitPreview.totalBps / 100).toFixed(2)}% / 100%</span>
                </div>
              )}
            </div>

            {/* Collapsible Optional Details (keeps quick expense entry effortless on mobile) */}
            <div className="rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/50 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowMoreOptions((v) => !v)}
                className="w-full min-h-[46px] px-4 py-3 flex items-center justify-between gap-2 text-left text-xs sm:text-sm font-semibold text-[#35483F] hover:bg-[#E8F1EB]/40 transition-colors"
              >
                <span>
                  {showMoreOptions ? t('guide.hints.hideOptions') : t('guide.hints.moreOptions')}
                </span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 transition-transform ${
                    showMoreOptions ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showMoreOptions && (
                <div className="p-4 pt-2 space-y-4 border-t border-[#E8ECE9] bg-white">
                  {/* Category & Date */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
                        {t('expenses.form.category')}
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                        className="w-full min-h-[46px] px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm font-medium text-[#171C19] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#35483F]/20 focus:border-[#35483F]"
                      >
                        {EXPENSE_CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {t(`expenses.categories.${c.id}`)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
                        {t('expenses.form.date')}
                      </label>
                      <input
                        type="date"
                        required
                        value={expenseDate}
                        onChange={(e) => setExpenseDate(e.target.value)}
                        className="w-full min-h-[46px] px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm font-medium text-[#171C19] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#35483F]/20 focus:border-[#35483F]"
                      />
                    </div>
                  </div>

                  {/* Optional Description */}
                  <div>
                    <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
                      {t('expenses.form.description')}{' '}
                      <span className="font-normal text-[#818A84]">({t('common.optional')})</span>
                    </label>
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t('expenses.form.descriptionPlaceholder')}
                      className="w-full px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm text-[#171C19] placeholder:text-[#818A84] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#35483F]/20 focus:border-[#35483F] resize-none"
                    />
                  </div>

                  {/* Optional Receipt Image */}
                  <div>
                    <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
                      {t('expenses.form.receipt')}{' '}
                      <span className="font-normal text-[#818A84]">({t('common.optional')})</span>
                    </label>
                    {receiptUrl ? (
                      <div className="flex items-center gap-4 p-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60">
                        <img
                          src={receiptUrl}
                          alt={t('expenses.receipt')}
                          className="w-14 h-14 rounded-xl object-cover border border-[#E8ECE9]"
                        />
                        <button
                          type="button"
                          onClick={() => setReceiptUrl(null)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C94A4A] hover:underline"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t('common.removeImage')}
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 min-h-[46px] px-4 py-3 rounded-2xl border border-dashed border-[#CBD4CE] bg-[#F5F7F6]/50 hover:bg-[#E8F1EB]/40 text-sm font-medium text-[#476457] cursor-pointer transition-colors">
                        <ImagePlus className="w-4 h-4" />
                        <span>{uploading ? t('app.loading') : t('common.upload')}</span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploading}
                          onChange={handleReceiptUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Splitwise-Style Live Plain-Language Preview (Zero Confusion Before Saving) */}
            {splitPreview.valid && parsedAmountMinor && selectedGroupDetails && (
              <div className="rounded-2xl bg-[#E8F1EB]/70 border border-[#35483F]/15 p-3.5 space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#35483F]">
                  {t('expenses.form.livePreviewTitle')}
                </p>
                {(() => {
                  const effectivePayers: PayerContribution[] =
                    payerMode === 'multiple'
                      ? multiPayerSummary.contributions
                      : paidBy && parsedAmountMinor
                      ? [{ userId: paidBy, paidMinor: parsedAmountMinor }]
                      : [];

                  if (payerMode === 'multiple' && !multiPayerSummary.valid) {
                    return (
                      <p className="text-xs text-[#B87314] font-medium">
                        Unesi tačne uplate gore tako da zbir bude{' '}
                        {formatCurrency(parsedAmountMinor ?? 0, currency, lang, {
                          compactZeroDecimals: true,
                        })}
                        .
                      </p>
                    );
                  }

                  const transfers = computeMultiPayerTransfers(
                    effectivePayers,
                    splitPreview.shares
                  );

                  if (transfers.length === 0) {
                    return (
                      <p className="text-xs text-[#35483F] font-medium">
                        {t('common.settledUp')}
                      </p>
                    );
                  }

                  const getName = (uid: string) => {
                    if (uid === user?.id) return t('common.you');
                    const mem = selectedGroupDetails.members.find((m) => m.user_id === uid);
                    return mem?.profile.first_name ?? t('common.member');
                  };

                  return (
                    <div className="space-y-1">
                      {transfers.map((tr) => {
                        const fromName = getName(tr.fromUserId);
                        const toName = getName(tr.toUserId);
                        return (
                          <p
                            key={`${tr.fromUserId}-${tr.toUserId}`}
                            className="text-xs font-semibold text-[#171C19] flex items-center justify-between gap-2"
                          >
                            <span>
                              {tr.fromUserId === user?.id
                                ? t('expenses.form.liveYouOwe', { payer: toName })
                                : tr.toUserId === user?.id
                                ? t('expenses.form.liveOwesYou', { name: fromName })
                                : `${fromName} → ${toName}`}
                            </span>
                            <span
                              className={`tabular-nums font-bold ${
                                tr.fromUserId === user?.id ? 'text-[#C94A4A]' : 'text-[#16835B]'
                              }`}
                            >
                              {formatCurrency(tr.amountMinor, currency, lang, {
                                compactZeroDecimals: true,
                              })}
                            </span>
                          </p>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={onClose}
                className="px-5 py-3 rounded-2xl text-sm font-medium text-[#171C19] bg-[#F5F7F6] hover:bg-[#E8ECE9] transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting || uploading}
                className="px-6 py-3 rounded-2xl text-sm font-semibold text-white bg-[#35483F] hover:bg-[#2B3B33] transition-colors disabled:opacity-50"
              >
                {submitting
                  ? t('common.saving')
                  : editingExpense
                  ? t('expenses.form.submitEdit')
                  : t('expenses.form.submitAdd')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
