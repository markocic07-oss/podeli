import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Bell,
  Building2,
  Camera,
  CheckCircle2,
  Plus,
  QrCode,
  Share2,
  Sparkles,
  UserCircle2,
  X,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { getBackend } from '../services/dataService';
import { getGuestIdentity, saveGuestIdentity } from '../lib/guestIdentity';
import { buildGroupShareUrl, shareGroupLink } from '../utils/share';
import { GROUP_CATEGORY_MAP } from '../utils/categories';
import {
  calculateGroupBalances,
  formatCurrency,
  minorToEditableString,
  parseMajorToMinor,
} from '../utils/finance';
import type {
  AppLanguage,
  Expense,
  GuestSession,
  PaymentMethod,
  Profile,
  Settlement,
  SharedGroupResult,
  UpsertExpenseInput,
} from '../types';
import { PodeliLogo } from '../components/PodeliLogo';
import { LanguageSelector } from '../components/LanguageSelector';
import { MemberAvatar } from '../components/MemberAvatar';
import { SettlementCard } from '../components/SettlementCard';
import {
  CategoryBreakdownCard,
  ExpensesByCategoryList,
} from '../components/ExpensesByCategoryList';
import { GuestIdentitySheet } from '../components/GuestIdentitySheet';
import { GuestAddExpenseModal } from '../components/GuestAddExpenseModal';
import { ExpenseDetailModal } from '../components/ExpenseDetailModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ReceiptScannerModal } from '../components/ReceiptScannerModal';
import { ItemizedSplitModal } from '../components/ItemizedSplitModal';
import { IpsQrPaymentModal, type IpsQrPaymentData } from '../components/IpsQrPaymentModal';
import { BankAccountQuickModal } from '../components/BankAccountQuickModal';
import { DebtReminderModal, type DebtReminderData } from '../components/DebtReminderModal';
import { isValidSerbianAccount } from '../utils/ipsQr';
import type { ParsedFiscalReceipt } from '../utils/fiscalReceipt';

type GuestTab = 'overview' | 'expenses' | 'debts' | 'members';

