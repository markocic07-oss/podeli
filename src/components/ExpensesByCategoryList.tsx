import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  AppLanguage,
  CurrencyCode,
  Expense,
  ExpenseCategory,
  Profile,
} from '../types';
import { EXPENSE_CATEGORIES } from '../utils/categories';
import { formatCurrency } from '../utils/finance';
import { ExpenseCategoryIcon } from './ExpenseCategoryIcon';
import { ExpenseCard } from './ExpenseCard';

interface CategorizedExpenseEntry {
  expense: Expense;
  groupName?: string;
}

interface ExpensesByCategoryListProps {
  entries: CategorizedExpenseEntry[];
  profilesMap: Record<string, Profile>;
  currentUserId: string;
  onSelectExpense: (expense: Expense) => void;
}

const CURRENCIES: CurrencyCode[] = ['RSD', 'EUR', 'BAM'];

export const ExpensesByCategoryList: React.FC<ExpensesByCategoryListProps> = ({
  entries,
  profilesMap,
  currentUserId,
  onSelectExpense,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const map = new Map<ExpenseCategory, CategorizedExpenseEntry[]>();
    for (const entry of entries) {
      const cat = entry.expense.category;
      const list = map.get(cat) ?? [];
      list.push(entry);
      map.set(cat, list);
    }

    return EXPENSE_CATEGORIES.filter((c) => map.has(c.id))
      .map((meta) => {
        const items = map.get(meta.id)!;
        const totalsByCurrency: Partial<Record<CurrencyCode, number>> = {};
        for (const it of items) {
          totalsByCurrency[it.expense.currency] =
            (totalsByCurrency[it.expense.currency] ?? 0) + it.expense.amount_minor;
        }
        const currencyTotals = CURRENCIES.filter(
          (cur) => (totalsByCurrency[cur] ?? 0) > 0
        ).map((cur) => ({
          currency: cur,
          amountMinor: totalsByCurrency[cur]!,
        }));
        const sortWeight = items.reduce((acc, it) => acc + it.expense.amount_minor, 0);
        return {
          meta,
          items,
          currencyTotals,
          sortWeight,
        };
      })
      .sort((a, b) => b.sortWeight - a.sortWeight);
  }, [entries]);

  const toggle = (cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div className="space-y-3.5">
      {grouped.map(({ meta, items, currencyTotals }) => {
        const isCollapsed = Boolean(collapsed[meta.id]);
        return (
          <section
            key={meta.id}
            className="bg-white rounded-3xl border border-[#E8ECE9] shadow-(--shadow-card) overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggle(meta.id)}
              className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-[#FAFBFB] transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <ExpenseCategoryIcon category={meta.id} size="sm" />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[#171C19] truncate">
                    {t(`expenses.categories.${meta.id}`)}
                  </h3>
                  <p className="text-xs text-[#818A84]">
                    {t('dashboard.expensesCount', { count: items.length })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <div className="flex flex-wrap justify-end gap-1.5">
                  {currencyTotals.map((ct) => (
                    <span
                      key={ct.currency}
                      className="text-xs sm:text-sm font-bold text-[#35483F] bg-[#E8F1EB] px-2.5 py-1 rounded-xl tabular-nums"
                    >
                      {formatCurrency(ct.amountMinor, ct.currency, lang)}
                    </span>
                  ))}
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-[#818A84] transition-transform ${
                    isCollapsed ? '' : 'rotate-180'
                  }`}
                />
              </div>
            </button>

            {!isCollapsed && (
              <div className="px-3 sm:px-4 pb-3.5 pt-1 space-y-2 border-t border-[#E8ECE9]/70 bg-[#F5F7F6]/45">
                {items.map(({ expense, groupName }) => (
                  <ExpenseCard
                    key={expense.id}
                    expense={expense}
                    groupName={groupName}
                    profilesMap={profilesMap}
                    currentUserId={currentUserId}
                    onClick={() => onSelectExpense(expense)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

interface CategoryBreakdownCardProps {
  expenses: Expense[];
  currency: CurrencyCode;
  onSelectCategory?: (category: ExpenseCategory) => void;
}

export const CategoryBreakdownCard: React.FC<CategoryBreakdownCardProps> = ({
  expenses,
  currency,
  onSelectCategory,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';

  const breakdown = useMemo(() => {
    const totals = new Map<ExpenseCategory, { count: number; amountMinor: number }>();
    let grandTotal = 0;

    for (const exp of expenses) {
      grandTotal += exp.amount_minor;
      const cur = totals.get(exp.category) ?? { count: 0, amountMinor: 0 };
      cur.count += 1;
      cur.amountMinor += exp.amount_minor;
      totals.set(exp.category, cur);
    }

    return {
      grandTotal,
      rows: EXPENSE_CATEGORIES.filter((c) => totals.has(c.id))
        .map((meta) => {
          const entry = totals.get(meta.id)!;
          const pct = grandTotal > 0 ? Math.round((entry.amountMinor / grandTotal) * 100) : 0;
          return { meta, ...entry, pct };
        })
        .sort((a, b) => b.amountMinor - a.amountMinor),
    };
  }, [expenses]);

  if (breakdown.rows.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-[#E8ECE9] p-6 text-center text-sm text-[#818A84]">
        {t('expenses.emptyTitle')}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-[#E8ECE9] p-5 shadow-(--shadow-card) space-y-4">
      <h2 className="text-base font-bold text-[#171C19]">
        {t('dashboard.expensesByCategory')}
      </h2>

      <div className="space-y-3">
        {breakdown.rows.map((row) => (
          <button
            key={row.meta.id}
            type="button"
            onClick={() => onSelectCategory?.(row.meta.id)}
            className="w-full text-left p-3 rounded-2xl bg-[#F5F7F6]/80 hover:bg-[#E8F1EB]/50 transition-colors space-y-2"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <ExpenseCategoryIcon category={row.meta.id} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#171C19] truncate">
                    {t(`expenses.categories.${row.meta.id}`)}
                  </p>
                  <p className="text-[11px] text-[#818A84]">
                    {t('dashboard.expensesCount', { count: row.count })} • {row.pct}%
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold text-[#171C19] tabular-nums shrink-0">
                {formatCurrency(row.amountMinor, currency, lang)}
              </span>
            </div>

            <div className="h-1.5 w-full rounded-full bg-[#E8ECE9] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#35483F] transition-all"
                style={{ width: `${Math.max(row.pct, 4)}%` }}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
