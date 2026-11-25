import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  Camera,
  CheckCircle2,
  Edit3,
  Handshake,
  Plus,
  QrCode,
  Search,
  Share2,
  Shield,
  Trash2,
  UserMinus,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import type { AppLanguage, Expense, ExpenseCategory, Settlement } from '../types';
import { EXPENSE_CATEGORIES, GROUP_CATEGORY_MAP } from '../utils/categories';
import { calculateGroupBalances, formatCurrency } from '../utils/finance';
import { MemberAvatar } from '../components/MemberAvatar';
import { ExpenseCard } from '../components/ExpenseCard';
import { SettlementCard } from '../components/SettlementCard';
import {
  CategoryBreakdownCard,
  ExpensesByCategoryList,
} from '../components/ExpensesByCategoryList';
import { InviteModal } from '../components/InviteModal';
import { CreateGroupModal } from '../components/CreateGroupModal';
import { ExpenseDetailModal } from '../components/ExpenseDetailModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ReceiptScannerModal } from '../components/ReceiptScannerModal';
import { ItemizedSplitModal } from '../components/ItemizedSplitModal';
import { IpsQrPaymentModal, type IpsQrPaymentData } from '../components/IpsQrPaymentModal';
import { BankAccountQuickModal } from '../components/BankAccountQuickModal';
import { DebtReminderModal, type DebtReminderData } from '../components/DebtReminderModal';
import { isValidSerbianAccount } from '../utils/ipsQr';
import type { ParsedFiscalReceipt } from '../utils/fiscalReceipt';

type TabKey = 'overview' | 'expenses' | 'members' | 'debts';