export const GuestGroupPage: React.FC = () => {
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';
  const { user, isDemo, isSupabaseReady } = useAuth();
  const { refresh } = useData();
  const { showToast } = useToast();

  const useDemoBackend = isDemo || !isSupabaseReady;
  const backend = useMemo(() => getBackend(useDemoBackend), [useDemoBackend]);

  const [data, setData] = useState<SharedGroupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<GuestTab>('overview');
  const [guestSession, setGuestSession] = useState<GuestSession | null>(null);
  const [identitySheetOpen, setIdentitySheetOpen] = useState(false);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [parsedReceipt, setParsedReceipt] = useState<ParsedFiscalReceipt | null>(null);
  const [ipsQrData, setIpsQrData] = useState<IpsQrPaymentData | null>(null);
  const [reminderData, setReminderData] = useState<DebtReminderData | null>(null);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  // Quick Mark-as-Paid modal state for guest
  const [payModal, setPayModal] = useState<{
    receiverId: string;
    receiverName: string;
    amountInput: string;
    paymentMethod: PaymentMethod;
    note: string;
  } | null>(null);
  const [payBusy, setPayBusy] = useState(false);

  const [settlementAction, setSettlementAction] = useState<{
    settlement: Settlement;
    action: 'confirmed' | 'rejected' | 'cancelled';
  } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const loadGroup = useCallback(async () => {
    if (!shareToken) {
      setData({ found: false, reason: 'not_found' });
      setLoading(false);
      return;
    }
    try {
      const res = await backend.getSharedGroup(shareToken);
      setData(res);

      if (res.found && res.group) {
        // If already logged in as a registered user, auto-join & open full group page
        if (user) {
          const alreadyIn = res.members?.some((m) => m.user_id === user.id);
          if (alreadyIn) {
            navigate(`/groups/${res.group.id}`, { replace: true });
            return;
          }
        } else {
          const saved = getGuestIdentity(res.group.id);
          const stillValid =
            saved && res.members?.some((m) => m.user_id === saved.guestMemberId);
          if (stillValid && saved) {
            setGuestSession(saved);
          } else {
            setGuestSession(null);
            setIdentitySheetOpen(true);
          }
        }
      }
    } catch {
      setData({ found: false, reason: 'not_found' });
    } finally {
      setLoading(false);
    }
  }, [shareToken, backend, user, navigate]);

  useEffect(() => {
    void loadGroup();
  }, [loadGroup]);

  const profilesMap = useMemo(() => {
    const map: Record<string, Profile> = {};
    for (const m of data?.members ?? []) {
      map[m.user_id] = m.profile;
    }
    return map;
  }, [data?.members]);

  const summary = useMemo(() => {
    if (!data?.found || !data.members) return null;
    return calculateGroupBalances(
      data.members.map((m) => m.user_id),
      data.expenses ?? [],
      data.settlements ?? []
    );
  }, [data]);

  const handleShareLink = async () => {
    if (!data?.group) return;
    const url = buildGroupShareUrl(data.group.share_token);
    const result = await shareGroupLink({
      title: `PODELI – ${data.group.name}`,
      text: t('groups.invite.shareMessage', { group: data.group.name }),
      url,
    });
    if (result === 'copied') {
      showToast(t('guest.linkCopiedToast'), 'success');
    } else if (result === 'failed') {
      showToast(t('app.errorGeneric'), 'error');
    }
  };

  const handleSelectExistingGuest = async (guestId: string) => {
    if (!shareToken) return;
    setIdentityBusy(true);
    try {
      const session = await backend.joinSharedGroupAsGuest(shareToken, {
        existingGuestId: guestId,
      });
      saveGuestIdentity(session);
      setGuestSession(session);
      setIdentitySheetOpen(false);
      await loadGroup();
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setIdentityBusy(false);
    }
  };

  const handleCreateNewGuest = async (displayName: string) => {
    if (!shareToken) return;
    setIdentityBusy(true);
    try {
      const session = await backend.joinSharedGroupAsGuest(shareToken, {
        displayName,
      });
      saveGuestIdentity(session);
      setGuestSession(session);
      setIdentitySheetOpen(false);
      showToast(t('guest.joinedAsToast', { name: session.displayName }), 'success');
      await loadGroup();
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setIdentityBusy(false);
    }
  };

  const handleJoinAsRegisteredUser = async () => {
    if (!user || !shareToken) return;
    setIdentityBusy(true);
    try {
      const groupId = await backend.joinSharedGroupAsUser(user.id, shareToken);
      await refresh();
      showToast(t('groups.join.joinedSuccess'), 'success');
      navigate(`/groups/${groupId}`, { replace: true });
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setIdentityBusy(false);
    }
  };

  const requireIdentityOrRun = (action: () => void) => {
    if (!guestSession) {
      setIdentitySheetOpen(true);
      return;
    }
    action();
  };

  const handleGuestCreateExpense = async (input: UpsertExpenseInput) => {
    if (!shareToken || !guestSession) return;
    await backend.guestCreateExpense(
      shareToken,
      guestSession.guestMemberId,
      guestSession.guestSessionToken,
      input
    );
    showToast(t('expenses.createdSuccess'), 'success');
    await loadGroup();
  };

  const handleSubmitGuestPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModal || !shareToken || !guestSession || !data?.group) return;
    const amountMinor = parseMajorToMinor(payModal.amountInput);
    if (!amountMinor || amountMinor <= 0) {
      showToast(t('expenses.validation.amountInvalid'), 'error');
      return;
    }
    setPayBusy(true);
    try {
      const created = await backend.guestCreateSettlement(
        shareToken,
        guestSession.guestMemberId,
        guestSession.guestSessionToken,
        {
          group_id: data.group.id,
          receiver_id: payModal.receiverId,
          amount_minor: amountMinor,
          payment_method: payModal.paymentMethod,
          note: payModal.note.trim() || null,
        }
      );
      showToast(
        created.status === 'confirmed'
          ? t('settlements.confirmedSuccess')
          : t('settlements.createdSuccess'),
        'success'
      );
      setPayModal(null);
      await loadGroup();
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setPayBusy(false);
    }
  };

  const handleSettlementTransition = async () => {
    if (!settlementAction || !shareToken || !guestSession) return;
    setActionBusy(true);
    try {
      await backend.guestTransitionSettlement(
        shareToken,
        guestSession.guestMemberId,
        guestSession.guestSessionToken,
        settlementAction.settlement.id,
        settlementAction.action
      );
      const toastKey =
        settlementAction.action === 'confirmed'
          ? 'settlements.confirmedSuccess'
          : settlementAction.action === 'rejected'
          ? 'settlements.rejectedSuccess'
          : 'settlements.cancelledSuccess';
      showToast(t(toastKey), 'success');
      setSettlementAction(null);
      await loadGroup();
    } catch {
      showToast(t('settlements.alreadyProcessed'), 'error');
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7F6] flex flex-col items-center justify-center gap-4">
        <PodeliLogo size="lg" />
        <div className="w-8 h-8 rounded-full border-2 border-[#E8ECE9] border-t-[#35483F] animate-spin" />
      </div>
    );
  }

  if (!data?.found || !data.group || !summary) {
    return (
      <div className="min-h-screen bg-[#F5F7F6] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-5">
          <div className="flex items-center justify-between">
            <PodeliLogo size="md" />
            <LanguageSelector variant="compact" />
          </div>
          <div className="bg-white rounded-3xl border border-[#E8ECE9] p-7 shadow-(--shadow-card) text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FCEEEE] text-[#C94A4A] flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold text-[#171C19]">
              {data?.reason === 'disabled'
                ? t('guest.linkDisabledTitle')
                : t('guest.linkNotFoundTitle')}
            </h1>
            <p className="text-sm text-[#818A84] leading-relaxed">
              {data?.reason === 'disabled'
                ? t('guest.linkDisabledDesc')
                : t('guest.linkNotFoundDesc')}
            </p>
            <Link
              to="/"
              className="block w-full py-3 rounded-2xl bg-[#35483F] text-white text-sm font-semibold hover:bg-[#2B3B33]"
            >
              {t('nav.home')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const group = data.group;
  const members = data.members ?? [];
  const expenses = data.expenses ?? [];
  const settlements = data.settlements ?? [];
  const catMeta = GROUP_CATEGORY_MAP[group.category] ?? GROUP_CATEGORY_MAP.other;

  const actingId = guestSession?.guestMemberId ?? '';
  const myBalance = actingId ? summary.balancesByUser[actingId]?.netBalanceMinor ?? 0 : 0;

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-[#F5F7F6] pb-28">
      {/* Clean Top Bar with Safe-Area Notch Padding */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-[#E8ECE9] pt-[env(safe-area-inset-top)]">
        <div className="max-w-3xl mx-auto px-3.5 sm:px-4 py-3 flex items-center justify-between gap-2">
          <PodeliLogo size="sm" />

          <div className="flex items-center gap-2">
            {!user && (
              <button
                type="button"
                onClick={() => setIdentitySheetOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#E8F1EB] text-[#35483F] text-xs font-semibold hover:bg-[#D8E8DD] transition-colors"
              >
                <UserCircle2 className="w-4 h-4 shrink-0" />
                <span className="max-w-[110px] truncate">
                  {guestSession ? guestSession.displayName : t('guest.pickNameChip')}
                </span>
              </button>
            )}
            <LanguageSelector variant="compact" />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-5 space-y-5 animate-fade-in-up">
        {/* If logged in as a registered user who isn't a member yet */}
        {user && (
          <div className="bg-[#E8F1EB] border border-[#35483F]/20 rounded-3xl p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#35483F]">
              {t('guest.loggedInJoinPrompt', { name: user.first_name || user.email })}
            </p>
            <button
              type="button"
              disabled={identityBusy}
              onClick={handleJoinAsRegisteredUser}
              className="px-4 py-2 rounded-xl bg-[#35483F] text-white text-xs font-semibold hover:bg-[#2B3B33]"
            >
              {t('groups.join.joinButton')}
            </button>
          </div>
        )}

        {/* Group Hero + Highlighted "Tvoj balans" */}
        <section className="rounded-[26px] bg-gradient-to-br from-[#35483F] via-[#3A5146] to-[#476457] text-white p-5 sm:p-6 shadow-(--shadow-hero)">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-2xl shrink-0">
                {catMeta.emoji}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                    {group.name}
                  </h1>
                  <span className="text-[11px] font-bold bg-white/15 px-2 py-0.5 rounded-full shrink-0">
                    {group.currency}
                  </span>
                </div>
                <p className="text-xs text-[#E8F1EB]/80 mt-0.5">
                  {t('common.membersCount', { count: members.length })} •{' '}
                  {t('groups.totalExpenses')}:{' '}
                  <strong className="tabular-nums text-white">
                    {formatCurrency(summary.totalExpensesMinor, group.currency, lang)}
                  </strong>
                </p>
              </div>
            </div>
          </div>

          {/* Highlighted Personal Balance ("Tvoj balans") */}
          <div className="mt-5 p-4 rounded-2xl bg-white/10 border border-white/12 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-[#E8F1EB]/75">
                {t('guest.yourBalanceLabel')}
                {guestSession ? ` • ${guestSession.displayName}` : ''}
              </p>
              {guestSession ? (
                <p
                  className={`text-2xl sm:text-3xl font-bold mt-1 tabular-nums ${
                    myBalance > 0
                      ? 'text-[#C9F5E1]'
                      : myBalance < 0
                      ? 'text-[#FFD2D2]'
                      : 'text-white'
                  }`}
                >
                  {myBalance === 0
                    ? t('common.settledUp')
                    : formatCurrency(myBalance, group.currency, lang, { showSign: true })}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setIdentitySheetOpen(true)}
                  className="mt-1 text-sm font-semibold underline text-[#E8F1EB] hover:text-white"
                >
                  {t('guest.tapToPickIdentity')}
                </button>
              )}
            </div>

            {guestSession && myBalance !== 0 && (
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                  myBalance > 0
                    ? 'bg-[#16835B]/45 text-[#C9F5E1]'
                    : 'bg-[#C94A4A]/45 text-[#FFD2D2]'
                }`}
              >
                {myBalance > 0 ? t('dashboard.owedToYou') : t('dashboard.youOwe')}
              </span>
            )}
          </div>

          {/* Primary Actions: Add Expense + Scan Fiscal QR + Share Link */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <button
              type="button"
              onClick={() => requireIdentityOrRun(() => setAddExpenseOpen(true))}
              className="min-h-[46px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 rounded-2xl bg-white text-[#35483F] hover:bg-[#E8F1EB] text-[11px] sm:text-sm font-semibold shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-full">{t('nav.addExpense')}</span>
            </button>

            <button
              type="button"
              onClick={() => requireIdentityOrRun(() => setScannerOpen(true))}
              className="min-h-[46px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 rounded-2xl bg-white/18 hover:bg-white/28 text-white text-[11px] sm:text-sm font-semibold transition-colors"
            >
              <Camera className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-full">Slikaj račun</span>
            </button>

            <button
              type="button"
              onClick={handleShareLink}
              className="min-h-[46px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 rounded-2xl bg-white/15 hover:bg-white/25 text-white text-[11px] sm:text-sm font-semibold transition-colors"
            >
              <Share2 className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-full">{t('guest.shareLinkButton')}</span>
            </button>
          </div>
        </section>

        {/* Clean 4-Tab Bar */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-white rounded-2xl border border-[#E8ECE9]">
          {(
            [
              ['overview', t('groups.tabs.overview')],
              ['expenses', t('groups.tabs.expenses')],
              ['debts', t('groups.tabs.debts')],
              ['members', t('groups.tabs.members')],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`min-h-[42px] px-1.5 py-2 rounded-xl text-[12px] sm:text-sm font-semibold transition-all truncate ${
                activeTab === key
                  ? 'bg-[#35483F] text-white shadow-xs'
                  : 'text-[#818A84] hover:text-[#171C19]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl border border-[#E8ECE9] p-5 shadow-(--shadow-card) space-y-3.5">
              <h2 className="text-base font-bold text-[#171C19]">
                {t('settlements.suggestedTitle')}
              </h2>
              {summary.suggestedTransfers.length === 0 ? (
                <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-[#E6F4EE] text-[#16835B] text-sm font-semibold">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>{t('settlements.noSuggestions')}</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {summary.suggestedTransfers.map((tr) => {
                    const from = profilesMap[tr.fromUserId];
                    const to = profilesMap[tr.toUserId];
                    const isMeSender = tr.fromUserId === actingId;
                    const toName = `${to?.first_name ?? ''} ${to?.last_name ?? ''}`.trim();
                    return (
                      <div
                        key={`${tr.fromUserId}-${tr.toUserId}`}
                        className="p-3.5 rounded-2xl bg-[#F5F7F6] flex flex-wrap items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <MemberAvatar profile={from} size="sm" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-sm font-semibold text-[#171C19]">
                              <span className="truncate">
                                {isMeSender ? t('common.you') : from?.first_name}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-[#818A84] shrink-0" />
                              <span className="truncate">
                                {tr.toUserId === actingId ? t('common.you') : to?.first_name}
                              </span>
                            </div>
                            <p className="text-sm font-bold text-[#35483F] tabular-nums">
                              {formatCurrency(tr.amountMinor, group.currency, lang)}
                            </p>
                          </div>
                        </div>

                        {isMeSender && (
                          <button
                            type="button"
                            onClick={() =>
                              requireIdentityOrRun(() =>
                                setPayModal({
                                  receiverId: tr.toUserId,
                                  receiverName: toName,
                                  amountInput: minorToEditableString(tr.amountMinor),
                                  paymentMethod: 'cash',
                                  note: '',
                                })
                              )
                            }
                            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-xs font-semibold shrink-0"
                          >
                            {t('settlements.markAsPaid')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <CategoryBreakdownCard
              expenses={expenses}
              currency={group.currency}
              onSelectCategory={() => setActiveTab('expenses')}
            />
          </div>
        )}

        {/* TAB 2: EXPENSES */}
        {activeTab === 'expenses' && (
          <div className="space-y-3">
            {expenses.length === 0 ? (
              <div className="bg-white rounded-3xl border border-[#E8ECE9] p-8 text-center space-y-3">
                <p className="text-sm font-semibold text-[#171C19]">{t('expenses.emptyTitle')}</p>
                <button
                  type="button"
                  onClick={() => requireIdentityOrRun(() => setAddExpenseOpen(true))}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-[#35483F] text-white text-sm font-semibold"
                >
                  <Plus className="w-4 h-4" />
                  {t('nav.addExpense')}
                </button>
              </div>
            ) : (
              <ExpensesByCategoryList
                entries={expenses.map((expense) => ({ expense }))}
                profilesMap={profilesMap}
                currentUserId={actingId}
                onSelectExpense={(exp) => setSelectedExpense(exp)}
              />
            )}
          </div>
        )}

        {/* TAB 3: DEBTS & SETTLEMENTS */}
        {activeTab === 'debts' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl border border-[#E8ECE9] p-5 shadow-(--shadow-card) space-y-3">
              <p className="text-xs text-[#818A84]">{t('guide.hints.debtsHelper')}</p>
              {summary.suggestedTransfers.length === 0 ? (
                <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-[#E6F4EE] text-[#16835B] text-sm font-semibold">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{t('settlements.noSuggestions')}</span>
                </div>
              ) : (
                summary.suggestedTransfers.map((tr) => {
                  const from = profilesMap[tr.fromUserId];
                  const to = profilesMap[tr.toUserId];
                  const isMeSender = tr.fromUserId === actingId;
                  const toName = `${to?.first_name ?? ''} ${to?.last_name ?? ''}`.trim();
                  const toAccount = to?.bank_account ?? null;
                  const canPayIps =
                    group.currency === 'RSD' &&
                    Boolean(toAccount && isValidSerbianAccount(toAccount));
                  const recipientDisplayName =
                    to?.bank_recipient_name || toName || t('common.member');
                  const actingProfile = actingId ? profilesMap[actingId] : undefined;
                  const showAddMyBankCta =
                    group.currency === 'RSD' &&
                    Boolean(guestSession) &&
                    tr.toUserId === actingId &&
                    !actingProfile?.bank_account;

                  return (
                    <div
                      key={`${tr.fromUserId}-${tr.toUserId}`}
                      className="p-3.5 rounded-2xl bg-[#F5F7F6] space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <MemberAvatar profile={from} size="sm" />
                          <span className="text-sm font-semibold text-[#171C19]">
                            {isMeSender ? t('common.you') : from?.first_name} →{' '}
                            {tr.toUserId === actingId ? t('common.you') : to?.first_name}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 ml-auto">
                          <span className="text-sm font-bold text-[#35483F] tabular-nums mr-1">
                            {formatCurrency(tr.amountMinor, group.currency, lang)}
                          </span>
                          {canPayIps && toAccount && (
                            <button
                              type="button"
                              onClick={() =>
                                setIpsQrData({
                                  recipientAccount: toAccount,
                                  recipientName: recipientDisplayName,
                                  amountMinor: tr.amountMinor,
                                  groupName: group.name,
                                  receiverId: tr.toUserId,
                                })
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#E8F1EB] hover:bg-[#D5E6DB] text-[#35483F] text-xs font-bold transition-colors"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>{t('ips.payButton')}</span>
                            </button>
                          )}
                          {!isMeSender && (
                            <button
                              type="button"
                              onClick={() =>
                                setReminderData({
                                  debtorName: from?.first_name || t('common.member'),
                                  amountMinor: tr.amountMinor,
                                  currency: group.currency,
                                  groupName: group.name,
                                  shareToken: group.share_token,
                                  creditorBankAccount: toAccount,
                                })
                              }
                              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                                tr.toUserId === actingId
                                  ? 'bg-[#E8F1EB] hover:bg-[#D5E6DB] text-[#35483F]'
                                  : 'bg-white hover:bg-[#E8ECE9]/60 border border-[#E8ECE9] text-[#606A64]'
                              }`}
                            >
                              <Bell className="w-3.5 h-3.5" />
                              <span>{t('reminder.button')}</span>
                            </button>
                          )}
                          {isMeSender && (
                            <button
                              type="button"
                              onClick={() =>
                                requireIdentityOrRun(() =>
                                  setPayModal({
                                    receiverId: tr.toUserId,
                                    receiverName: toName,
                                    amountInput: minorToEditableString(tr.amountMinor),
                                    paymentMethod: 'cash',
                                    note: '',
                                  })
                                )
                              }
                              className="px-3.5 py-2 rounded-xl bg-[#35483F] text-white text-xs font-semibold"
                            >
                              {t('settlements.markAsPaid')}
                            </button>
                          )}
                        </div>
                      </div>

                      {showAddMyBankCta && (
                        <button
                          type="button"
                          onClick={() => setBankModalOpen(true)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-dashed border-[#35483F]/30 text-left text-xs text-[#35483F] hover:bg-[#E8F1EB]/40 transition-colors"
                        >
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <Building2 className="w-3.5 h-3.5 shrink-0" />
                            <span>{t('ips.addBankCta')}</span>
                          </span>
                          <span className="font-bold shrink-0">{t('ips.addBankAction')} →</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {settlements.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-sm font-bold text-[#171C19] px-1">
                  {t('settlements.historyTitle')}
                </h3>
                {settlements.map((s) => (
                  <SettlementCard
                    key={s.id}
                    settlement={s}
                    currency={group.currency}
                    profilesMap={profilesMap}
                    currentUserId={actingId}
                    onConfirm={(st) => setSettlementAction({ settlement: st, action: 'confirmed' })}
                    onReject={(st) => setSettlementAction({ settlement: st, action: 'rejected' })}
                    onCancel={(st) => setSettlementAction({ settlement: st, action: 'cancelled' })}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: MEMBERS */}
        {activeTab === 'members' && (
          <div className="space-y-2.5">
            {members.map((m) => {
              const bal = summary.balancesByUser[m.user_id];
              const net = bal?.netBalanceMinor ?? 0;
              const fullName = `${m.profile.first_name} ${m.profile.last_name}`.trim();
              return (
                <div
                  key={m.user_id}
                  className="bg-white rounded-2xl border border-[#E8ECE9] p-4 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MemberAvatar profile={m.profile} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#171C19] truncate">
                        {fullName}
                        {m.user_id === actingId && (
                          <span className="text-xs text-[#818A84] ml-1">({t('common.you')})</span>
                        )}
                      </p>
                      {m.is_guest && (
                        <span className="text-[11px] font-medium text-[#476457]">
                          {t('guest.guestBadge')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-sm font-bold tabular-nums shrink-0 ${
                      net > 0 ? 'text-[#16835B]' : net < 0 ? 'text-[#C94A4A]' : 'text-[#818A84]'
                    }`}
                  >
                    {net === 0
                      ? t('common.settledUp')
                      : formatCurrency(net, group.currency, lang, { showSign: true })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Discreet Soft Account Upgrade Banner (Never blocks guest usage) */}
      {!user && (
        <div className="fixed bottom-0 inset-x-0 z-20 p-3 bg-white/95 backdrop-blur-md border-t border-[#E8ECE9] safe-area-bottom">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-[#171C19]">
              <Sparkles className="w-4 h-4 text-[#35483F] shrink-0" />
              <span>{t('guest.upgradeBannerText')}</span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Link
                to={`/register?redirect=${encodeURIComponent(`/groups/${group.id}`)}`}
                className="flex-1 sm:flex-none text-center px-4 py-2 rounded-xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-xs font-semibold whitespace-nowrap transition-colors"
              >
                {t('guest.upgradeCta')}
              </Link>
              <Link
                to={`/login?redirect=${encodeURIComponent(`/groups/${group.id}`)}`}
                className="px-3.5 py-2 rounded-xl bg-[#F5F7F6] hover:bg-[#E8ECE9] text-[#171C19] text-xs font-semibold whitespace-nowrap"
              >
                {t('auth.loginButton')}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Identity Picker Sheet */}
      <GuestIdentitySheet
        open={identitySheetOpen}
        groupName={group.name}
        shareToken={group.share_token}
        members={members}
        currentGuestId={guestSession?.guestMemberId}
        busy={identityBusy}
        onSelectExistingGuest={handleSelectExistingGuest}
        onCreateNewGuest={handleCreateNewGuest}
        onClose={() => setIdentitySheetOpen(false)}
      />

      {/* Guest Add Expense Modal */}
      {guestSession && (
        <>
          <GuestAddExpenseModal
            open={addExpenseOpen}
            group={group}
            members={members}
            actingMemberId={guestSession.guestMemberId}
            onSubmit={handleGuestCreateExpense}
            onClose={() => setAddExpenseOpen(false)}
          />

          <ReceiptScannerModal
            open={scannerOpen}
            isDemo={useDemoBackend}
            currency={group.currency}
            onParsed={(receipt) => {
              setScannerOpen(false);
              setParsedReceipt(receipt);
            }}
            onFallbackManual={() => setAddExpenseOpen(true)}
            onClose={() => setScannerOpen(false)}
          />

          <ItemizedSplitModal
            open={Boolean(parsedReceipt)}
            receipt={parsedReceipt}
            group={group}
            members={members}
            actingMemberId={guestSession.guestMemberId}
            onSave={handleGuestCreateExpense}
            onClose={() => setParsedReceipt(null)}
          />
        </>
      )}

      {/* Anti-Blam Debt Reminder Modal */}
      <DebtReminderModal
        open={Boolean(reminderData)}
        data={reminderData}
        onClose={() => setReminderData(null)}
      />

      {/* NBS IPS QR Payment Modal */}
      <IpsQrPaymentModal
        open={Boolean(ipsQrData)}
        data={ipsQrData}
        onMarkAsPaid={() => {
          if (!ipsQrData) return;
          const payload = ipsQrData;
          requireIdentityOrRun(() =>
            setPayModal({
              receiverId: payload.receiverId,
              receiverName: payload.recipientName,
              amountInput: minorToEditableString(payload.amountMinor),
              paymentMethod: 'bank_transfer',
              note: '',
            })
          );
        }}
        onClose={() => setIpsQrData(null)}
      />

      {/* Quick Bank Account Modal for Guest */}
      {guestSession && shareToken && (
        <BankAccountQuickModal
          open={bankModalOpen}
          initialAccount={profilesMap[guestSession.guestMemberId]?.bank_account}
          initialRecipientName={profilesMap[guestSession.guestMemberId]?.bank_recipient_name}
          defaultRecipientName={guestSession.displayName}
          onSave={async (bankAccount, bankRecipientName) => {
            await backend.updateGuestBankAccount(
              shareToken,
              guestSession.guestMemberId,
              guestSession.guestSessionToken,
              bankAccount,
              bankRecipientName
            );
            await loadGroup();
            showToast(t('ips.bankSavedSuccess'), 'success');
          }}
          onClose={() => setBankModalOpen(false)}
        />
      )}

      {/* Expense Detail Modal (Read-only for guests) */}
      <ExpenseDetailModal
        expense={selectedExpense}
        groupName={group.name}
        profilesMap={profilesMap}
        currentUserId={actingId}
        canModify={false}
        onClose={() => setSelectedExpense(null)}
        onEdit={() => {}}
        onDelete={async () => {}}
      />

      {/* Quick Mark-as-Paid Modal for Guest */}
      {payModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#171C19]/45 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white w-full sm:max-w-md rounded-3xl border border-[#E8ECE9] shadow-(--shadow-modal) max-h-[88dvh] flex flex-col overflow-hidden animate-scale-in">
            <div className="px-5 py-3.5 border-b border-[#E8ECE9] flex items-center justify-between shrink-0">
              <h2 className="text-base font-bold text-[#171C19]">{t('settlements.markAsPaid')}</h2>
              <button
                type="button"
                onClick={() => setPayModal(null)}
                className="p-1.5 rounded-xl text-[#818A84]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitGuestPayment} className="p-4 sm:p-5 overflow-y-auto overscroll-contain flex-1 space-y-4">
              <p className="text-sm text-[#606A64]">
                {t('settlements.form.receiver')}:{' '}
                <strong className="text-[#171C19]">{payModal.receiverName}</strong>
              </p>

              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={payModal.amountInput}
                  onChange={(e) => setPayModal({ ...payModal, amountInput: e.target.value })}
                  className="w-full min-h-[50px] pl-4 pr-16 py-2.5 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6] text-xl font-bold tabular-nums focus:bg-white focus:outline-none focus:border-[#35483F]"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#35483F] bg-[#E8F1EB] px-2 py-1 rounded-lg">
                  {group.currency}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['cash', Banknote],
                    ['bank_transfer', Building2],
                  ] as const
                ).map(([method, Icon]) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPayModal({ ...payModal, paymentMethod: method })}
                    className={`min-h-[44px] flex items-center justify-center gap-1.5 rounded-2xl border text-xs font-semibold ${
                      payModal.paymentMethod === method
                        ? 'bg-[#35483F] text-white border-[#35483F]'
                        : 'bg-white text-[#171C19] border-[#E8ECE9]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{t(`settlements.methods.${method}`)}</span>
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={payModal.note}
                onChange={(e) => setPayModal({ ...payModal, note: e.target.value })}
                placeholder={t('settlements.form.notePlaceholder')}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
              />

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={payBusy}
                  onClick={() => setPayModal(null)}
                  className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#F5F7F6] text-sm font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={payBusy}
                  className="min-h-[44px] px-5 py-2 rounded-2xl bg-[#35483F] text-white text-sm font-semibold disabled:opacity-50"
                >
                  {payBusy ? t('common.saving') : t('settlements.markAsPaid')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(settlementAction)}
        variant={settlementAction?.action === 'confirmed' ? 'primary' : 'danger'}
        title={
          settlementAction?.action === 'confirmed'
            ? t('settlements.confirmDialogTitle')
            : settlementAction?.action === 'rejected'
            ? t('settlements.rejectDialogTitle')
            : t('settlements.cancelDialogTitle')
        }
        description={
          settlementAction
            ? formatCurrency(settlementAction.settlement.amount_minor, group.currency, lang)
            : ''
        }
        loading={actionBusy}
        onConfirm={handleSettlementTransition}
        onCancel={() => setSettlementAction(null)}
      />
    </div>
  );
};
