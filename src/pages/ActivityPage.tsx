import React, { useMemo, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import type { AppLanguage } from '../types';
import { formatDateTime } from '../utils/finance';
import { ActivityItem } from '../components/ActivityItem';

export const ActivityPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';
  const { user } = useAuth();
  const {
    groups,
    activities,
    notifications,
    profilesMap,
    unreadNotificationsCount,
    markNotificationRead,
    markAllNotificationsRead,
  } = useData();
  const navigate = useNavigate();

  const [tab, setTab] = useState<'activity' | 'notifications'>('activity');
  const [groupFilter, setGroupFilter] = useState<string>('all');

  const groupNamesMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of groups) {
      map[g.group.id] = g.group.name;
    }
    return map;
  }, [groups]);

  const filteredActivities = useMemo(() => {
    if (groupFilter === 'all') return activities;
    return activities.filter((a) => a.group_id === groupFilter);
  }, [activities, groupFilter]);

  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#171C19] tracking-tight">
            {t('activity.title')}
          </h1>
          <p className="text-sm text-[#818A84] mt-0.5">{t('activity.subtitle')}</p>
        </div>

        {tab === 'notifications' && unreadNotificationsCount > 0 && (
          <button
            type="button"
            onClick={() => void markAllNotificationsRead()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#E8F1EB] hover:bg-[#D8E8DD] text-[#35483F] text-xs sm:text-sm font-semibold transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            <span>{t('activity.markAllRead')}</span>
          </button>
        )}
      </header>

      {/* Switcher Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-white rounded-2xl border border-[#E8ECE9] max-w-md">
        <button
          type="button"
          onClick={() => setTab('activity')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            tab === 'activity'
              ? 'bg-[#35483F] text-white shadow-xs'
              : 'text-[#818A84] hover:text-[#171C19]'
          }`}
        >
          {t('activity.title')}
        </button>

        <button
          type="button"
          onClick={() => setTab('notifications')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all inline-flex items-center justify-center gap-2 ${
            tab === 'notifications'
              ? 'bg-[#35483F] text-white shadow-xs'
              : 'text-[#818A84] hover:text-[#171C19]'
          }`}
        >
          <span>{t('activity.notificationsTitle')}</span>
          {unreadNotificationsCount > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                tab === 'notifications'
                  ? 'bg-white text-[#35483F]'
                  : 'bg-[#C94A4A] text-white'
              }`}
            >
              {unreadNotificationsCount}
            </span>
          )}
        </button>
      </div>

      {tab === 'activity' ? (
        <div className="space-y-4">
          {groups.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setGroupFilter('all')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${
                  groupFilter === 'all'
                    ? 'bg-[#35483F] text-white border-[#35483F]'
                    : 'bg-white text-[#818A84] border-[#E8ECE9]'
                }`}
              >
                {t('common.all')}
              </button>
              {groups.map((g) => (
                <button
                  key={g.group.id}
                  type="button"
                  onClick={() => setGroupFilter(g.group.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${
                    groupFilter === g.group.id
                      ? 'bg-[#35483F] text-white border-[#35483F]'
                      : 'bg-white text-[#818A84] border-[#E8ECE9]'
                  }`}
                >
                  {g.group.name}
                </button>
              ))}
            </div>
          )}

          {filteredActivities.length === 0 ? (
            <div className="bg-white rounded-3xl border border-[#E8ECE9] p-10 text-center">
              <p className="text-sm font-semibold text-[#171C19]">{t('activity.emptyTitle')}</p>
              <p className="text-xs text-[#818A84] mt-1">{t('activity.emptySubtitle')}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredActivities.map((act) => (
                <ActivityItem
                  key={act.id}
                  activity={act}
                  groupName={groupNamesMap[act.group_id]}
                  profilesMap={profilesMap}
                  currentUserId={user.id}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {notifications.length === 0 ? (
            <div className="bg-white rounded-3xl border border-[#E8ECE9] p-10 text-center">
              <Bell className="w-9 h-9 text-[#818A84]/50 mx-auto mb-2.5" />
              <p className="text-sm text-[#818A84]">{t('activity.noNotifications')}</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`rounded-2xl border p-4 flex items-start justify-between gap-3 transition-colors ${
                  !n.is_read
                    ? 'bg-[#E8F1EB]/40 border-[#35483F]/20'
                    : 'bg-white border-[#E8ECE9]'
                }`}
              >
                <button
                  type="button"
                  onClick={async () => {
                    await markNotificationRead(n.id);
                    if (n.related_group_id) navigate(`/groups/${n.related_group_id}`);
                  }}
                  className="text-left flex items-start gap-3 min-w-0 flex-1"
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                      !n.is_read ? 'bg-[#16835B]' : 'bg-[#E8ECE9]'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#35483F]">{n.title}</p>
                    <p className="text-sm text-[#171C19] mt-0.5 leading-snug">{n.message}</p>
                    <p className="text-[11px] text-[#818A84] mt-1">
                      {formatDateTime(n.created_at, lang)}
                    </p>
                  </div>
                </button>

                {!n.is_read && (
                  <button
                    type="button"
                    onClick={() => void markNotificationRead(n.id)}
                    className="text-xs font-semibold text-[#35483F] hover:underline shrink-0"
                  >
                    {t('activity.markRead')}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
