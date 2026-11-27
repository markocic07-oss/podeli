import React, { useState } from 'react';
import { Calendar, Edit3, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppLanguage, Expense, Profile } from '../types';
import { formatCurrency, formatDate } from '../utils/finance';
import { ExpenseCategoryIcon } from './ExpenseCategoryIcon';
import { MemberAvatar } from './MemberAvatar';
import { ConfirmDialog } from './ConfirmDialog';

interface ExpenseDetailModalProps {
  expense: Expense | null;
  groupName?: string;
  profilesMap: Record<string, Profile>;
  currentUserId: string;
  canModify: boolean;
  onClose: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expenseId: string) => Promise<void>;
}

export const ExpenseDetailModal: React.FC<ExpenseDetailModalProps> = ({
  expense,
  groupName,
  profilesMap,
  currentUserId,
  canModify,
  onClose,
  onEdit,
  onDelete,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!expense) return null;

  const payer = profilesMap[expense.paid_by];
  const payerName =
    expense.paid_by === currentUserId
      ? t('common.you')
      : payer
      ? `${payer.first_name} ${payer.last_name}`.trim()
      : t('common.member');

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(expense.id);
      setConfirmDelete(false);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#171C19]/45 backdrop-blur-[2px] animate-fade-in"
        role="dialog"
        aria-modal="true"
      >
        <div className="bg-white w-full sm:max-w-lg rounded-3xl border border-[#E8ECE9] shadow-(--shadow-modal) max-h-[88dvh] flex flex-col overflow-hidden animate-scale-in">
          <div className="px-5 py-3.5 border-b border-[#E8ECE9] flex items-center justify-between shrink-0">
            <h2 className="text-base font-bold text-[#171C19]">{t('expenses.detailTitle')}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-[#818A84] hover:bg-[#F5F7F6] hover:text-[#171C19]"
              aria-label={t('common.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto p-6 space-y-5">
            {/* Hero info */}
            <div className="flex items-start gap-4">
              <ExpenseCategoryIcon category={expense.category} size="lg" />
              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-bold text-[#171C19] leading-tight">
                  {expense.title}
                </h3>
                <p className="text-2xl font-bold text-[#35483F] mt-1 tabular-nums">
                  {formatCurrency(expense.amount_minor, expense.currency, lang)}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-[#818A84]">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(expense.expense_date, lang)}
                  </span>
                  <span>•</span>
                  <span>{t(`expenses.categories.${expense.category}`)}</span>
                  {groupName && (
                    <>
                      <span>•</span>
                      <span className="font-semibold text-[#476457]">{groupName}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {expense.description && (
              <div className="p-3.5 rounded-2xl bg-[#F5F7F6] text-sm text-[#171C19] leading-relaxed">
                {expense.description}
              </div>
            )}

            {/* Payer */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl border border-[#E8ECE9]">
              <div className="flex items-center gap-3">
                <MemberAvatar profile={payer} size="sm" />
                <div>
                  <p className="text-xs text-[#818A84]">{t('expenses.form.paidBy')}</p>
                  <p className="text-sm font-semibold text-[#171C19]">{payerName}</p>
                </div>
              </div>
              <span className="text-sm font-bold text-[#16835B] tabular-nums">
                {formatCurrency(expense.amount_minor, expense.currency, lang)}
              </span>
            </div>

            {/* Shares Breakdown */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#818A84] mb-2.5">
                {t('expenses.sharesBreakdown')}
              </h4>
              <div className="divide-y divide-[#E8ECE9] rounded-2xl border border-[#E8ECE9] overflow-hidden">
                {expense.shares.map((share) => {
                  const p = profilesMap[share.user_id];
                  const name =
                    share.user_id === currentUserId
                      ? `${p?.first_name ?? ''} ${p?.last_name ?? ''} (${t('common.you')})`.trim()
                      : p
                      ? `${p.first_name} ${p.last_name}`.trim()
                      : t('common.member');
                  return (
                    <div
                      key={share.id}
                      className="flex items-center justify-between px-4 py-3 bg-white"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <MemberAvatar profile={p} size="xs" />
                        <span className="text-sm font-medium text-[#171C19] truncate">
                          {name}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-[#171C19] tabular-nums shrink-0">
                        {formatCurrency(share.share_amount_minor, expense.currency, lang)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Receipt */}
            {expense.receipt_url && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#818A84] mb-2">
                  {t('expenses.receipt')}
                </h4>
                <a
                  href={expense.receipt_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-2xl overflow-hidden border border-[#E8ECE9]"
                >
                  <img
                    src={expense.receipt_url}
                    alt={t('expenses.receipt')}
                    className="w-full max-h-64 object-cover"
                  />
                </a>
              </div>
            )}

            {/* Actions */}
            {canModify && (
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E8ECE9]">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-[#C94A4A] bg-[#FCEEEE] hover:bg-[#F9DCDC] transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{t('common.delete')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEdit(expense);
                  }}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#35483F] hover:bg-[#2B3B33] transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>{t('common.edit')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        variant="danger"
        title={t('common.delete')}
        description={t('expenses.deleteConfirm', { title: expense.title })}
        confirmLabel={t('common.delete')}
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
};
