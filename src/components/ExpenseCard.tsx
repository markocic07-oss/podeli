import React from 'react';
import { Paperclip } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppLanguage, Expense, Profile } from '../types';
import { formatCurrency, formatDate } from '../utils/finance';
import { ExpenseCategoryIcon } from './ExpenseCategoryIcon';

interface ExpenseCardProps {
  expense: Expense;
  groupName?: string;
  profilesMap: Record<string, Profile>;
  currentUserId: string;
  onClick?: () => void;
}

export const ExpenseCard: React.FC<ExpenseCardProps> = ({
  expense,
  groupName,
  profilesMap,
  currentUserId,
  onClick,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';

  const payer = profilesMap[expense.paid_by];
  const payerName =
    expense.paid_by === currentUserId
      ? t('common.you')
      : payer
      ? `${payer.first_name} ${payer.last_name}`.trim()
      : t('common.member');

  const myShare = expense.shares.find((s) => s.user_id === currentUserId)?.share_amount_minor ?? 0;
  const iPaid = expense.paid_by === currentUserId;
  const myDelta = (iPaid ? expense.amount_minor : 0) - myShare;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-[#E8ECE9] p-4 shadow-(--shadow-card) hover:shadow-(--shadow-card-hover) hover:border-[#35483F]/25 transition-all flex items-center gap-3.5"
    >
      <ExpenseCategoryIcon category={expense.category} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="text-sm sm:text-[15px] font-semibold text-[#171C19] truncate">
            {expense.title}
          </h4>
          {expense.receipt_url && (
            <Paperclip className="w-3.5 h-3.5 text-[#818A84] shrink-0" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-[#818A84]">
          <span>{t('expenses.paidByLabel', { name: payerName })}</span>
          <span>•</span>
          <span>{t('expenses.participantsCount', { count: expense.shares.length })}</span>
          <span>•</span>
          <span>{formatDate(expense.expense_date, lang)}</span>
        </div>

        {groupName && (
          <span className="inline-block mt-1.5 text-[11px] font-medium text-[#476457] bg-[#E8F1EB] px-2 py-0.5 rounded-full">
            {groupName}
          </span>
        )}
      </div>

      <div className="text-right shrink-0">
        <p className="text-sm sm:text-base font-bold text-[#171C19] tabular-nums">
          {formatCurrency(expense.amount_minor, expense.currency, lang)}
        </p>
        <p
          className={`text-xs font-semibold mt-0.5 tabular-nums ${
            myDelta > 0
              ? 'text-[#16835B]'
              : myDelta < 0
              ? 'text-[#C94A4A]'
              : 'text-[#818A84]'
          }`}
        >
          {myDelta > 0
            ? `${t('expenses.youLent')} ${formatCurrency(myDelta, expense.currency, lang)}`
            : myDelta < 0
            ? `${t('expenses.youBorrowed')} ${formatCurrency(-myDelta, expense.currency, lang)}`
            : myShare === 0
            ? t('expenses.notParticipant')
            : t('common.settledUp')}
        </p>
      </div>
    </button>
  );
};
