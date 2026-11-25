import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  FolderPlus,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import type { AppLanguage } from '../types';
import {
  calculateEqualSplit,
  convertMinorCurrency,
  formatCurrency,
  getDefaultCurrencyForLanguage,
  minorToEditableString,
  parseMajorToMinor,
} from '../utils/finance';
import {
  formatSerbianAccount,
  generateIpsQrString,
  isValidSerbianAccount,
  parseAndValidateSerbianAccount,
} from '../utils/ipsQr';
import {
  buildEditableReceiptItems,
  calculateItemizedSplit,
  majorToMinor,
  type EditableReceiptItem,
  type ParsedFiscalReceipt,
} from '../utils/fiscalReceipt';
import { ReceiptScannerModal } from '../components/ReceiptScannerModal';
import { ReceiptItemSplitter } from '../components/ReceiptItemSplitter';
import { DebtReminderModal, type DebtReminderData } from '../components/DebtReminderModal';

const SESSION_KEY = 'podeli_quick_bill_v3';
const LOCAL_BANK_KEY = 'podeli_quick_bank_account';
const LOCAL_BANK_NAME_KEY = 'podeli_quick_bank_name';

interface QuickPerson {
  id: string;
  name: string;
  isPayer: boolean;
}

interface QuickBillDraft {
  step: 1 | 2 | 3;
  splitMode: 'equal' | 'itemized';
  placeName: string;
  amountInput: string;
  receiptTotalMinor?: number;
  tipPreset: 0 | 5 | 10 | 'custom';
  customTipInput: string;
  people: QuickPerson[];
  items: EditableReceiptItem[];
  customOverridesMinor: Record<string, number | undefined>;
  paidIds: string[];
}

function loadDraft(defaultPayerName: string, personPrefix: string): QuickBillDraft {
  const fallback: QuickBillDraft = {
    step: 1,
    splitMode: 'equal',
    placeName: '',
    amountInput: '',
    tipPreset: 0,
    customTipInput: '',
    people: [
      { id: 'me', name: defaultPayerName, isPayer: true },
      { id: 'p_2', name: `${personPrefix} 2`, isPayer: false },
    ],
    items: [],
    customOverridesMinor: {},
    paidIds: [],
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<QuickBillDraft>;
    return {
      ...fallback,
      ...parsed,
      people:
        Array.isArray(parsed.people) && parsed.people.length >= 2
          ? parsed.people
          : fallback.people,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      paidIds: Array.isArray(parsed.paidIds) ? parsed.paidIds : [],
    };
  } catch {
    return fallback;
  }
}

