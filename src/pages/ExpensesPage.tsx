import React, { useMemo, useState } from 'react';
import { Plus, Receipt, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import type { Expense, ExpenseCategory } from '../types';
import { EXPENSE_CATEGORIES } from '../utils/categories';
import { ExpenseCard } from '../components/ExpenseCard';
import { ExpenseDetailModal } from '../components/ExpenseDetailModal';
import { ExpensesByCategoryList } from '../components/ExpensesByCategoryList';

const PAGE_SIZE = 20;

export const ExpensesPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { groups, profilesMap, openAddExpenseModal, deleteExpense } = useData();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [viewMode, setViewMode] = useState<'category' | 'date'>('category');
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const allExpenses = useMemo(() => {
    const list: { expense: Expense; groupName: string; isAdmin: boolean }[] = [];
    for (const g of groups) {
      const isAdmin = g.members.some((m) => m.user_id === user?.id && m.role === 'admin');
      for (const exp of g.expenses) {
        list.push({ expense: exp, groupName: g.group.name, isAdmin });
      }
    }
    return list.sort(
      (a, b) =>
        b.expense.expense_date.localeCompare(a.expense.expense_date) ||
        b.expense.created_at.localeCompare(a.expense.created_at)
    );
  }, [groups, user?.id]);

  const allMembers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const g of groups) {
      for (const m of g.members) {
        if (!seen.has(m.user_id)) {
          seen.set(m.user_id, `${m.profile.first_name} ${m.profile.last_name}`.trim());
        }
      }
    }
    return Array.from(seen.entries());
  }, [groups]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allExpenses.filter(({ expense, groupName }) => {
      if (groupFilter !== 'all' && expense.group_id !== groupFilter) return false;
      if (categoryFilter !== 'all' && expense.category !== categoryFilter) return false;
      if (
        memberFilter !== 'all' &&
        expense.paid_by !== memberFilter &&
        !expense.shares.some((s) => s.user_id === memberFilter)
      ) {
        return false;
      }
      if (dateFrom && expense.expense_date < dateFrom) return false;
      if (dateTo && expense.expense_date > dateTo) return false;
      if (q) {
        const hay = `${expense.title} ${expense.description ?? ''} ${groupName}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [allExpenses, search, groupFilter, memberFilter, categoryFilter, dateFrom, dateTo]);

  const hasFilters =
    Boolean(search) ||
    groupFilter !== 'all' ||
    memberFilter !== 'all' ||
    categoryFilter !== 'all' ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const clearFilters = () => {
    setSearch('');
    setGroupFilter('all');
    setMemberFilter('all');
    setCategoryFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  if (!user) return null;

  const selectedEntry = selectedExpense
    ? allExpenses.find((e) => e.expense.id === selectedExpense.id)
    : null;

  const handleDelete = async (expenseId: string) => {
    try {
      await deleteExpense(expenseId);
      showToast(t('expenses.deletedSuccess'), 'success');
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#171C19] tracking-tight">
            {t('expenses.title')}
          </h1>
          <p className="text-sm text-[#818A84] mt-0.5">{t('expenses.subtitle')}</p>
        </div>

        <button
          type="button"
          onClick={() => openAddExpenseModal()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>{t('nav.addExpense')}</span>
        </button>
      </header>

      {/* Filter Bar */}
      {allExpenses.length > 0 && (
        <div className="bg-white rounded-3xl border border-[#E8ECE9] p-4 shadow-(--shadow-card) space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#818A84] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('expenses.searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#F5F7F6] border border-[#E8ECE9] text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-[#F5F7F6] border border-[#E8ECE9] text-xs sm:text-sm text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
            >
              <option value="all">{t('expenses.filterGroup')}</option>
              {groups.map((g) => (
                <option key={g.group.id} value={g.group.id}>
                  {g.group.name}
                </option>
              ))}
            </select>

            <select
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-[#F5F7F6] border border-[#E8ECE9] text-xs sm:text-sm text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
            >
              <option value="all">{t('expenses.filterMember')}</option>
              {allMembers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as ExpenseCategory | 'all')}
              className="px-3.5 py-2 rounded-xl bg-[#F5F7F6] border border-[#E8ECE9] text-xs sm:text-sm text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
            >
              <option value="all">{t('expenses.filterCategory')}</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {t(`expenses.categories.${c.id}`)}
                </option>
              ))}
            </select>

            <input
              type="date"
              aria-label={t('expenses.filterDateFrom')}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E8ECE9] text-xs sm:text-sm text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
            />

            <input
              type="date"
              aria-label={t('expenses.filterDateTo')}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#F5F7F6] border border-[#E8ECE9] text-xs sm:text-sm text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
            />
          </div>

          {hasFilters && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#476457] hover:text-[#171C19]"
              >
                <X className="w-3.5 h-3.5" />
                {t('expenses.clearFilters')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* View Switcher: By Category (Default) vs Chronological */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-white rounded-2xl border border-[#E8ECE9] max-w-xs">
          <button
            type="button"
            onClick={() => setViewMode('category')}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              viewMode === 'category'
                ? 'bg-[#35483F] text-white shadow-xs'
                : 'text-[#818A84] hover:text-[#171C19]'
            }`}
          >
            {t('dashboard.viewByCategory')}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('date')}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              viewMode === 'date'
                ? 'bg-[#35483F] text-white shadow-xs'
                : 'text-[#818A84] hover:text-[#171C19]'
            }`}
          >
            {t('dashboard.viewByDate')}
          </button>
        </div>
      )}

      {/* Results List */}
      {allExpenses.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#E8ECE9] p-10 text-center shadow-(--shadow-card)">
          <div className="w-14 h-14 rounded-2xl bg-[#E8F1EB] text-[#35483F] flex items-center justify-center mx-auto">
            <Receipt className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-[#171C19] mt-4">{t('expenses.emptyTitle')}</h3>
          <p className="text-sm text-[#818A84] mt-1.5 max-w-md mx-auto">
            {t('expenses.emptySubtitle')}
          </p>
          <button
            type="button"
            onClick={() => openAddExpenseModal()}
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>{t('nav.addExpense')}</span>
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#E8ECE9] p-10 text-center text-sm text-[#818A84]">
          {t('common.noResults')}
        </div>
      ) : viewMode === 'category' ? (
        <ExpensesByCategoryList
          entries={filtered}
          profilesMap={profilesMap}
          currentUserId={user.id}
          onSelectExpense={(exp) => setSelectedExpense(exp)}
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.slice(0, visibleCount).map(({ expense, groupName }) => (
            <ExpenseCard
              key={expense.id}
              expense={expense}
              groupName={groupName}
              profilesMap={profilesMap}
              currentUserId={user.id}
              onClick={() => setSelectedExpense(expense)}
            />
          ))}

          {filtered.length > visibleCount && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="px-6 py-2.5 rounded-2xl bg-white border border-[#E8ECE9] text-sm font-semibold text-[#35483F] hover:bg-[#E8F1EB]/50 transition-colors"
              >
                {t('common.viewAll')} ({filtered.length - visibleCount})
              </button>
            </div>
          )}
        </div>
      )}

      <ExpenseDetailModal
        expense={selectedExpense}
        groupName={selectedEntry?.groupName}
        profilesMap={profilesMap}
        currentUserId={user.id}
        canModify={Boolean(
          selectedExpense &&
            (selectedExpense.created_by === user.id || selectedEntry?.isAdmin)
        )}
        onClose={() => setSelectedExpense(null)}
        onEdit={(exp) => openAddExpenseModal({ groupId: exp.group_id, expense: exp })}
        onDelete={handleDelete}
      />
    </div>
  );
};
