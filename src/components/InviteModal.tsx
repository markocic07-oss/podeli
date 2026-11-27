import React, { useState } from 'react';
import {
  Check,
  Copy,
  Link2,
  MessageCircle,
  RefreshCw,
  Share2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import type { GroupWithDetails } from '../types';
import { buildGroupShareUrl, copyToClipboard, shareGroupLink } from '../utils/share';
import { ConfirmDialog } from './ConfirmDialog';

interface InviteModalProps {
  open: boolean;
  groupDetails: GroupWithDetails;
  isAdmin: boolean;
  onClose: () => void;
}

export const InviteModal: React.FC<InviteModalProps> = ({
  open,
  groupDetails,
  isAdmin,
  onClose,
}) => {
  const { t } = useTranslation();
  const { updateGroup, regenerateShareToken } = useData();
  const { showToast } = useToast();

  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  if (!open) return null;

  const { group } = groupDetails;
  const shareUrl = buildGroupShareUrl(group.share_token);
  const shareText = `${t('groups.invite.shareMessage', { group: group.name })} ${shareUrl}`;

  const handleCopy = async () => {
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      showToast(t('guest.linkCopiedToast'), 'success');
      window.setTimeout(() => setCopied(false), 2500);
    } else {
      showToast(t('app.errorGeneric'), 'error');
    }
  };

  const handleNativeShare = async () => {
    const res = await shareGroupLink({
      title: `PODELI – ${group.name}`,
      text: t('groups.invite.shareMessage', { group: group.name }),
      url: shareUrl,
    });
    if (res === 'copied') {
      showToast(t('guest.linkCopiedToast'), 'success');
    } else if (res === 'failed') {
      showToast(t('app.errorGeneric'), 'error');
    }
  };

  const handleTogglePublicLink = async () => {
    setBusy(true);
    try {
      await updateGroup(group.id, {
        is_public_link_enabled: !group.is_public_link_enabled,
      });
      showToast(t('groups.updatedSuccess'), 'success');
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAutoConfirm = async () => {
    setBusy(true);
    try {
      await updateGroup(group.id, {
        guest_payments_auto_confirm: !group.guest_payments_auto_confirm,
      });
      showToast(t('groups.updatedSuccess'), 'success');
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    setBusy(true);
    try {
      await regenerateShareToken(group.id);
      showToast(t('guest.shareTokenResetSuccess'), 'success');
      setConfirmRegen(false);
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#171C19]/45 backdrop-blur-[2px] animate-fade-in"
        role="dialog"
        aria-modal="true"
      >
        <div className="bg-white w-full sm:max-w-md rounded-3xl border border-[#E8ECE9] shadow-(--shadow-modal) max-h-[88dvh] flex flex-col overflow-hidden animate-scale-in">
          <div className="px-5 py-3.5 border-b border-[#E8ECE9] flex items-center justify-between shrink-0">
            <h2 className="text-lg font-bold text-[#171C19]">{t('guest.shareModalTitle')}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-[#818A84] hover:bg-[#F5F7F6] hover:text-[#171C19]"
              aria-label={t('common.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto p-5 space-y-5">
            <p className="text-sm text-[#606A64] leading-relaxed">
              {t('guest.shareModalSubtitle')}
            </p>

            {group.is_public_link_enabled ? (
              <>
                <div className="p-3.5 rounded-2xl bg-[#F5F7F6] border border-[#E8ECE9] space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Link2 className="w-4 h-4 text-[#476457] shrink-0" />
                    <code className="text-xs text-[#171C19] font-medium truncate flex-1 select-all">
                      {shareUrl}
                    </code>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopy}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? t('guest.linkCopiedToast') : t('groups.invite.copyLink')}</span>
                  </button>
                </div>

                {/* Messaging Share Buttons */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#818A84] mb-2.5">
                    {t('groups.invite.shareVia')}
                  </p>
                  <div className="grid grid-cols-3 gap-2.5">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-2xl bg-[#E6F4EE] text-[#16835B] hover:bg-[#D5ECDF] text-xs font-semibold transition-colors"
                    >
                      <MessageCircle className="w-5 h-5" />
                      <span>WhatsApp</span>
                    </a>

                    <a
                      href={`viber://forward?text=${encodeURIComponent(shareText)}`}
                      className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-2xl bg-[#F0EBF6] text-[#5B3D80] hover:bg-[#E4DAF0] text-xs font-semibold transition-colors"
                    >
                      <MessageCircle className="w-5 h-5" />
                      <span>Viber</span>
                    </a>

                    <button
                      type="button"
                      onClick={handleNativeShare}
                      className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-2xl bg-[#F5F7F6] text-[#171C19] hover:bg-[#E8ECE9] text-xs font-semibold transition-colors"
                    >
                      <Share2 className="w-5 h-5" />
                      <span>{t('groups.invite.shareNative')}</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-4 rounded-2xl bg-[#FDF4E6] text-xs sm:text-sm text-[#8C5A10]">
                {t('guest.linkCurrentlyDisabled')}
              </div>
            )}

            {/* Admin-only Security & Link Controls */}
            {isAdmin && (
              <div className="pt-4 border-t border-[#E8ECE9] space-y-4">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#476457]">
                  <ShieldCheck className="w-4 h-4" />
                  <span>{t('guest.adminLinkSettings')}</span>
                </div>

                {/* Toggle Public Link */}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#171C19]">
                      {t('guest.enablePublicLinkLabel')}
                    </p>
                    <p className="text-xs text-[#818A84] mt-0.5">
                      {t('guest.enablePublicLinkDesc')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    disabled={busy}
                    aria-checked={group.is_public_link_enabled}
                    onClick={handleTogglePublicLink}
                    className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 ${
                      group.is_public_link_enabled ? 'bg-[#35483F]' : 'bg-[#D5DCD8]'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                        group.is_public_link_enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Toggle Auto-Confirm Guest Payments */}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#171C19]">
                      {t('guest.autoConfirmPaymentsLabel')}
                    </p>
                    <p className="text-xs text-[#818A84] mt-0.5">
                      {t('guest.autoConfirmPaymentsDesc')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    disabled={busy}
                    aria-checked={group.guest_payments_auto_confirm}
                    onClick={handleToggleAutoConfirm}
                    className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 ${
                      group.guest_payments_auto_confirm ? 'bg-[#35483F]' : 'bg-[#D5DCD8]'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                        group.guest_payments_auto_confirm ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Reset Share Token */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmRegen(true)}
                  className="w-full min-h-[42px] py-2.5 px-4 rounded-xl text-xs font-semibold text-[#C94A4A] bg-[#FCEEEE]/75 hover:bg-[#FCEEEE] inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t('guest.resetShareLinkButton')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRegen}
        variant="danger"
        title={t('guest.resetShareLinkButton')}
        description={t('guest.resetShareLinkConfirm')}
        loading={busy}
        onConfirm={handleRegenerate}
        onCancel={() => setConfirmRegen(false)}
      />
    </>
  );
};
