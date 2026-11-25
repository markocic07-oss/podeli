import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Users } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { getBackend } from '../services/dataService';
import type { InvitationPreview } from '../types';
import { GROUP_CATEGORY_MAP } from '../utils/categories';
import { PodeliLogo } from '../components/PodeliLogo';
import { LanguageSelector } from '../components/LanguageSelector';

export const JoinGroupPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, isDemo, isSupabaseReady } = useAuth();
  const { refresh } = useData();
  const { showToast } = useToast();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!token) {
        if (active) {
          setPreview({ valid: false, reason: 'not_found' });
          setLoading(false);
        }
        return;
      }

      const useDemo = isDemo || !isSupabaseReady;
      const backend = getBackend(useDemo);
      try {
        const res = await backend.getInvitationPreview(token, user?.id);
        if (active) setPreview(res);
      } catch {
        if (active) setPreview({ valid: false, reason: 'not_found' });
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [token, user?.id, isDemo, isSupabaseReady]);

  const handleJoin = async () => {
    if (!token || !user) return;
    setJoining(true);
    try {
      const backend = getBackend(isDemo);
      const groupId = await backend.acceptInvitation(user.id, token);
      await refresh();
      showToast(t('groups.join.joinedSuccess'), 'success');
      navigate(`/groups/${groupId}`);
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setJoining(false);
    }
  };

  const catMeta = preview?.group_category
    ? GROUP_CATEGORY_MAP[preview.group_category]
    : GROUP_CATEGORY_MAP.other;

  return (
    <div className="min-h-screen bg-[#F5F7F6] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <PodeliLogo size="md" />
          <LanguageSelector variant="compact" />
        </div>

        <div className="bg-white rounded-3xl border border-[#E8ECE9] p-7 shadow-(--shadow-card) text-center space-y-5 animate-scale-in">
          {loading ? (
            <p className="text-sm text-[#818A84] py-8">{t('app.loading')}</p>
          ) : !preview?.valid ? (
            <>
              <div className="w-14 h-14 rounded-2xl bg-[#FCEEEE] text-[#C94A4A] flex items-center justify-center mx-auto">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#171C19]">
                  {t('groups.join.invalidTitle')}
                </h1>
                <p className="text-sm text-[#818A84] mt-2 leading-relaxed">
                  {t(`groups.join.reasons.${preview?.reason ?? 'not_found'}`)}
                </p>
              </div>
              <Link
                to={user ? '/' : '/login'}
                className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-[#35483F] text-white text-sm font-semibold hover:bg-[#2B3B33]"
              >
                {user ? t('nav.home') : t('auth.loginButton')}
              </Link>
            </>
          ) : (
            <>
              <div
                className={`w-16 h-16 rounded-2xl ${catMeta.bgClass} flex items-center justify-center text-3xl mx-auto`}
              >
                {catMeta.emoji}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#476457]">
                  {t('groups.join.invitedTo')}
                </p>
                <h1 className="text-2xl font-bold text-[#171C19] mt-1">
                  {preview.group_name}
                </h1>
                {preview.group_description && (
                  <p className="text-sm text-[#818A84] mt-1.5">{preview.group_description}</p>
                )}
              </div>

              <div className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl bg-[#F5F7F6] text-xs font-semibold text-[#171C19]">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#476457]" />
                  {t('common.membersCount', { count: preview.member_count ?? 1 })}
                </span>
                <span>•</span>
                <span className="text-[#35483F]">{preview.group_currency}</span>
              </div>

              {user ? (
                preview.already_member ? (
                  <div className="space-y-3 pt-2">
                    <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#16835B]">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{t('groups.join.alreadyMember')}</span>
                    </div>
                    <Link
                      to={`/groups/${preview.group_id}`}
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-[#35483F] text-white text-sm font-semibold hover:bg-[#2B3B33]"
                    >
                      <span>{t('groups.join.openGroup')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={joining}
                    onClick={handleJoin}
                    className="w-full py-3.5 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {joining ? t('groups.join.joining') : t('groups.join.joinButton')}
                  </button>
                )
              ) : (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-[#818A84]">{t('groups.join.loginToJoin')}</p>
                  <Link
                    to={`/register?redirect=${encodeURIComponent(`/join/${token}`)}`}
                    className="block w-full py-3 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold transition-colors"
                  >
                    {t('auth.registerButton')}
                  </Link>
                  <Link
                    to={`/login?redirect=${encodeURIComponent(`/join/${token}`)}`}
                    className="block w-full py-3 rounded-2xl bg-[#F5F7F6] hover:bg-[#E8ECE9] text-[#171C19] text-sm font-semibold transition-colors"
                  >
                    {t('auth.loginButton')}
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
