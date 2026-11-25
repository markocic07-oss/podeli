import React, { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../contexts/DataContext';
import { formatDateTime } from '../utils/finance';
import type { AppLanguage } from '../types';

export const NotificationDropdown: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { notifications, unreadNotificationsCount, markNotificationRead, markAllNotificationsRead } =
    useData();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const lang = (i18n.language as AppLanguage) || 'sr';

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleOpenNotification = async (id: string, groupId: string | null) => {
    await markNotificationRead(id);
    setOpen(false);
    if (groupId) {
      navigate(`/groups/${groupId}`);
    } else {
      navigate('/activity');
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('activity.notificationsTitle')}
        className="relative w-10 h-10 rounded-full bg-white border border-[#E8ECE9] flex items-center justify-center text-[#171C19] hover:bg-[#F5F7F6] transition-colors shadow-xs"
      >
        <Bell className="w-5 h-5" />
        {unreadNotificationsCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C94A4A] text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
            {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2.5 w-[calc(100vw-2rem)] sm:w-96 max-w-sm bg-white rounded-3xl border border-[#E8ECE9] shadow-(--shadow-modal) z-40 overflow-hidden animate-scale-in">
          <div className="px-5 py-4 border-b border-[#E8ECE9] flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[#171C19]">
                {t('activity.notificationsTitle')}
              </h3>
              {unreadNotificationsCount > 0 && (
                <p className="text-xs text-[#818A84] mt-0.5">
                  {t('activity.unreadCount', { count: unreadNotificationsCount })}
                </p>
              )}
            </div>
            {unreadNotificationsCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllNotificationsRead()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#35483F] hover:text-[#476457] px-2.5 py-1.5 rounded-lg hover:bg-[#E8F1EB]/70 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                {t('activity.markAllRead')}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-[#E8ECE9]/70">
            {notifications.length === 0 ? (
              <div className="py-10 px-6 text-center">
                <Bell className="w-8 h-8 text-[#818A84]/50 mx-auto mb-2" />
                <p className="text-sm text-[#818A84]">{t('activity.noNotifications')}</p>
              </div>
            ) : (
              notifications.slice(0, 12).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void handleOpenNotification(n.id, n.related_group_id)}
                  className={`w-full text-left px-5 py-3.5 hover:bg-[#F5F7F6] transition-colors flex items-start gap-3 ${
                    !n.is_read ? 'bg-[#E8F1EB]/35' : 'bg-white'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
                      !n.is_read ? 'bg-[#16835B]' : 'bg-transparent'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[#35483F] truncate">{n.title}</p>
                    <p className="text-sm text-[#171C19] leading-snug mt-0.5">{n.message}</p>
                    <p className="text-[11px] text-[#818A84] mt-1">
                      {formatDateTime(n.created_at, lang)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="p-2.5 border-t border-[#E8ECE9] bg-[#F5F7F6]/60">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('/activity');
              }}
              className="w-full py-2 rounded-xl text-xs font-semibold text-[#35483F] hover:bg-[#E8F1EB] transition-colors"
            >
              {t('common.viewAll')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