export const QuickBillPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';
  const activeCurrency = getDefaultCurrencyForLanguage(lang);
  const navigate = useNavigate();
  const { user, isDemo, updateProfile } = useAuth();
  const { createGroup, createExpense } = useData();
  const { showToast } = useToast();

  const defaultPayerName = user
    ? user.first_name?.trim() || t('common.you')
    : t('quickBill.mePayer');
  const personPrefix = t('quickBill.personPrefix');

  const [draft, setDraft] = useState<QuickBillDraft>(() =>
    loadDraft(defaultPayerName, personPrefix)
  );
  const [scannerOpen, setScannerOpen] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [selectedDebtorId, setSelectedDebtorId] = useState<string | null>(null);
  const [reminderData, setReminderData] = useState<DebtReminderData | null>(null);
  const [savingToGroup, setSavingToGroup] = useState(false);

  // Local + Profile bank account state for instant IPS QR at the table
  const [savedBankAccount, setSavedBankAccount] = useState<string>(() => {
    if (user?.bank_account && isValidSerbianAccount(user.bank_account)) {
      return user.bank_account;
    }
    if (typeof window !== 'undefined') {
      const local = window.localStorage.getItem(LOCAL_BANK_KEY) || '';
      if (isValidSerbianAccount(local)) return local;
    }
    return '';
  });
  const [bankInput, setBankInput] = useState('');
  const [bankError, setBankError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.bank_account && isValidSerbianAccount(user.bank_account)) {
      setSavedBankAccount(user.bank_account);
    }
  }, [user?.bank_account]);

  // Persist draft in sessionStorage (local-only, never touches DB)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(draft));
    } catch {
      // Ignore storage quota errors
    }
  }, [draft]);

  const updateDraft = (patch: Partial<QuickBillDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  // Set exact total number of people at the table (including payer, min 2, max 20)
  const setPeopleCount = (targetCount: number) => {
    const clamped = Math.max(2, Math.min(20, targetCount));
    setDraft((prev) => {
      let nextPeople = [...prev.people];
      if (clamped > nextPeople.length) {
        for (let i = nextPeople.length + 1; i <= clamped; i++) {
          nextPeople.push({
            id: `p_${Date.now()}_${i}`,
            name: `${personPrefix} ${i}`,
            isPayer: false,
          });
        }
      } else if (clamped < nextPeople.length) {
        nextPeople = nextPeople.slice(0, clamped);
      }
      const validIds = new Set(nextPeople.map((p) => p.id));
      return {
        ...prev,
        people: nextPeople,
        customOverridesMinor: {},
        paidIds: prev.paidIds.filter((id) => validIds.has(id)),
      };
    });
  };

  const isItemizedMode = draft.items.length > 0 && draft.splitMode === 'itemized';

  const baseSubtotalMinor = useMemo(() => {
    if (isItemizedMode) {
      return draft.items.reduce((acc, it) => acc + it.totalPriceMinor, 0);
    }
    return parseMajorToMinor(draft.amountInput) ?? 0;
  }, [isItemizedMode, draft.items, draft.amountInput]);

  const tipMinor = useMemo(() => {
    if (draft.tipPreset === 'custom') {
      return parseMajorToMinor(draft.customTipInput) ?? 0;
    }
    if (draft.tipPreset === 0) return 0;
    return Math.round((baseSubtotalMinor * draft.tipPreset) / 100);
  }, [draft.tipPreset, draft.customTipInput, baseSubtotalMinor]);

  const grandTotalMinor = baseSubtotalMinor + tipMinor;

  const hasCustomOverrides = useMemo(
    () => Object.values(draft.customOverridesMinor).some((v) => typeof v === 'number'),
    [draft.customOverridesMinor]
  );

  const itemizedResult = useMemo(() => {
    if (!isItemizedMode) return null;
    return calculateItemizedSplit(draft.items, tipMinor, 'proportional');
  }, [isItemizedMode, draft.items, tipMinor]);

  // Exact integer minor-unit shares per person (itemized OR equal/custom)
  const sharesByPerson = useMemo<Record<string, number>>(() => {
    if (draft.people.length === 0 || grandTotalMinor <= 0) return {};

    if (isItemizedMode && itemizedResult) {
      return itemizedResult.sharesByUser;
    }

    const overrides = draft.customOverridesMinor;
    const overriddenIds = draft.people
      .map((p) => p.id)
      .filter((id) => typeof overrides[id] === 'number' && (overrides[id] ?? 0) >= 0);
    const overriddenSum = overriddenIds.reduce((acc, id) => acc + (overrides[id] ?? 0), 0);
    const remainingIds = draft.people.map((p) => p.id).filter((id) => !overriddenIds.includes(id));

    const map: Record<string, number> = {};
    for (const id of overriddenIds) {
      map[id] = overrides[id] ?? 0;
    }

    const remainingMinor = Math.max(0, grandTotalMinor - overriddenSum);
    if (remainingIds.length > 0 && remainingMinor > 0) {
      const equal = calculateEqualSplit(remainingMinor, remainingIds);
      for (const s of equal) {
        map[s.userId] = s.shareAmountMinor;
      }
    } else {
      for (const id of remainingIds) {
        map[id] = 0;
      }
    }
    return map;
  }, [draft.people, grandTotalMinor, isItemizedMode, itemizedResult, draft.customOverridesMinor]);

  const allocatedSumMinor = useMemo(
    () => draft.people.reduce((acc, p) => acc + (sharesByPerson[p.id] ?? 0), 0),
    [draft.people, sharesByPerson]
  );

  const allocationDiffMinor = grandTotalMinor - allocatedSumMinor;

  // Debtors = everyone except the payer who owes > 0
  const debtors = useMemo(() => {
    return draft.people
      .filter((p) => !p.isPayer)
      .map((p) => ({
        ...p,
        amountMinor: sharesByPerson[p.id] ?? 0,
        paid: draft.paidIds.includes(p.id),
      }))
      .filter((d) => d.amountMinor > 0);
  }, [draft.people, sharesByPerson, draft.paidIds]);

  const totalToCollectMinor = useMemo(
    () => debtors.reduce((acc, d) => acc + d.amountMinor, 0),
    [debtors]
  );

  const equalPerPersonMinor = useMemo(() => {
    if (grandTotalMinor <= 0 || draft.people.length === 0) return 0;
    return Math.round(grandTotalMinor / draft.people.length);
  }, [grandTotalMinor, draft.people.length]);

  useEffect(() => {
    if (draft.step !== 3) return;
    if (debtors.length === 0) {
      setSelectedDebtorId(null);
      return;
    }
    if (!selectedDebtorId || !debtors.some((d) => d.id === selectedDebtorId)) {
      const firstUnpaid = debtors.find((d) => !d.paid) ?? debtors[0];
      setSelectedDebtorId(firstUnpaid.id);
    }
  }, [draft.step, debtors, selectedDebtorId]);

  const activeDebtor = debtors.find((d) => d.id === selectedDebtorId) ?? debtors[0] ?? null;

  const recipientDisplayName =
    user?.bank_recipient_name ||
    (user ? `${user.first_name} ${user.last_name}`.trim() : '') ||
    (typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_BANK_NAME_KEY) : '') ||
    defaultPayerName;

  const activeQrString = useMemo(() => {
    if (!activeDebtor || !savedBankAccount || !isValidSerbianAccount(savedBankAccount)) {
      return null;
    }
    try {
      const rsdMinor = convertMinorCurrency(activeDebtor.amountMinor, activeCurrency, 'RSD');
      return generateIpsQrString({
        recipientAccount: savedBankAccount,
        recipientName: recipientDisplayName,
        amountMinor: rsdMinor,
        purpose: `Podeli - ${draft.placeName || 'Brzi racun'}`.slice(0, 35),
      });
    } catch {
      return null;
    }
  }, [activeDebtor, savedBankAccount, recipientDisplayName, draft.placeName, activeCurrency]);

  const handleReceiptParsed = (receipt: ParsedFiscalReceipt) => {
    setScannerOpen(false);
    const allIds = draft.people.map((p) => p.id);
    const items = buildEditableReceiptItems(receipt.items, allIds);
    const hasMultiple = items.length > 1;
    const totalMinor = majorToMinor(receipt.totalAmount);
    updateDraft({
      placeName: receipt.merchantName || draft.placeName,
      amountInput: minorToEditableString(totalMinor),
      receiptTotalMinor: totalMinor,
      items,
      splitMode: hasMultiple ? 'itemized' : 'equal',
      customOverridesMinor: {},
      step: 2,
    });
  };

  const handleChangePayer = (newPayerId: string) => {
    updateDraft({
      people: draft.people.map((p) => ({
        ...p,
        isPayer: p.id === newPayerId,
      })),
      paidIds: draft.paidIds.filter((id) => id !== newPayerId),
    });
  };

  const handleAddPerson = (customName?: string) => {
    const label = (customName ?? newPersonName).trim();
    if (!label) return;
    const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    updateDraft({
      people: [...draft.people, { id, name: label, isPayer: false }],
      customOverridesMinor: {},
    });
    if (!customName) setNewPersonName('');
  };

  const handleQuickAddNumberedPerson = () => {
    const nextNum = draft.people.length + 1;
    handleAddPerson(`${personPrefix} ${nextNum}`);
  };

  const handleRemovePerson = (personId: string) => {
    if (draft.people.length <= 2) return;
    updateDraft({
      people: draft.people.filter((p) => p.id !== personId),
      customOverridesMinor: {},
      paidIds: draft.paidIds.filter((id) => id !== personId),
    });
  };

  const handleRenamePerson = (personId: string, name: string) => {
    updateDraft({
      people: draft.people.map((p) => (p.id === personId ? { ...p, name } : p)),
    });
  };

  const handleTogglePaid = (personId: string) => {
    const exists = draft.paidIds.includes(personId);
    updateDraft({
      paidIds: exists
        ? draft.paidIds.filter((id) => id !== personId)
        : [...draft.paidIds, personId],
    });
  };

  const handleSaveInlineBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setBankError(null);
    const check = parseAndValidateSerbianAccount(bankInput);
    if (!check.valid || !check.normalized) {
      setBankError(t('ips.invalidAccountError'));
      return;
    }

    setSavedBankAccount(check.normalized);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCAL_BANK_KEY, check.normalized);
      if (recipientDisplayName) {
        window.localStorage.setItem(LOCAL_BANK_NAME_KEY, recipientDisplayName);
      }
    }

    if (user) {
      try {
        await updateProfile({
          bank_account: check.normalized,
          bank_recipient_name: recipientDisplayName,
        });
      } catch {
        // Still works locally
      }
    }
    showToast(t('ips.bankSavedSuccess'), 'success');
  };

  const handleFinishAndClear = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(SESSION_KEY);
    }
    navigate(user ? '/' : '/login');
  };

  const handleSaveToGroups = async () => {
    if (!user) {
      showToast(t('quickBill.loginToSaveHint'), 'info');
      navigate('/login?redirect=/brzi-racun');
      return;
    }
    if (grandTotalMinor <= 0) return;

    setSavingToGroup(true);
    try {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const baseTitle = draft.placeName.trim() || t('quickBill.defaultPlace');
      const groupName = `${baseTitle} ${dd}.${mm}.`;

      const createdGroup = await createGroup({
        name: groupName,
        description: t('quickBill.savedGroupDesc'),
        category: 'nights_out',
        currency: activeCurrency,
      });

      const breakdownLines = draft.people.map(
        (p) =>
          `• ${p.name}: ${formatCurrency(sharesByPerson[p.id] ?? 0, activeCurrency, lang)}${
            draft.paidIds.includes(p.id) ? ` (${t('quickBill.paidTag')})` : ''
          }`
      );

      await createExpense({
        group_id: createdGroup.id,
        title: baseTitle,
        description: breakdownLines.join('\n'),
        amount_minor: grandTotalMinor,
        currency: activeCurrency,
        paid_by: user.id,
        category: 'food',
        split_method: 'equal',
        expense_date: now.toISOString().slice(0, 10),
        receipt_url: null,
        shares: [{ userId: user.id, shareAmountMinor: grandTotalMinor }],
      });

      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(SESSION_KEY);
      }
      showToast(t('quickBill.savedToGroupsSuccess'), 'success');
      navigate(`/groups/${createdGroup.id}`);
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setSavingToGroup(false);
    }
  };

  const canProceedStep1 = grandTotalMinor > 0 && draft.people.length >= 2;
  const canProceedStep2 =
    draft.people.length >= 2 &&
    grandTotalMinor > 0 &&
    (isItemizedMode ? Boolean(itemizedResult?.allItemsAssigned) : allocationDiffMinor === 0);

  const othersCount = Math.max(1, draft.people.length - 1);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-[#F5F7F6] flex flex-col">
      {/* Minimal Header with Safe-Area Notch Padding */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E8ECE9] pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 px-3.5 sm:px-4">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              if (draft.step > 1) {
                updateDraft({ step: (draft.step - 1) as 1 | 2 });
              } else {
                navigate(user ? '/' : '/login');
              }
            }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#606A64] hover:text-[#171C19] py-1 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{draft.step > 1 ? t('common.back') : t('common.close')}</span>
          </button>

          <div className="flex items-center gap-1.5 text-sm font-bold text-[#171C19] min-w-0">
            <Zap className="w-4 h-4 text-[#35483F] shrink-0" />
            <span className="truncate">{t('quickBill.title')}</span>
          </div>

          <span className="text-xs font-bold text-[#35483F] bg-[#E8F1EB] px-2.5 py-1 rounded-full tabular-nums shrink-0">
            {draft.step} / 3
          </span>
        </div>

        {/* Clean 3-Step Progress Bar */}
        <div className="max-w-xl mx-auto grid grid-cols-3 gap-1.5 mt-2.5">
          {([1, 2, 3] as const).map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-colors ${
                draft.step >= s ? 'bg-[#35483F]' : 'bg-[#E8ECE9]'
              }`}
            />
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-xl mx-auto px-3.5 sm:px-4 pt-5 pb-28 space-y-4">
        {/* ================= STEP 1: AMOUNT + PEOPLE COUNT ================= */}
        {draft.step === 1 && (
          <div className="space-y-4 animate-fade-in-up">
            <div>
              <h1 className="text-xl font-bold text-[#171C19]">{t('quickBill.step1Title')}</h1>
              <p className="text-xs text-[#818A84] mt-0.5">{t('quickBill.step1Subtitle')}</p>
            </div>

            <div className="bg-white rounded-3xl border border-[#E8ECE9] p-4 sm:p-5 space-y-4 shadow-(--shadow-card)">
              {/* Amount Input */}
              <div>
                <label className="block text-xs font-semibold text-[#818A84] mb-1.5">
                  {t('quickBill.totalAmountLabel')}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    value={draft.amountInput}
                    onChange={(e) =>
                      updateDraft({ amountInput: e.target.value, customOverridesMinor: {} })
                    }
                    placeholder="2.000"
                    className="w-full min-h-[58px] px-4 pr-16 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-2xl font-bold text-[#171C19] tabular-nums focus:bg-white focus:outline-none focus:border-[#35483F]"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[#818A84]">
                    {activeCurrency}
                  </span>
                </div>
              </div>

              {/* Instant People Count Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-[#606A64]">
                    {t('quickBill.howManyPeople')}
                  </label>
                  <span className="text-xs font-bold text-[#35483F] shrink-0">
                    {t('quickBill.youPlusOthers', { others: othersCount })}
                  </span>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {[2, 3, 4, 5, 6].map((cnt) => {
                    const active = draft.people.length === cnt;
                    return (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setPeopleCount(cnt)}
                        className={`min-h-[42px] rounded-xl text-sm font-bold border transition-all ${
                          active
                            ? 'bg-[#35483F] text-white border-[#35483F] shadow-xs'
                            : 'bg-[#F5F7F6] text-[#171C19] border-[#E8ECE9] hover:border-[#35483F]/40'
                        }`}
                      >
                        {cnt}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setPeopleCount(draft.people.length - 1)}
                    disabled={draft.people.length <= 2}
                    aria-label="-"
                    className="min-h-[42px] rounded-xl border border-[#E8ECE9] bg-white text-[#606A64] flex items-center justify-center disabled:opacity-40"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeopleCount(draft.people.length + 1)}
                    aria-label="+"
                    className="min-h-[42px] rounded-xl border border-[#E8ECE9] bg-white text-[#35483F] flex items-center justify-center"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Instant Live Equal Split Card */}
              {grandTotalMinor > 0 && (
                <div className="rounded-2xl bg-gradient-to-br from-[#35483F] to-[#476457] text-white p-4 space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-[#E8F1EB]/85 font-medium">
                      {t('quickBill.eachOwesYouLabel')}
                    </span>
                    <span className="text-2xl font-bold tabular-nums">
                      {formatCurrency(equalPerPersonMinor, activeCurrency, lang, {
                        compactZeroDecimals: true,
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-[#E8F1EB]/90 leading-relaxed">
                    {othersCount === 1
                      ? t('quickBill.instantSummaryOne', {
                          total: formatCurrency(grandTotalMinor, activeCurrency, lang, {
                            compactZeroDecimals: true,
                          }),
                          each: formatCurrency(equalPerPersonMinor, activeCurrency, lang, {
                            compactZeroDecimals: true,
                          }),
                        })
                      : t('quickBill.instantSummaryMany', {
                          total: formatCurrency(grandTotalMinor, activeCurrency, lang, {
                            compactZeroDecimals: true,
                          }),
                          others: othersCount,
                          each: formatCurrency(equalPerPersonMinor, activeCurrency, lang, {
                            compactZeroDecimals: true,
                          }),
                          collectTotal: formatCurrency(totalToCollectMinor, activeCurrency, lang, {
                            compactZeroDecimals: true,
                          }),
                        })}
                  </p>
                </div>
              )}

              {/* Optional Place Name */}
              <div>
                <label className="block text-xs font-semibold text-[#818A84] mb-1.5">
                  {t('quickBill.placeLabel')}
                </label>
                <input
                  type="text"
                  value={draft.placeName}
                  onChange={(e) => updateDraft({ placeName: e.target.value })}
                  placeholder={t('quickBill.placePlaceholder')}
                  className="w-full min-h-[44px] px-4 py-2 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
                />
              </div>

              {/* AI Photo Receipt Scan for Itemized Split */}
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-[#E8F1EB] hover:bg-[#D5E6DB] text-[#35483F] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Camera className="w-4 h-4 shrink-0" />
                <span>Slikaj ceo račun (AI čitanje)</span>
              </button>
            </div>

            {/* Discreet Optional Tip Selector */}
            <div className="bg-white rounded-3xl border border-[#E8ECE9] p-4 space-y-2.5 shadow-(--shadow-card)">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#606A64]">{t('receipt.tipLabel')}</span>
                {tipMinor > 0 && (
                  <span className="text-xs font-bold text-[#35483F] tabular-nums">
                    +{formatCurrency(tipMinor, activeCurrency, lang, { compactZeroDecimals: true })}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {([0, 5, 10, 'custom'] as const).map((preset) => {
                  const active = draft.tipPreset === preset;
                  return (
                    <button
                      key={String(preset)}
                      type="button"
                      onClick={() => updateDraft({ tipPreset: preset, customOverridesMinor: {} })}
                      className={`min-h-[38px] rounded-xl text-xs font-semibold border transition-colors ${
                        active
                          ? 'bg-[#35483F] text-white border-[#35483F]'
                          : 'bg-[#F5F7F6] text-[#606A64] border-[#E8ECE9] hover:text-[#171C19]'
                      }`}
                    >
                      {preset === 'custom' ? t('receipt.tipCustom') : `${preset}%`}
                    </button>
                  );
                })}
              </div>
              {draft.tipPreset === 'custom' && (
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.customTipInput}
                  onChange={(e) =>
                    updateDraft({ customTipInput: e.target.value, customOverridesMinor: {} })
                  }
                  placeholder="300"
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm font-semibold text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
                />
              )}
            </div>
          </div>
        )}

        {/* ================= STEP 2: NAMES & UNEQUAL / CUSTOM SPLIT ================= */}
        {draft.step === 2 && (
          <div className="space-y-4 animate-fade-in-up">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-[#171C19]">{t('quickBill.step2Title')}</h1>
                <p className="text-xs text-[#818A84] mt-0.5">
                  {t('quickBill.step2UnequalHint')}
                </p>
              </div>
              {hasCustomOverrides && (
                <button
                  type="button"
                  onClick={() => updateDraft({ customOverridesMinor: {} })}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[#E8F1EB] text-[#35483F] text-[11px] font-semibold shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{t('quickBill.resetToEqual')}</span>
                </button>
              )}
            </div>

            {/* Add Person Row */}
            <div className="bg-white rounded-3xl border border-[#E8ECE9] p-4 space-y-3 shadow-(--shadow-card)">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddPerson();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  placeholder={t('quickBill.addPersonPlaceholder')}
                  className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
                />
                <button
                  type="submit"
                  aria-label={t('common.add')}
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-[#35483F] hover:bg-[#2B3B33] text-white flex items-center justify-center transition-colors shrink-0"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-2">
                {draft.people.map((person) => (
                  <span
                    key={person.id}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                      person.isPayer
                        ? 'bg-[#35483F] text-white'
                        : 'bg-[#E8F1EB] text-[#35483F]'
                    }`}
                  >
                    <span className="max-w-[120px] truncate">
                      {person.name}
                      {person.isPayer ? ` (${t('quickBill.paidTagShort')})` : ''}
                    </span>
                    {!person.isPayer && draft.people.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemovePerson(person.id)}
                        aria-label={t('common.delete')}
                        className="hover:text-[#C94A4A]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                ))}

                <button
                  type="button"
                  onClick={handleQuickAddNumberedPerson}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-[#35483F]/35 text-xs font-semibold text-[#35483F] hover:bg-[#E8F1EB]/50 transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>
                    + {personPrefix} {draft.people.length + 1}
                  </span>
                </button>
              </div>
            </div>

            {/* Mode toggle when fiscal QR items are loaded */}
            {draft.items.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-white rounded-2xl border border-[#E8ECE9]">
                <button
                  type="button"
                  onClick={() => updateDraft({ splitMode: 'itemized' })}
                  className={`min-h-[40px] rounded-xl text-xs font-semibold transition-all ${
                    draft.splitMode === 'itemized'
                      ? 'bg-[#35483F] text-white shadow-xs'
                      : 'text-[#606A64]'
                  }`}
                >
                  {t('quickBill.splitItemizedTab')}
                </button>
                <button
                  type="button"
                  onClick={() => updateDraft({ splitMode: 'equal', customOverridesMinor: {} })}
                  className={`min-h-[40px] rounded-xl text-xs font-semibold transition-all ${
                    draft.splitMode === 'equal'
                      ? 'bg-[#35483F] text-white shadow-xs'
                      : 'text-[#606A64]'
                  }`}
                >
                  {t('quickBill.splitEqualTab')}
                </button>
              </div>
            )}

            {/* Itemized Split via reusable ReceiptItemSplitter OR Editable Per-Person Amounts */}
            {isItemizedMode ? (
              <ReceiptItemSplitter
                participants={draft.people.map((p) => ({
                  id: p.id,
                  name: p.name,
                  isMe: p.id === 'me',
                }))}
                paidById={draft.people.find((p) => p.isPayer)?.id ?? draft.people[0]?.id ?? 'me'}
                onPaidByChange={handleChangePayer}
                items={draft.items}
                onItemsChange={(nextItems) => updateDraft({ items: nextItems })}
                currency={activeCurrency}
                receiptTotalMinor={draft.receiptTotalMinor}
                tipPreset={draft.tipPreset}
                onTipPresetChange={(preset) =>
                  updateDraft({ tipPreset: preset, customOverridesMinor: {} })
                }
                customTipInput={draft.customTipInput}
                onCustomTipInputChange={(val) =>
                  updateDraft({ customTipInput: val, customOverridesMinor: {} })
                }
                showPayerSelector
                showInlineSummary
              />
            ) : (
            <div className="bg-white rounded-3xl border border-[#E8ECE9] divide-y divide-[#E8ECE9] overflow-hidden shadow-(--shadow-card)">
              {draft.people.map((person) => {
                const shareMinor = sharesByPerson[person.id] ?? 0;
                const hasOverride = typeof draft.customOverridesMinor[person.id] === 'number';
                return (
                  <div
                    key={person.id}
                    className="px-3.5 sm:px-4 py-3 flex items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      {person.isPayer ? (
                        <div>
                          <p className="text-sm font-bold text-[#171C19] truncate">
                            {person.name} ({t('quickBill.paidTagShort')})
                          </p>
                          <p className="text-[11px] text-[#16835B] font-medium">
                            {t('quickBill.yourShareNote')}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <input
                            type="text"
                            value={person.name}
                            onChange={(e) => handleRenamePerson(person.id, e.target.value)}
                            className="w-full text-sm font-bold text-[#171C19] bg-transparent border-b border-transparent focus:border-[#35483F] focus:outline-none py-0.5"
                          />
                          <p className="text-[11px] text-[#818A84]">{t('quickBill.owesYouNote')}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={minorToEditableString(shareMinor)}
                        onChange={(e) => {
                          const val = parseMajorToMinor(e.target.value);
                          const next = { ...draft.customOverridesMinor };
                          if (val === null) {
                            delete next[person.id];
                          } else {
                            next[person.id] = val;
                          }
                          updateDraft({ customOverridesMinor: next });
                        }}
                        className={`w-24 text-right px-2.5 py-1.5 rounded-xl border text-base sm:text-sm font-bold tabular-nums focus:outline-none focus:border-[#35483F] ${
                          hasOverride
                            ? 'border-[#35483F] bg-[#E8F1EB]/40 text-[#35483F]'
                            : 'border-[#E8ECE9] bg-[#F5F7F6]/60 text-[#171C19]'
                        }`}
                      />
                      <span className="text-xs font-semibold text-[#818A84]">{activeCurrency}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            {!isItemizedMode && allocationDiffMinor !== 0 && (
              <div className="px-4 py-3 rounded-2xl bg-[#FCEEEE] text-[#C94A4A] text-xs font-semibold">
                {t('expenses.validation.customSumMismatch')} (
                {formatCurrency(Math.abs(allocationDiffMinor), activeCurrency, lang, {
                  compactZeroDecimals: true,
                })}
                )
              </div>
            )}
          </div>
        )}

        {/* ================= STEP 3: COLLECT AT THE TABLE (LIVE IPS QR) ================= */}
        {draft.step === 3 && (
          <div className="space-y-4 animate-fade-in-up">
            <div>
              <h1 className="text-xl font-bold text-[#171C19]">{t('quickBill.step3Title')}</h1>
              <p className="text-xs text-[#818A84] mt-0.5">
                {t('quickBill.step3SummaryLine', {
                  total: formatCurrency(grandTotalMinor, activeCurrency, lang, {
                    compactZeroDecimals: true,
                  }),
                  count: draft.people.length,
                  collectTotal: formatCurrency(totalToCollectMinor, activeCurrency, lang, {
                    compactZeroDecimals: true,
                  }),
                })}
              </p>
            </div>

            {/* Person Switcher Pills */}
            {debtors.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {debtors.map((d) => {
                  const active = activeDebtor?.id === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelectedDebtorId(d.id)}
                      className={`min-h-[40px] px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap border inline-flex items-center gap-1.5 transition-all shrink-0 ${
                        active
                          ? 'bg-[#35483F] text-white border-[#35483F] shadow-xs'
                          : d.paid
                          ? 'bg-[#E6F4EE] text-[#16835B] border-[#16835B]/25 line-through opacity-80'
                          : 'bg-white text-[#171C19] border-[#E8ECE9]'
                      }`}
                    >
                      {d.paid && <Check className="w-3.5 h-3.5" />}
                      <span>
                        {d.name}:{' '}
                        {formatCurrency(d.amountMinor, activeCurrency, lang, { compactZeroDecimals: true })}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Centerpiece NBS IPS QR Card */}
            {activeDebtor && (
              <div className="bg-white rounded-3xl border border-[#E8ECE9] p-5 text-center space-y-4 shadow-(--shadow-card)">
                <div>
                  <p className="text-xs font-semibold text-[#818A84]">
                    {t('quickBill.personOwesYouTitle', { name: activeDebtor.name })}
                  </p>
                  <p className="text-3xl font-bold text-[#35483F] tabular-nums mt-0.5">
                    {formatCurrency(activeDebtor.amountMinor, activeCurrency, lang, {
                      compactZeroDecimals: true,
                    })}
                  </p>
                </div>

                {activeQrString ? (
                  <div className="flex flex-col items-center space-y-2.5">
                    <div
                      className="bg-white p-3.5 rounded-2xl border-2 border-[#E8ECE9] shadow-xs inline-flex items-center justify-center max-w-full"
                      style={{ backgroundColor: '#FFFFFF' }}
                    >
                      <QRCodeCanvas
                        value={activeQrString}
                        size={212}
                        level="M"
                        includeMargin={true}
                        bgColor="#FFFFFF"
                        fgColor="#000000"
                      />
                    </div>
                    <p className="text-xs text-[#606A64]">{t('ips.scanInstruction')}</p>
                    <p className="text-[11px] font-mono text-[#818A84] break-all">
                      {formatSerbianAccount(savedBankAccount)}
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={handleSaveInlineBank}
                    className="space-y-2.5 text-left max-w-sm mx-auto"
                  >
                    <label className="block text-xs font-semibold text-[#171C19]">
                      {t('quickBill.enterBankForQr')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={bankInput}
                        onChange={(e) => {
                          setBankInput(e.target.value);
                          setBankError(null);
                        }}
                        placeholder="160-123456-90"
                        className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E8ECE9] bg-[#F5F7F6]/60 font-mono text-base sm:text-sm text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
                      />
                      <button
                        type="submit"
                        className="min-h-[44px] px-4 rounded-xl bg-[#35483F] text-white text-xs font-semibold shrink-0"
                      >
                        {t('common.save')}
                      </button>
                    </div>
                    {bankError && (
                      <p className="text-xs font-semibold text-[#C94A4A]">{bankError}</p>
                    )}
                  </form>
                )}
              </div>
            )}

            {/* Debtors Checklist + Remind Button */}
            <div className="bg-white rounded-3xl border border-[#E8ECE9] divide-y divide-[#E8ECE9] overflow-hidden shadow-(--shadow-card)">
              {debtors.map((d) => (
                <div
                  key={d.id}
                  onClick={() => setSelectedDebtorId(d.id)}
                  className={`px-4 py-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    d.paid ? 'bg-[#F5F7F6]/70 opacity-65' : 'hover:bg-[#F5F7F6]/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePaid(d.id);
                      }}
                      aria-label={t('quickBill.paidTag')}
                      className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                        d.paid
                          ? 'bg-[#16835B] border-[#16835B] text-white'
                          : 'border-[#CBD4CE] bg-white text-transparent hover:border-[#35483F]'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-bold truncate ${
                          d.paid ? 'line-through text-[#818A84]' : 'text-[#171C19]'
                        }`}
                      >
                        {d.name}
                      </p>
                      <span
                        className={`text-[11px] font-medium ${
                          d.paid ? 'text-[#16835B] font-semibold' : 'text-[#818A84]'
                        }`}
                      >
                        {d.paid ? t('quickBill.paidTag') : t('quickBill.owesYouNote')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold text-[#35483F] tabular-nums">
                      {formatCurrency(d.amountMinor, activeCurrency, lang, { compactZeroDecimals: true })}
                    </span>
                    {!d.paid && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReminderData({
                            debtorName: d.name,
                            amountMinor: d.amountMinor,
                            currency: activeCurrency,
                            groupName: draft.placeName.trim() || t('quickBill.defaultPlace'),
                            shareToken: '',
                            creditorBankAccount: savedBankAccount || null,
                          });
                        }}
                        title={t('reminder.button')}
                        aria-label={t('reminder.button')}
                        className="w-9 h-9 rounded-xl bg-[#E8F1EB] hover:bg-[#D5E6DB] text-[#35483F] flex items-center justify-center transition-colors"
                      >
                        <Bell className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Subtle Finish Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleFinishAndClear}
                className="w-full sm:flex-1 min-h-[46px] px-4 py-2.5 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>{t('quickBill.finishAndClear')}</span>
              </button>

              <button
                type="button"
                disabled={savingToGroup}
                onClick={handleSaveToGroups}
                className="w-full sm:w-auto min-h-[46px] px-4 py-2.5 rounded-2xl bg-white hover:bg-[#F5F7F6] border border-[#E8ECE9] text-[#606A64] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
              >
                <FolderPlus className="w-4 h-4" />
                <span>
                  {savingToGroup ? t('common.saving') : t('quickBill.saveToGroups')}
                </span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Fixed Bottom Action Bar for Step 1 & Step 2 */}
      {draft.step < 3 && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E8ECE9] px-3.5 sm:px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-2">
            {draft.step === 1 ? (
              <>
                <button
                  type="button"
                  disabled={!canProceedStep1}
                  onClick={() => updateDraft({ step: 2 })}
                  className="min-h-[46px] px-3.5 py-2.5 rounded-2xl bg-white border border-[#E8ECE9] hover:bg-[#F5F7F6] text-[#35483F] text-xs sm:text-sm font-semibold disabled:opacity-40 transition-colors shrink-0"
                >
                  {t('quickBill.editSharesButton')}
                </button>
                <button
                  type="button"
                  disabled={!canProceedStep1}
                  onClick={() => updateDraft({ step: 3 })}
                  className="flex-1 min-w-0 min-h-[46px] px-4 py-2.5 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t('quickBill.showSummaryAndQr')}</span>
                </button>
              </>
            ) : (
              <>
                <div className="min-w-0">
                  <p className="text-[11px] text-[#818A84]">{t('quickBill.totalLabel')}</p>
                  <p className="text-base font-bold text-[#171C19] tabular-nums truncate">
                    {formatCurrency(grandTotalMinor, activeCurrency, lang, { compactZeroDecimals: true })}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canProceedStep2}
                  onClick={() => updateDraft({ step: 3 })}
                  className="min-h-[46px] px-4 sm:px-5 py-2.5 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 transition-colors shrink-0"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{t('quickBill.showSummaryAndQr')}</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Serbian eFiskalizacija QR Scanner Modal */}
      <ReceiptScannerModal
        open={scannerOpen}
        currency={activeCurrency}
        isDemo={isDemo}
        onParsed={handleReceiptParsed}
        onFallbackManual={() => setScannerOpen(false)}
        onClose={() => setScannerOpen(false)}
      />

      {/* Existing Anti-Blam Reminder Modal */}
      <DebtReminderModal
        open={Boolean(reminderData)}
        data={reminderData}
        onClose={() => setReminderData(null)}
      />
    </div>
  );
};