export const GroupDetailPage: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';
  const { user, isDemo, updateProfile } = useAuth();
  const {
    groups,
    profilesMap,
    refresh,
    deleteGroup,
    removeMember,
    createExpense,
    deleteExpense,
    transitionSettlement,
    undoConfirmedSettlement,
    openAddExpenseModal,
    openSettleModal,
  } = useData();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [parsedReceipt, setParsedReceipt] = useState<ParsedFiscalReceipt | null>(null);
  const [ipsQrData, setIpsQrData] = useState<IpsQrPaymentData | null>(null);
  const [reminderData, setReminderData] = useState<DebtReminderData | null>(null);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string } | null>(null);
  const [settlementAction, setSettlementAction] = useState<{
    settlement: Settlement;
    action: 'confirmed' | 'rejected' | 'cancelled' | 'undo';
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // Expense filters inside group
  const [expSearch, setExpSearch] = useState('');
  const [expCategory, setExpCategory] = useState<ExpenseCategory | 'all'>('all');
  const [expMember, setExpMember] = useState<string>('all');
  const [expViewMode, setExpViewMode] = useState<'category' | 'date'>('category');

  const details = useMemo(
    () => groups.find((g) => g.group.id === groupId) ?? null,
    [groups, groupId]
  );

  const summary = useMemo(() => {
    if (!details) return null;
    return calculateGroupBalances(
      details.members.map((m) => m.user_id),
      details.expenses,
      details.settlements
    );
  }, [details]);

  const filteredExpenses = useMemo(() => {
    if (!details) return [];
    const q = expSearch.trim().toLowerCase();
    return details.expenses.filter((exp) => {
      if (expCategory !== 'all' && exp.category !== expCategory) return false;
      if (
        expMember !== 'all' &&
        exp.paid_by !== expMember &&
        !exp.shares.some((s) => s.user_id === expMember)
      ) {
        return false;
      }
      if (q) {
        const hay = `${exp.title} ${exp.description ?? ''}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [details, expSearch, expCategory, expMember]);

  if (!user) return null;

  if (!details || !summary) {
    return (
      <div className="bg-white rounded-3xl border border-[#E8ECE9] p-10 text-center space-y-4">
        <p className="text-sm text-[#818A84]">{t('common.noResults')}</p>
        <Link
          to="/groups"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#35483F] text-white text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('groups.title')}
        </Link>
      </div>
    );
  }

  const { group, members, settlements } = details;
  const currentMember = members.find((m) => m.user_id === user.id);
  const isAdmin = currentMember?.role === 'admin';
  const myBalance = summary.balancesByUser[user.id]?.netBalanceMinor ?? 0;
  const catMeta = GROUP_CATEGORY_MAP[group.category] ?? GROUP_CATEGORY_MAP.other;

  const handleDeleteGroup = async () => {
    setBusy(true);
    try {
      await deleteGroup(group.id);
      showToast(t('groups.deletedSuccess'), 'success');
      navigate('/groups');
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    setBusy(true);
    try {
      await removeMember(group.id, memberToRemove.id);
      showToast(t('groups.members.removedSuccess'), 'success');
      setMemberToRemove(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('NON_ZERO')) {
        showToast(t('groups.members.cannotRemoveNonZero'), 'error');
      } else if (msg.includes('LAST_ADMIN')) {
        showToast(t('groups.members.cannotRemoveLastAdmin'), 'error');
      } else {
        showToast(t('app.errorGeneric'), 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSettlementTransition = async () => {
    if (!settlementAction) return;
    setBusy(true);
    try {
      if (settlementAction.action === 'undo') {
        await undoConfirmedSettlement(settlementAction.settlement.id);
        showToast(t('settlements.undoneSuccess'), 'success');
      } else {
        await transitionSettlement(settlementAction.settlement.id, settlementAction.action);
        const toastKey =
          settlementAction.action === 'confirmed'
            ? 'settlements.confirmedSuccess'
            : settlementAction.action === 'rejected'
            ? 'settlements.rejectedSuccess'
            : 'settlements.cancelledSuccess';
        showToast(t(toastKey), 'success');
      }
      setSettlementAction(null);
    } catch {
      showToast(t('settlements.alreadyProcessed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmedSettlements = settlements.filter((s) => s.status === 'confirmed');

  const handleDeleteExpense = async (expenseId: string) => {
    try {
      const isLastExpense = details.expenses.length === 1 && details.expenses[0].id === expenseId;
      await deleteExpense(expenseId);
      if (isLastExpense && confirmedSettlements.length > 0) {
        for (const s of confirmedSettlements) {
          try {
            await undoConfirmedSettlement(s.id);
          } catch {
            // Ignore if user isn't authorized for a specific settlement
          }
        }
        showToast(t('settlements.deletedWithSettlementsReset'), 'success');
      } else {
        showToast(t('expenses.deletedSuccess'), 'success');
      }
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Back navigation */}
      <Link
        to="/groups"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#818A84] hover:text-[#171C19] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{t('groups.title')}</span>
      </Link>

      {/* Group Header Hero Card */}
      <section className="bg-white rounded-3xl border border-[#E8ECE9] p-4 sm:p-6 shadow-(--shadow-card)">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            {group.image_url ? (
              <img
                src={group.image_url}
                alt={group.name}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover shrink-0 border border-[#E8ECE9]"
              />
            ) : (
              <div
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl ${catMeta.bgClass} flex items-center justify-center text-2xl sm:text-3xl shrink-0`}
              >
                {catMeta.emoji}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-2xl font-bold text-[#171C19] tracking-tight truncate">
                  {group.name}
                </h1>
                <span className="text-[11px] font-bold text-[#476457] bg-[#E8F1EB] px-2.5 py-0.5 rounded-full">
                  {group.currency}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-[#818A84]">
                <span>{t(`groups.categories.${group.category}`)}</span>
                <span>•</span>
                <span>{t('common.membersCount', { count: members.length })}</span>
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setEditGroupOpen(true)}
                title={t('groups.editGroup')}
                aria-label={t('groups.editGroup')}
                className="w-9 h-9 rounded-xl border border-[#E8ECE9] flex items-center justify-center text-[#818A84] hover:text-[#171C19] hover:bg-[#F5F7F6]"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteGroup(true)}
                title={t('groups.deleteGroup')}
                aria-label={t('groups.deleteGroup')}
                className="w-9 h-9 rounded-xl border border-[#E8ECE9] flex items-center justify-center text-[#818A84] hover:text-[#C94A4A] hover:bg-[#FCEEEE]"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {group.description && (
          <p className="text-xs sm:text-sm text-[#818A84] mt-3 leading-relaxed">
            {group.description}
          </p>
        )}

        {/* Primary Mobile-Friendly CTA Row */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <button
            type="button"
            onClick={() => openAddExpenseModal({ groupId: group.id })}
            className="min-h-[46px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-[11px] sm:text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-full">{t('nav.addExpense')}</span>
          </button>

          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="min-h-[46px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 rounded-2xl bg-[#E8F1EB] hover:bg-[#D8E8DD] text-[#35483F] text-[11px] sm:text-sm font-semibold transition-colors"
          >
            <Camera className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-full">Slikaj račun</span>
          </button>

          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="min-h-[46px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 rounded-2xl bg-[#F5F7F6] hover:bg-[#E8ECE9] text-[#171C19] text-[11px] sm:text-sm font-semibold transition-colors"
          >
            <Share2 className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-full">{t('guest.shareLinkButton')}</span>
          </button>
        </div>

        {/* Clean 2-Column Key Stats Strip */}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-[#E8ECE9]">
          <div className="bg-[#F5F7F6] rounded-2xl p-3.5">
            <p className="text-xs text-[#818A84]">{t('groups.totalExpenses')}</p>
            <p className="text-base sm:text-lg font-bold text-[#171C19] mt-1 tabular-nums">
              {formatCurrency(summary.totalExpensesMinor, group.currency, lang)}
            </p>
          </div>

          <div
            className={`rounded-2xl p-3.5 ${
              myBalance > 0
                ? 'bg-[#E6F4EE]'
                : myBalance < 0
                ? 'bg-[#FCEEEE]'
                : 'bg-[#F5F7F6]'
            }`}
          >
            <p className="text-xs text-[#818A84]">{t('groups.yourBalance')}</p>
            <p
              className={`text-base sm:text-lg font-bold mt-1 tabular-nums ${
                myBalance > 0
                  ? 'text-[#16835B]'
                  : myBalance < 0
                  ? 'text-[#C94A4A]'
                  : 'text-[#818A84]'
              }`}
            >
              {myBalance === 0
                ? t('common.settledUp')
                : formatCurrency(myBalance, group.currency, lang, { showSign: true })}
            </p>
          </div>
        </div>
      </section>

      {/* Clean 4-Column Segmented Tabs Bar (Fits 360px Phone Screens Without Overflow) */}
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
            className={`min-h-[42px] px-1.5 sm:px-3 py-2 rounded-xl text-[12px] sm:text-sm font-semibold transition-all truncate ${
              activeTab === key
                ? 'bg-[#35483F] text-white shadow-xs'
                : 'text-[#818A84] hover:text-[#171C19] hover:bg-[#F5F7F6]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW (Clean Spending by Category + Suggested Settlements) */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3">
            <CategoryBreakdownCard
              expenses={details.expenses}
              currency={group.currency}
              onSelectCategory={(cat) => {
                setExpCategory(cat);
                setActiveTab('expenses');
              }}
            />
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-3xl border border-[#E8ECE9] p-5 shadow-(--shadow-card) space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[#171C19]">
                  {t('settlements.suggestedTitle')}
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('debts')}
                  className="text-xs font-semibold text-[#35483F] hover:underline"
                >
                  {t('common.viewAll')}
                </button>
              </div>

              {summary.suggestedTransfers.length === 0 ? (
                <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-[#E6F4EE] text-[#16835B] text-sm font-medium">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>{t('settlements.noSuggestions')}</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {summary.suggestedTransfers.map((tr) => {
                    const from = profilesMap[tr.fromUserId];
                    const to = profilesMap[tr.toUserId];
                    const isMeSender = tr.fromUserId === user.id;
                    return (
                      <div
                        key={`${tr.fromUserId}-${tr.toUserId}`}
                        className="p-3.5 rounded-2xl bg-[#F5F7F6] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#171C19]">
                            <span className="truncate">
                              {isMeSender ? t('common.you') : from?.first_name}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-[#818A84] shrink-0" />
                            <span className="truncate">
                              {tr.toUserId === user.id ? t('common.you') : to?.first_name}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-[#35483F] mt-0.5 tabular-nums">
                            {formatCurrency(tr.amountMinor, group.currency, lang)}
                          </p>
                        </div>

                        {isMeSender && (
                          <button
                            type="button"
                            onClick={() =>
                              openSettleModal({
                                groupId: group.id,
                                receiverId: tr.toUserId,
                                amountMinor: tr.amountMinor,
                              })
                            }
                            className="px-3 py-1.5 rounded-xl bg-[#35483F] text-white text-xs font-semibold hover:bg-[#2B3B33] shrink-0"
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
          </div>
        </div>
      )}

      {/* TAB 2: EXPENSES */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#818A84] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={expSearch}
                onChange={(e) => setExpSearch(e.target.value)}
                placeholder={t('expenses.searchPlaceholder')}
                className="w-full pl-10 pr-3.5 py-2.5 rounded-2xl bg-white border border-[#E8ECE9] text-sm focus:outline-none focus:border-[#35483F]"
              />
            </div>

            <select
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value as ExpenseCategory | 'all')}
              className="px-3.5 py-2.5 rounded-2xl bg-white border border-[#E8ECE9] text-sm text-[#171C19] focus:outline-none focus:border-[#35483F]"
            >
              <option value="all">{t('expenses.filterCategory')}</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {t(`expenses.categories.${c.id}`)}
                </option>
              ))}
            </select>

            <select
              value={expMember}
              onChange={(e) => setExpMember(e.target.value)}
              className="px-3.5 py-2.5 rounded-2xl bg-white border border-[#E8ECE9] text-sm text-[#171C19] focus:outline-none focus:border-[#35483F]"
            >
              <option value="all">{t('expenses.filterMember')}</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profile.first_name} {m.profile.last_name}
                </option>
              ))}
            </select>
          </div>

          {filteredExpenses.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-white rounded-2xl border border-[#E8ECE9] max-w-xs">
              <button
                type="button"
                onClick={() => setExpViewMode('category')}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  expViewMode === 'category'
                    ? 'bg-[#35483F] text-white shadow-xs'
                    : 'text-[#818A84] hover:text-[#171C19]'
                }`}
              >
                {t('dashboard.viewByCategory')}
              </button>
              <button
                type="button"
                onClick={() => setExpViewMode('date')}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  expViewMode === 'date'
                    ? 'bg-[#35483F] text-white shadow-xs'
                    : 'text-[#818A84] hover:text-[#171C19]'
                }`}
              >
                {t('dashboard.viewByDate')}
              </button>
            </div>
          )}

          {filteredExpenses.length === 0 ? (
            <div className="bg-white rounded-3xl border border-[#E8ECE9] p-10 text-center space-y-3">
              <p className="text-sm font-semibold text-[#171C19]">{t('expenses.emptyTitle')}</p>
              <p className="text-xs text-[#818A84]">{t('expenses.emptySubtitle')}</p>
              <button
                type="button"
                onClick={() => openAddExpenseModal({ groupId: group.id })}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-[#35483F] text-white text-sm font-semibold"
              >
                <Plus className="w-4 h-4" />
                {t('nav.addExpense')}
              </button>
            </div>
          ) : expViewMode === 'category' ? (
            <ExpensesByCategoryList
              entries={filteredExpenses.map((expense) => ({ expense }))}
              profilesMap={profilesMap}
              currentUserId={user.id}
              onSelectExpense={(exp) => setSelectedExpense(exp)}
            />
          ) : (
            <div className="space-y-2.5">
              {filteredExpenses.map((exp) => (
                <ExpenseCard
                  key={exp.id}
                  expense={exp}
                  profilesMap={profilesMap}
                  currentUserId={user.id}
                  onClick={() => setSelectedExpense(exp)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MEMBERS */}
      {activeTab === 'members' && (
        <div className="space-y-3">
          <p className="text-xs text-[#606A64] bg-[#E8F1EB]/60 px-3.5 py-2.5 rounded-2xl">
            {t('guide.hints.membersHelper')}
          </p>
          {members.map((m) => {
            const bal = summary.balancesByUser[m.user_id];
            const net = bal?.netBalanceMinor ?? 0;
            const totalPaid = bal?.totalPaidMinor ?? 0;
            const fullName = `${m.profile.first_name} ${m.profile.last_name}`.trim();
            const canRemove = isAdmin && m.user_id !== user.id;

            return (
              <div
                key={m.id}
                className="bg-white rounded-2xl border border-[#E8ECE9] p-4 shadow-(--shadow-card) flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <MemberAvatar profile={m.profile} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#171C19] truncate">
                        {fullName}
                        {m.user_id === user.id && (
                          <span className="text-xs text-[#818A84] ml-1">({t('common.you')})</span>
                        )}
                      </p>
                      {m.role === 'admin' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#35483F] bg-[#E8F1EB] px-2 py-0.5 rounded-full">
                          <Shield className="w-3 h-3" />
                          {t('common.admin')}
                        </span>
                      )}
                      {m.is_guest && (
                        <span className="inline-flex items-center text-[11px] font-semibold text-[#818A84] bg-[#F5F7F6] px-2 py-0.5 rounded-full">
                          {t('guest.guestBadge')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#818A84] mt-0.5">
                      {t('groups.members.totalPaid')}:{' '}
                      <strong className="text-[#171C19] tabular-nums">
                        {formatCurrency(totalPaid, group.currency, lang)}
                      </strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 ml-auto">
                  <div className="text-right">
                    <p className="text-[11px] text-[#818A84]">
                      {t('groups.members.currentBalance')}
                    </p>
                    <p
                      className={`text-sm font-bold tabular-nums ${
                        net > 0
                          ? 'text-[#16835B]'
                          : net < 0
                          ? 'text-[#C94A4A]'
                          : 'text-[#818A84]'
                      }`}
                    >
                      {net === 0
                        ? t('common.settledUp')
                        : formatCurrency(net, group.currency, lang, { showSign: true })}
                    </p>
                  </div>

                  {canRemove && (
                    <button
                      type="button"
                      onClick={() => setMemberToRemove({ id: m.user_id, name: fullName })}
                      title={t('groups.members.remove')}
                      aria-label={t('groups.members.remove')}
                      className="p-2 rounded-xl text-[#818A84] hover:text-[#C94A4A] hover:bg-[#FCEEEE] transition-colors"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 4: DEBTS & SETTLEMENTS */}
      {activeTab === 'debts' && (
        <div className="space-y-6">
          {/* Suggested Optimized Settlements */}
          <div className="bg-white rounded-3xl border border-[#E8ECE9] p-5 sm:p-6 shadow-(--shadow-card) space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#171C19]">
                  {t('settlements.suggestedTitle')}
                </h2>
                <p className="text-xs text-[#818A84] mt-0.5">
                  {t('guide.hints.debtsHelper')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openSettleModal({ groupId: group.id })}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#35483F] text-white text-xs font-semibold hover:bg-[#2B3B33]"
              >
                <Handshake className="w-4 h-4" />
                <span>{t('settlements.recordPayment')}</span>
              </button>
            </div>

            {summary.suggestedTransfers.length === 0 ? (
              <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-[#E6F4EE] text-[#16835B] text-sm font-semibold">
                <CheckCircle2 className="w-5 h-5" />
                <span>{t('settlements.noSuggestions')}</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {summary.suggestedTransfers.map((tr) => {
                  const from = profilesMap[tr.fromUserId];
                  const to = profilesMap[tr.toUserId];
                  const fromName =
                    tr.fromUserId === user.id
                      ? t('common.you')
                      : `${from?.first_name ?? ''} ${from?.last_name ?? ''}`.trim();
                  const toName =
                    tr.toUserId === user.id
                      ? t('common.you')
                      : `${to?.first_name ?? ''} ${to?.last_name ?? ''}`.trim();

                  const toAccount = to?.bank_account ?? null;
                  const canPayIps =
                    group.currency === 'RSD' &&
                    Boolean(toAccount && isValidSerbianAccount(toAccount));
                  const recipientDisplayName =
                    to?.bank_recipient_name ||
                    `${to?.first_name ?? ''} ${to?.last_name ?? ''}`.trim() ||
                    t('common.member');
                  const showAddMyBankCta =
                    group.currency === 'RSD' &&
                    tr.toUserId === user.id &&
                    !user.bank_account;

                  return (
                    <div
                      key={`${tr.fromUserId}-${tr.toUserId}`}
                      className="p-4 rounded-2xl bg-[#F5F7F6] border border-[#E8ECE9] space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <MemberAvatar profile={from} size="sm" />
                          <div className="flex items-center gap-2 text-sm font-semibold text-[#171C19]">
                            <span>{fromName}</span>
                            <ArrowRight className="w-4 h-4 text-[#818A84]" />
                            <span>{toName}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 ml-auto">
                          <span className="text-base font-bold text-[#35483F] tabular-nums mr-1">
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
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#E8F1EB] hover:bg-[#D5E6DB] text-[#35483F] text-xs font-bold transition-colors"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>{t('ips.payButton')}</span>
                            </button>
                          )}
                          {tr.fromUserId !== user.id && (
                            <button
                              type="button"
                              onClick={() =>
                                setReminderData({
                                  debtorName: from?.first_name || fromName,
                                  amountMinor: tr.amountMinor,
                                  currency: group.currency,
                                  groupName: group.name,
                                  shareToken: group.share_token,
                                  creditorBankAccount: toAccount,
                                })
                              }
                              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                                tr.toUserId === user.id
                                  ? 'bg-[#E8F1EB] hover:bg-[#D5E6DB] text-[#35483F]'
                                  : 'bg-white hover:bg-[#E8ECE9]/60 border border-[#E8ECE9] text-[#606A64]'
                              }`}
                            >
                              <Bell className="w-3.5 h-3.5" />
                              <span>{t('reminder.button')}</span>
                            </button>
                          )}
                          {tr.toUserId === user.id && (
                            <button
                              type="button"
                              onClick={() =>
                                openSettleModal({
                                  groupId: group.id,
                                  senderId: tr.fromUserId,
                                  receiverId: tr.toUserId,
                                  amountMinor: tr.amountMinor,
                                })
                              }
                              className="px-3.5 py-2 rounded-xl bg-[#16835B] hover:bg-[#126C4B] text-white text-xs font-semibold transition-colors"
                            >
                              {t('settlements.receivedPayment')}
                            </button>
                          )}
                          {tr.fromUserId === user.id && (
                            <button
                              type="button"
                              onClick={() =>
                                openSettleModal({
                                  groupId: group.id,
                                  senderId: tr.fromUserId,
                                  receiverId: tr.toUserId,
                                  amountMinor: tr.amountMinor,
                                })
                              }
                              className="px-3.5 py-2 rounded-xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-xs font-semibold transition-colors"
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
                })}
              </div>
            )}
          </div>

          {/* Group Settlement History */}
          <div className="space-y-3">
            <h3 className="text-base font-bold text-[#171C19]">
              {t('settlements.historyTitle')}
            </h3>
            {settlements.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E8ECE9] p-6 text-center text-sm text-[#818A84]">
                {t('settlements.noHistory')}
              </div>
            ) : (
              settlements.map((s) => (
                <SettlementCard
                  key={s.id}
                  settlement={s}
                  currency={group.currency}
                  profilesMap={profilesMap}
                  currentUserId={user.id}
                  isAdmin={isAdmin}
                  onConfirm={(st) => setSettlementAction({ settlement: st, action: 'confirmed' })}
                  onReject={(st) => setSettlementAction({ settlement: st, action: 'rejected' })}
                  onCancel={(st) => setSettlementAction({ settlement: st, action: 'cancelled' })}
                  onUndoConfirmed={(st) => setSettlementAction({ settlement: st, action: 'undo' })}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <DebtReminderModal
        open={Boolean(reminderData)}
        data={reminderData}
        onClose={() => setReminderData(null)}
      />

      <IpsQrPaymentModal
        open={Boolean(ipsQrData)}
        data={ipsQrData}
        onMarkAsPaid={() => {
          if (!ipsQrData) return;
          openSettleModal({
            groupId: group.id,
            receiverId: ipsQrData.receiverId,
            amountMinor: ipsQrData.amountMinor,
          });
        }}
        onClose={() => setIpsQrData(null)}
      />

      <BankAccountQuickModal
        open={bankModalOpen}
        initialAccount={user.bank_account}
        initialRecipientName={user.bank_recipient_name}
        defaultRecipientName={`${user.first_name} ${user.last_name}`.trim()}
        onSave={async (bankAccount, bankRecipientName) => {
          await updateProfile({
            bank_account: bankAccount,
            bank_recipient_name: bankRecipientName,
          });
          await refresh();
          showToast(t('ips.bankSavedSuccess'), 'success');
        }}
        onClose={() => setBankModalOpen(false)}
      />

      <ReceiptScannerModal
        open={scannerOpen}
        isDemo={isDemo}
        currency={group.currency}
        onParsed={(receipt) => {
          setScannerOpen(false);
          setParsedReceipt(receipt);
        }}
        onFallbackManual={() => openAddExpenseModal({ groupId: group.id })}
        onClose={() => setScannerOpen(false)}
      />

      <ItemizedSplitModal
        open={Boolean(parsedReceipt)}
        receipt={parsedReceipt}
        group={group}
        members={members}
        actingMemberId={user.id}
        onSave={async (input) => {
          await createExpense(input);
          showToast(t('expenses.createdSuccess'), 'success');
        }}
        onClose={() => setParsedReceipt(null)}
      />

      <InviteModal
        open={inviteOpen}
        groupDetails={details}
        isAdmin={isAdmin}
        onClose={() => setInviteOpen(false)}
      />

      <CreateGroupModal
        open={editGroupOpen}
        editingGroup={group}
        onClose={() => setEditGroupOpen(false)}
      />

      <ExpenseDetailModal
        expense={selectedExpense}
        groupName={group.name}
        profilesMap={profilesMap}
        currentUserId={user.id}
        canModify={Boolean(
          selectedExpense && (selectedExpense.created_by === user.id || isAdmin)
        )}
        onClose={() => setSelectedExpense(null)}
        onEdit={(exp) => openAddExpenseModal({ groupId: group.id, expense: exp })}
        onDelete={handleDeleteExpense}
      />

      <ConfirmDialog
        open={confirmDeleteGroup}
        variant="danger"
        title={t('groups.deleteGroup')}
        description={t('groups.deleteGroupConfirm', { name: group.name })}
        confirmLabel={t('common.delete')}
        loading={busy}
        onConfirm={handleDeleteGroup}
        onCancel={() => setConfirmDeleteGroup(false)}
      />

      <ConfirmDialog
        open={Boolean(memberToRemove)}
        variant="danger"
        title={t('groups.members.remove')}
        description={t('groups.members.removeConfirm', { name: memberToRemove?.name ?? '' })}
        confirmLabel={t('common.confirm')}
        loading={busy}
        onConfirm={handleRemoveMember}
        onCancel={() => setMemberToRemove(null)}
      />

      <ConfirmDialog
        open={Boolean(settlementAction)}
        variant={settlementAction?.action === 'confirmed' ? 'primary' : 'danger'}
        title={
          settlementAction?.action === 'confirmed'
            ? t('settlements.confirmDialogTitle')
            : settlementAction?.action === 'rejected'
            ? t('settlements.rejectDialogTitle')
            : settlementAction?.action === 'undo'
            ? t('settlements.undoDialogTitle')
            : t('settlements.cancelDialogTitle')
        }
        description={
          settlementAction
            ? settlementAction.action === 'confirmed'
              ? t('settlements.confirmDialogBody', {
                  amount: formatCurrency(
                    settlementAction.settlement.amount_minor,
                    group.currency,
                    lang
                  ),
                  sender:
                    profilesMap[settlementAction.settlement.sender_id]?.first_name ??
                    t('common.member'),
                })
              : settlementAction.action === 'rejected'
              ? t('settlements.rejectDialogBody', {
                  amount: formatCurrency(
                    settlementAction.settlement.amount_minor,
                    group.currency,
                    lang
                  ),
                  sender:
                    profilesMap[settlementAction.settlement.sender_id]?.first_name ??
                    t('common.member'),
                })
              : settlementAction.action === 'undo'
              ? t('settlements.undoDialogBody', {
                  amount: formatCurrency(
                    settlementAction.settlement.amount_minor,
                    group.currency,
                    lang
                  ),
                })
              : t('settlements.cancelDialogBody', {
                  amount: formatCurrency(
                    settlementAction.settlement.amount_minor,
                    group.currency,
                    lang
                  ),
                  receiver:
                    profilesMap[settlementAction.settlement.receiver_id]?.first_name ??
                    t('common.member'),
                })
            : ''
        }
        loading={busy}
        onConfirm={handleSettlementTransition}
        onCancel={() => setSettlementAction(null)}
      />
    </div>
  );
};
