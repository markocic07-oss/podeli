import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Clock,
  Handshake,
  HelpCircle,
  Plus,
  Receipt,
  Users,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import type { AppLanguage, CurrencyCode, GroupCategory, GroupWithDetails } from '../types';
import { GROUP_CATEGORIES, GROUP_CATEGORY_MAP } from '../utils/categories';
import { calculateDashboardBalances, formatCurrency, getDefaultCurrencyForLanguage } from '../utils/finance';
import { isValidSerbianAccount } from '../utils/ipsQr';
import { MemberAvatar } from '../components/MemberAvatar';
import { NotificationDropdown } from '../components/NotificationDropdown';
import { BalanceCard } from '../components/BalanceCard';
import { GroupCard } from '../components/GroupCard';
import { DashboardSkeleton } from '../components/Skeleton';
import { HowItWorksGuide } from '../components/HowItWorksGuide';
import { MyIpsQrModal } from '../components/MyIpsQrModal';
import { BankAccountQuickModal } from '../components/BankAccountQuickModal';

const GUIDE_DISMISSED_KEY = 'podeli_dashboard_guide_dismissed';
const CURRENCIES: CurrencyCode[] = ['RSD', 'EUR', 'BAM'];

function getGreetingKey(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export const DashboardPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';
  const { user, updateProfile } = useAuth();
  const {
    groups,
    loading,
    refresh,
    openAddExpenseModal,
    openCreateGroupModal,
    openSettleModal,
  } = useData();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [selectedCategory, setSelectedCategory] = useState<GroupCategory | 'all'>('all');
  const [myQrOpen, setMyQrOpen] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [guideDismissed, setGuideDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(GUIDE_DISMISSED_KEY) === 'true';
  });

  const handleDismissGuide = () => {
    setGuideDismissed(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(GUIDE_DISMISSED_KEY, 'true');
    }
  };

  // Only show categories that actually have groups
  const activeCategories = useMemo(() => {
    const present = new Set(groups.map((g) => g.group.category));
    return GROUP_CATEGORIES.filter((cat) => present.has(cat.id));
  }, [groups]);

  // Reset category filter if selected category no longer exists
  const effectiveCategory: GroupCategory | 'all' =
    selectedCategory === 'all' || activeCategories.some((c) => c.id === selectedCategory)
      ? selectedCategory
      : 'all';

  // Scope groups and balance card strictly to the selected category (prevents unrelated activities piling up)
  const filteredGroups = useMemo(() => {
    if (effectiveCategory === 'all') return groups;
    return groups.filter((g) => g.group.category === effectiveCategory);
  }, [groups, effectiveCategory]);

  const scopedBalances = useMemo(() => {
    return calculateDashboardBalances(user?.id ?? '', filteredGroups);
  }, [user?.id, filteredGroups]);

  // Organize visible groups cleanly into sections by category, each with its own balance
  const sectionsByCategory = useMemo(() => {
    const map = new Map<GroupCategory, GroupWithDetails[]>();
    for (const item of filteredGroups) {
      const cat = item.group.category;
      const list = map.get(cat) ?? [];
      list.push(item);
      map.set(cat, list);
    }

    return GROUP_CATEGORIES.filter((cat) => map.has(cat.id)).map((catMeta) => {
      const items = map.get(catMeta.id)!;
      const balances = calculateDashboardBalances(user?.id ?? '', items);
      const currencySummaries = CURRENCIES.filter(
        (c) => balances[c].activeGroupsCount > 0
      ).map((c) => balances[c]);
      return {
        meta: catMeta,
        items,
        currencySummaries,
      };
    });
  }, [filteredGroups, user?.id]);

  const { incomingPendingCount, outgoingPendingCount } = useMemo(() => {
    if (!user) return { incomingPendingCount: 0, outgoingPendingCount: 0 };
    let incoming = 0;
    let outgoing = 0;
    for (const g of groups) {
      for (const s of g.settlements) {
        if (s.status !== 'pending') continue;
        if (s.receiver_id === user.id) incoming += 1;
        else if (s.sender_id === user.id) outgoing += 1;
      }
    }
    return { incomingPendingCount: incoming, outgoingPendingCount: outgoing };
  }, [groups, user]);

  if (!user) return null;

  const firstName = user.first_name?.trim() || user.email.split('@')[0];
  const balanceSectionLabel =
    effectiveCategory === 'all'
      ? activeCategories.length > 1
        ? t('dashboard.allCategories')
        : undefined
      : `${GROUP_CATEGORY_MAP[effectiveCategory].emoji} ${t(
          `groups.categories.${effectiveCategory}`
        )}`;

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Clean Mobile-First Header */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/settings" className="shrink-0">
            <MemberAvatar profile={user} size="md" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-[#171C19] tracking-tight truncate">
              {t(`greetings.${getGreetingKey()}`, { name: firstName })}
            </h1>
            <p className="text-xs sm:text-sm text-[#818A84] truncate">
              {t('greetings.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/settings?tab=guide"
            title={t('guide.title')}
            aria-label={t('guide.title')}
            className="w-10 h-10 rounded-full bg-white border border-[#E8ECE9] flex items-center justify-center text-[#35483F] hover:bg-[#E8F1EB]/60 transition-colors shadow-xs"
          >
            <HelpCircle className="w-5 h-5" />
          </Link>
          <NotificationDropdown />
        </div>
      </header>

      {/* Pending settlement confirmations callout (receiver needs to confirm) */}
      {incomingPendingCount > 0 && (
        <Link
          to="/settlements"
          className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl bg-[#FDF4E6] border border-[#B87314]/20 text-[#8C5A10] hover:bg-[#FBEBD0] transition-colors"
        >
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <Clock className="w-4 h-4 shrink-0" />
            <span>
              {t('dashboard.pendingConfirmations', { count: incomingPendingCount })}
            </span>
          </div>
          <ArrowRight className="w-4 h-4 shrink-0" />
        </Link>
      )}

      {/* Outgoing pending payments callout (sender waiting for receiver approval) */}
      {outgoingPendingCount > 0 && (
        <Link
          to="/settlements"
          className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl bg-[#E8F1EB] border border-[#35483F]/20 text-[#35483F] hover:bg-[#DCEAE1] transition-colors"
        >
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <Clock className="w-4 h-4 shrink-0" />
            <span>
              {t('dashboard.outgoingPending', { count: outgoingPendingCount })}
            </span>
          </div>
          <ArrowRight className="w-4 h-4 shrink-0" />
        </Link>
      )}

      {loading && groups.length === 0 ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Category Filter Pills — separates balance by activity/category so unrelated expenses don't lump together */}
          {activeCategories.length > 1 && (
            <div
              role="tablist"
              aria-label={t('dashboard.filterByCategory')}
              className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={effectiveCategory === 'all'}
                onClick={() => setSelectedCategory('all')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all ${
                  effectiveCategory === 'all'
                    ? 'bg-[#35483F] text-white border-[#35483F] shadow-xs'
                    : 'bg-white text-[#606A64] border-[#E8ECE9] hover:text-[#171C19]'
                }`}
              >
                {t('dashboard.allCategories')}
              </button>

              {activeCategories.map((cat) => {
                const active = effectiveCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all ${
                      active
                        ? 'bg-[#35483F] text-white border-[#35483F] shadow-xs'
                        : 'bg-white text-[#606A64] border-[#E8ECE9] hover:text-[#171C19]'
                    }`}
                  >
                    <span>{cat.emoji}</span>
                    <span>{t(`groups.categories.${cat.id}`)}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Main Dark Green Balance Card (scoped to selected category) */}
          <BalanceCard
            balancesByCurrency={scopedBalances}
            preferredCurrency={getDefaultCurrencyForLanguage(lang)}
            totalActiveGroups={filteredGroups.length}
            sectionLabel={balanceSectionLabel}
            onOpenMyIpsQr={
              user.bank_account && isValidSerbianAccount(user.bank_account)
                ? () => setMyQrOpen(true)
                : undefined
            }
            onAddExpense={() =>
              openAddExpenseModal(
                filteredGroups.length === 1
                  ? { groupId: filteredGroups[0].group.id }
                  : undefined
              )
            }
            onCreateGroup={() => openCreateGroupModal()}
            onQuickBill={() => navigate('/brzi-racun')}
            onSettleDebt={() =>
              filteredGroups.length > 0
                ? openSettleModal(
                    filteredGroups.length === 1
                      ? { groupId: filteredGroups[0].group.id }
                      : undefined
                  )
                : navigate('/settlements')
            }
          />

          {/* Mobile 1-Tap Navigation Pills for Expenses & Settlements */}
          <div className="grid grid-cols-2 gap-2.5 md:hidden">
            <Link
              to="/expenses"
              className="flex items-center justify-center gap-2 min-h-[46px] px-4 py-2.5 rounded-2xl bg-white border border-[#E8ECE9] text-sm font-semibold text-[#171C19] shadow-2xs active:scale-[0.99] transition-transform"
            >
              <Receipt className="w-4 h-4 text-[#35483F]" />
              <span>{t('nav.expenses')}</span>
            </Link>
            <Link
              to="/settlements"
              className="flex items-center justify-center gap-2 min-h-[46px] px-4 py-2.5 rounded-2xl bg-white border border-[#E8ECE9] text-sm font-semibold text-[#171C19] shadow-2xs active:scale-[0.99] transition-transform"
            >
              <Handshake className="w-4 h-4 text-[#35483F]" />
              <span>{t('nav.settlements')}</span>
            </Link>
          </div>

          {/* Dismissible Quick-Start Guide */}
          {!guideDismissed && (
            <HowItWorksGuide variant="compact" onDismiss={handleDismissGuide} />
          )}

          {/* Groups Neatly Divided Into Category Sections (No Cluttered Activity Feed) */}
          <section className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-[#171C19]">
                  {t('dashboard.groupsByCategory')}
                </h2>
                {filteredGroups.length > 0 && (
                  <span className="text-xs font-bold text-[#476457] bg-[#E8F1EB] px-2 py-0.5 rounded-full">
                    {filteredGroups.length}
                  </span>
                )}
              </div>
              {groups.length > 0 && (
                <Link
                  to="/groups"
                  className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-[#35483F] hover:text-[#476457]"
                >
                  <span>{t('common.viewAll')}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>

            {groups.length === 0 ? (
              <div className="bg-white rounded-3xl border border-[#E8ECE9] p-7 sm:p-10 text-center shadow-(--shadow-card)">
                <div className="w-14 h-14 rounded-2xl bg-[#E8F1EB] text-[#35483F] flex items-center justify-center mx-auto">
                  <Users className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-[#171C19] mt-4">
                  {t('dashboard.emptyGroupsTitle')}
                </h3>
                <p className="text-sm text-[#818A84] mt-1.5 max-w-md mx-auto leading-relaxed">
                  {t('dashboard.emptyGroupsSubtitle')}
                </p>
                <button
                  type="button"
                  onClick={() => openCreateGroupModal()}
                  className="mt-6 w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('dashboard.createFirstGroup')}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {sectionsByCategory.map(({ meta, items, currencySummaries }) => (
                  <div key={meta.id} className="space-y-3">
                    {/* Category Section Header with Per-Category Balance */}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-8 h-8 rounded-xl ${meta.bgClass} flex items-center justify-center text-base`}
                        >
                          {meta.emoji}
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-[#171C19]">
                            {t(`groups.categories.${meta.id}`)}
                          </h3>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {currencySummaries.map((cs) => (
                          <span
                            key={cs.currency}
                            className={`text-xs font-bold tabular-nums px-2.5 py-1 rounded-full ${
                              cs.netBalanceMinor > 0
                                ? 'bg-[#E6F4EE] text-[#16835B]'
                                : cs.netBalanceMinor < 0
                                ? 'bg-[#FCEEEE] text-[#C94A4A]'
                                : 'bg-[#EEF1EF] text-[#818A84]'
                            }`}
                          >
                            {cs.netBalanceMinor === 0
                              ? `${t('common.settledUp')} (${cs.currency})`
                              : formatCurrency(cs.netBalanceMinor, cs.currency, lang, {
                                  showSign: true,
                                })}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {items.map((item) => (
                        <GroupCard key={item.group.id} item={item} currentUserId={user.id} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {user.bank_account && isValidSerbianAccount(user.bank_account) && (
        <MyIpsQrModal
          open={myQrOpen}
          bankAccount={user.bank_account}
          recipientName={
            user.bank_recipient_name ||
            `${user.first_name} ${user.last_name}`.trim() ||
            firstName
          }
          suggestedAmountMinor={
            scopedBalances.RSD.owedToYouMinor > 0 ? scopedBalances.RSD.owedToYouMinor : 0
          }
          onEditAccount={() => setBankModalOpen(true)}
          onClose={() => setMyQrOpen(false)}
        />
      )}

      <BankAccountQuickModal
        open={bankModalOpen}
        initialAccount={user.bank_account}
        initialRecipientName={user.bank_recipient_name}
        defaultRecipientName={`${user.first_name} ${user.last_name}`.trim() || firstName}
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
    </div>
  );
};
