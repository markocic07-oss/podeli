import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AppLanguage, GroupWithDetails } from '../types';
import { GROUP_CATEGORY_MAP } from '../utils/categories';
import { calculateGroupBalances, formatCurrency } from '../utils/finance';
import { MemberAvatar } from './MemberAvatar';

interface GroupCardProps {
  item: GroupWithDetails;
  currentUserId: string;
}

export const GroupCard: React.FC<GroupCardProps> = ({ item, currentUserId }) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';
  const { group, members, expenses, settlements } = item;

  const summary = calculateGroupBalances(
    members.map((m) => m.user_id),
    expenses,
    settlements
  );
  const myBalance = summary.balancesByUser[currentUserId]?.netBalanceMinor ?? 0;
  const catMeta = GROUP_CATEGORY_MAP[group.category] ?? GROUP_CATEGORY_MAP.other;

  return (
    <Link
      to={`/groups/${group.id}`}
      className="group block bg-white rounded-3xl border border-[#E8ECE9] p-5 shadow-(--shadow-card) hover:shadow-(--shadow-card-hover) hover:border-[#35483F]/25 transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          {group.image_url ? (
            <img
              src={group.image_url}
              alt={group.name}
              className="w-12 h-12 rounded-2xl object-cover shrink-0 border border-[#E8ECE9]"
            />
          ) : (
            <div
              className={`w-12 h-12 rounded-2xl ${catMeta.bgClass} flex items-center justify-center text-2xl shrink-0`}
            >
              {catMeta.emoji}
            </div>
          )}

          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[#171C19] truncate group-hover:text-[#35483F] transition-colors">
              {group.name}
            </h3>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-[#818A84]">
              <span>{t(`groups.categories.${group.category}`)}</span>
              <span>•</span>
              <span>{t('common.membersCount', { count: members.length })}</span>
            </div>
          </div>
        </div>

        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#F5F7F6] text-[#818A84] group-hover:bg-[#E8F1EB] group-hover:text-[#35483F] transition-colors shrink-0">
          <ChevronRight className="w-4 h-4" />
        </span>
      </div>

      {/* Member Avatars & Currency Pill */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#E8ECE9]/80">
        <div className="flex items-center -space-x-2">
          {members.slice(0, 4).map((m) => (
            <MemberAvatar key={m.user_id} profile={m.profile} size="xs" />
          ))}
          {members.length > 4 && (
            <span className="w-6 h-6 rounded-full bg-[#F5F7F6] text-[#818A84] text-[10px] font-semibold flex items-center justify-center ring-2 ring-white">
              +{members.length - 4}
            </span>
          )}
        </div>
        <span className="text-[11px] font-semibold text-[#476457] bg-[#E8F1EB] px-2.5 py-0.5 rounded-full">
          {group.currency}
        </span>
      </div>

      {/* Totals Row */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="bg-[#F5F7F6] rounded-2xl px-3.5 py-2.5">
          <p className="text-[11px] text-[#818A84]">{t('groups.totalExpenses')}</p>
          <p className="text-sm font-semibold text-[#171C19] mt-0.5 tabular-nums">
            {formatCurrency(summary.totalExpensesMinor, group.currency, lang)}
          </p>
        </div>

        <div
          className={`rounded-2xl px-3.5 py-2.5 ${
            myBalance > 0
              ? 'bg-[#E6F4EE]'
              : myBalance < 0
              ? 'bg-[#FCEEEE]'
              : 'bg-[#F5F7F6]'
          }`}
        >
          <p className="text-[11px] text-[#818A84]">{t('groups.yourBalance')}</p>
          <p
            className={`text-sm font-bold mt-0.5 tabular-nums ${
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
    </Link>
  );
};
