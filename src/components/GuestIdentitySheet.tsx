import React, { useState } from 'react';
import { Check, Plus, UserCheck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { GroupMember } from '../types';
import { MemberAvatar } from './MemberAvatar';

interface GuestIdentitySheetProps {
  open: boolean;
  groupName: string;
  shareToken: string;
  members: GroupMember[];
  currentGuestId?: string | null;
  busy?: boolean;
  onSelectExistingGuest: (guestId: string) => Promise<void>;
  onCreateNewGuest: (displayName: string) => Promise<void>;
  onClose: () => void;
}

export const GuestIdentitySheet: React.FC<GuestIdentitySheetProps> = ({
  open,
  groupName,
  shareToken,
  members,
  currentGuestId,
  busy = false,
  onSelectExistingGuest,
  onCreateNewGuest,
  onClose,
}) => {
  const { t } = useTranslation();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const guestMembers = members.filter((m) => m.is_guest);
  const registeredMembers = members.filter((m) => !m.is_guest);

  const handleAddNew = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setError(t('guest.identityNameRequired'));
      return;
    }
    setError(null);
    await onCreateNewGuest(trimmed);
    setNewName('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#171C19]/45 backdrop-blur-[2px] animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white w-full sm:max-w-md rounded-3xl border border-[#E8ECE9] shadow-(--shadow-modal) max-h-[88dvh] flex flex-col overflow-hidden animate-scale-in">
        <div className="px-5 py-3.5 border-b border-[#E8ECE9] flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#171C19]">{t('guest.whoAreYouTitle')}</h2>
            <p className="text-xs text-[#818A84] truncate mt-0.5">{groupName}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 rounded-xl text-[#818A84] hover:bg-[#F5F7F6] hover:text-[#171C19]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          <p className="text-sm text-[#606A64] leading-relaxed">
            {t('guest.whoAreYouSubtitle')}
          </p>

          {/* Add New Guest Name (Primary Fast Action) */}
          <form onSubmit={handleAddNew} className="space-y-2.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#476457]">
              {t('guest.addNewNameLabel')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={60}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('guest.addNewNamePlaceholder')}
                className="flex-1 min-h-[46px] px-4 py-2.5 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/70 text-base sm:text-sm text-[#171C19] placeholder:text-[#818A84] focus:bg-white focus:outline-none focus:border-[#35483F]"
              />
              <button
                type="submit"
                disabled={busy}
                className="min-h-[46px] px-4 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>{t('guest.continueButton')}</span>
              </button>
            </div>
            {error && <p className="text-xs font-medium text-[#C94A4A]">{error}</p>}
          </form>

          {/* Existing Guest Names (Can be selected immediately) */}
          {guestMembers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-[#818A84]">
                {t('guest.pickExistingGuest')}
              </p>
              <div className="space-y-1.5">
                {guestMembers.map((m) => {
                  const isSelected = m.user_id === currentGuestId;
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      disabled={busy}
                      onClick={() => void onSelectExistingGuest(m.user_id)}
                      className={`w-full min-h-[50px] px-3.5 py-2.5 rounded-2xl border flex items-center justify-between gap-3 text-left transition-all ${
                        isSelected
                          ? 'bg-[#E8F1EB] border-[#35483F] text-[#35483F]'
                          : 'bg-white border-[#E8ECE9] hover:bg-[#F5F7F6] text-[#171C19]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <MemberAvatar profile={m.profile} size="sm" />
                        <span className="text-sm font-semibold truncate">
                          {m.profile.first_name}
                        </span>
                      </div>
                      {isSelected ? (
                        <Check className="w-4 h-4 text-[#35483F] shrink-0" />
                      ) : (
                        <span className="text-xs font-semibold text-[#35483F] shrink-0">
                          {t('guest.selectThisName')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Registered Members Info (Link to Login if one of them) */}
          {registeredMembers.length > 0 && (
            <div className="pt-3 border-t border-[#E8ECE9] space-y-2.5">
              <p className="text-xs font-semibold text-[#818A84]">
                {t('guest.alreadyRegisteredMembers')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {registeredMembers.map((m) => (
                  <span
                    key={m.user_id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F5F7F6] text-xs font-medium text-[#606A64]"
                  >
                    <UserCheck className="w-3 h-3 text-[#476457]" />
                    {`${m.profile.first_name} ${m.profile.last_name}`.trim()}
                  </span>
                ))}
              </div>
              <Link
                to={`/login?redirect=${encodeURIComponent(`/g/${shareToken}`)}`}
                className="inline-block text-xs font-semibold text-[#35483F] hover:underline"
              >
                {t('guest.loginIfRegistered')} →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
