import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Activity, AppLanguage, CurrencyCode, Profile } from '../types';
import { formatCurrency, formatDateTime } from '../utils/finance';
import { MemberAvatar } from './MemberAvatar';

interface ActivityItemProps {
  activity: Activity;
  groupName?: string;
  profilesMap: Record<string, Profile>;
  currentUserId: string;
}

export const ActivityItem: React.FC<ActivityItemProps> = ({
  activity,
  groupName,
  profilesMap,
  currentUserId,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';

  const actor = profilesMap[activity.user_id];
  const actorName =
    activity.user_id === currentUserId
      ? t('common.you')
      : actor
      ? `${actor.first_name} ${actor.last_name}`.trim()
      : t('common.member');

  const amountMinor =
    typeof activity.metadata?.amount_minor === 'number' ? activity.metadata.amount_minor : null;
  const currency = (activity.metadata?.currency as CurrencyCode | undefined) ?? 'RSD';

  const isPositiveEvent = activity.activity_type === 'settlement_confirmed';
  const isPendingEvent = activity.activity_type === 'settlement_created';
  const isNegativeEvent =
    activity.activity_type === 'expense_deleted' ||
    activity.activity_type === 'settlement_rejected';

  const sentence = t(`activity.types.${activity.activity_type}`, {
    actor: actorName,
    target: activity.description || groupName || '',
  });

  return (
    <Link
      to={`/groups/${activity.group_id}`}
      className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-white border border-[#E8ECE9] hover:border-[#35483F]/25 hover:bg-[#FAFBFB] transition-all"
    >
      <MemberAvatar profile={actor} size="sm" />

      <div className="min-w-0 flex-1">
        <p className="text-sm text-[#171C19] leading-snug">{sentence}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-[#818A84]">
          {groupName && <span className="font-medium text-[#476457]">{groupName}</span>}
          {groupName && <span>•</span>}
          <span>{formatDateTime(activity.created_at, lang)}</span>
        </div>
      </div>

      {amountMinor !== null && (
        <div className="text-right shrink-0">
          <span
            className={`inline-block text-xs sm:text-sm font-bold tabular-nums px-2.5 py-1 rounded-xl ${
              isPositiveEvent
                ? 'bg-[#E6F4EE] text-[#16835B]'
                : isPendingEvent
                ? 'bg-[#FDF4E6] text-[#B87314]'
                : isNegativeEvent
                ? 'bg-[#FCEEEE] text-[#C94A4A]'
                : 'bg-[#F5F7F6] text-[#171C19]'
            }`}
          >
            {formatCurrency(amountMinor, currency, lang)}
          </span>
        </div>
      )}
    </Link>
  );
};
