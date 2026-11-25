import React, { useMemo, useState } from 'react';
import { ArrowRight, Bell, Building2, CheckCircle2, Handshake, Info, QrCode } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import type { AppLanguage, CurrencyCode, Settlement } from '../types';
import { calculateGroupBalances, formatCurrency } from '../utils/finance';
import { MemberAvatar } from '../components/MemberAvatar';
import { SettlementCard } from '../components/SettlementCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { IpsQrPaymentModal, type IpsQrPaymentData } from '../components/IpsQrPaymentModal';
import { BankAccountQuickModal } from '../components/BankAccountQuickModal';
import { DebtReminderModal, type DebtReminderData } from '../components/DebtReminderModal';
import { isValidSerbianAccount } from '../utils/ipsQr';

export const SettlementsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';
  const { user, updateProfile } = useAuth();
  const { groups, profilesMap, refresh, openSettleModal, transitionSettlement } = useData();
  const { showToast } = useToast();

  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [ipsQrData, setIpsQrData] = useState<(IpsQrPaymentData & { groupId: string }) | null>(null);
  const [reminderData, setReminderData] = useState<DebtReminderData | null>(null);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    settlement: Settlement;
    currency: CurrencyCode;
    action: 'confirmed' | 'rejected' | 'cancelled';
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const visibleGroups = useMemo(
    () =>
      selectedGroupId === 'all'
        ? groups
        : groups.filter((g) => g.group.id === selectedGroupId),
    [groups, selectedGroupId]
  );

  const groupSuggestions = useMemo(() => {
    return visibleGroups
      .map((g) => {
        const summary = calculateGroupBalances(
          g.members.map((m) => m.user_id),
          g.expenses,
          g.settlements
        );
        return {
          group: g.group,
          summary,
        };
      })
      .filter((entry) => entry.summary.suggestedTransfers.length > 0);
  }, [visibleGroups]);

  const allSettlements = useMemo(() => {
    const list: { settlement: Settlement; groupName: string; currency: CurrencyCode }[] = [];
    for (const g of visibleGroups) {
      for (const s of g.settlements) {
        list.push({ settlement: s, groupName: g.group.name, currency: g.group.currency });
      }
    }
    return list.sort((a, b) => b.settlement.created_at.localeCompare(a.settlement.created_at));
  }, [visibleGroups]);

  const pendingSettlements = useMemo(
    () => allSettlements.filter((s) => s.settlement.status === 'pending'),
    [allSettlements]
  );

  const historySettlements = useMemo(
    () => allSettlements.filter((s) => s.settlement.status !== 'pending'),
    [allSettlements]
  );

  if (!user) return null;

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    setBusy(true);
    try {
      await transitionSettlement(pendingAction.settlement.id, pendingAction.action);
      const toastKey =
        pendingAction.action === 'confirmed'
          ? 'settlements.confirmedSuccess'
          : pendingAction.action === 'rejected'
          ? 'settlements.rejectedSuccess'
          : 'settlements.cancelledSuccess';
      showToast(t(toastKey), 'success');
      setPendingAction(null);
    } catch {
      showToast(t('settlements.alreadyProcessed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#171C19] tracking-tight">
            {t('settlements.title')}
          </h1>
          <p className="text-sm text-[#818A84] mt-0.5">{t('settlements.subtitle')}</p>
        </div>

        <button
          type="button"
          disabled={groups.length === 0}
          onClick={() =>
            openSettleModal(selectedGroupId !== 'all' ? { groupId: selectedGroupId } : undefined)
          }
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
        >
          <Handshake className="w-4 h-4" />
          <span>{t('settlements.recordPayment')}</span>
        </button>
      </header>

      {/* Info Notice */}
      <div className="flex items-start gap-3 px-4 py-3.5 rounded-2xl bg-[#E8F1EB]/75 text-xs sm:text-sm text-[#35483F]">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{t('settlements.disclaimer')}</span>
      </div>

      {/* Group Filter Pills */}
      {groups.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedGroupId('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
              selectedGroupId === 'all'
                ? 'bg-[#35483F] text-white border-[#35483F]'
                : 'bg-white text-[#818A84] border-[#E8ECE9] hover:text-[#171C19]'
            }`}
          >
            {t('common.all')}
          </button>
          {groups.map((g) => (
            <button
              key={g.group.id}
              type="button"
              onClick={() => setSelectedGroupId(g.group.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                selectedGroupId === g.group.id
                  ? 'bg-[#35483F] text-white border-[#35483F]'
                  : 'bg-white text-[#818A84] border-[#E8ECE9] hover:text-[#171C19]'
              }`}
            >
              {g.group.name} ({g.group.currency})
            </button>
          ))}
        </div>
      )}

      {/* Pending Settlements Needing Confirmation */}
      {pendingSettlements.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-[#171C19]">
            {t('settlements.pendingTitle')} ({pendingSettlements.length})
          </h2>
          <div className="space-y-2.5">
            {pendingSettlements.map(({ settlement, groupName, currency }) => (
              <SettlementCard
                key={settlement.id}
                settlement={settlement}
                currency={currency}
                groupName={groupName}
                profilesMap={profilesMap}
                currentUserId={user.id}
                onConfirm={(st) => setPendingAction({ settlement: st, currency, action: 'confirmed' })}
                onReject={(st) => setPendingAction({ settlement: st, currency, action: 'rejected' })}
                onCancel={(st) => setPendingAction({ settlement: st, currency, action: 'cancelled' })}
              />
            ))}
          </div>
        </section>
      )}

      {/* Suggested Simplified Transfers */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-[#171C19]">
            {t('settlements.suggestedTitle')}
          </h2>
          <p className="text-xs text-[#818A84] mt-0.5">{t('settlements.suggestedSubtitle')}</p>
        </div>

        {groupSuggestions.length === 0 ? (
          <div className="bg-white rounded-3xl border border-[#E8ECE9] p-8 text-center shadow-(--shadow-card)">
            <div className="w-12 h-12 rounded-2xl bg-[#E6F4EE] text-[#16835B] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-[#171C19] mt-3">
              {t('settlements.noSuggestions')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupSuggestions.map(({ group, summary }) => {
              const myBal = summary.balancesByUser[user.id]?.netBalanceMinor ?? 0;
              return (
                <div
                  key={group.id}
                  className="bg-white rounded-3xl border border-[#E8ECE9] p-5 shadow-(--shadow-card) space-y-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-[#171C19]">{group.name}</h3>
                      <span className="text-[11px] font-bold text-[#476457] bg-[#E8F1EB] px-2 py-0.5 rounded-full">
                        {group.currency}
                      </span>
                    </div>

                    {myBal !== 0 && (
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full tabular-nums ${
                          myBal > 0
                            ? 'bg-[#E6F4EE] text-[#16835B]'
                            : 'bg-[#FCEEEE] text-[#C94A4A]'
                        }`}
                      >
                        {myBal > 0
                          ? t('settlements.shouldReceive', {
                              name: user.first_name || t('common.you'),
                              amount: formatCurrency(myBal, group.currency, lang),
                            })
                          : t('settlements.shouldPay', {
                              name: user.first_name || t('common.you'),
                              amount: formatCurrency(-myBal, group.currency, lang),
                            })}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {summary.suggestedTransfers.map((tr) => {
                      const from = profilesMap[tr.fromUserId];
                      const to = profilesMap[tr.toUserId];
                      const fromName =
                        tr.fromUserId === user.id
                          ? t('common.you')
                          : `${from?.first_name ?? ''} ${from?.last_name ?? ''}`.trim();
                      const toName =
                        tr.toUserId === user.id
                          ? t('common.you')
                          : `${to?.first_name ?? ''} ${to?.last_name ?? ''}`.trim();

                      const toAccount = to?.bank_account ?? null;
                      const canPayIps =
                        group.currency === 'RSD' &&
                        Boolean(toAccount && isValidSerbianAccount(toAccount));
                      const recipientDisplayName =
                        to?.bank_recipient_name ||
                        `${to?.first_name ?? ''} ${to?.last_name ?? ''}`.trim() ||
                        t('common.member');
                      const showAddMyBankCta =
                        group.currency === 'RSD' &&
                        tr.toUserId === user.id &&
                        !user.bank_account;

                      return (
                        <div
                          key={`${tr.fromUserId}-${tr.toUserId}`}
                          className="p-3.5 rounded-2xl bg-[#F5F7F6] space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <MemberAvatar profile={from} size="sm" />
                              <div className="flex items-center gap-1.5 text-sm font-semibold text-[#171C19]">
                                <span>{fromName}</span>
                                <ArrowRight className="w-4 h-4 text-[#818A84]" />
                                <span>{toName}</span>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 ml-auto">
                              <span className="text-sm sm:text-base font-bold text-[#35483F] tabular-nums mr-1">
                                {formatCurrency(tr.amountMinor, group.currency, lang)}
                              </span>
                              {canPayIps && toAccount && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setIpsQrData({
                                      groupId: group.id,
                                      recipientAccount: toAccount,
                                      recipientName: recipientDisplayName,
                                      amountMinor: tr.amountMinor,
                                      groupName: group.name,
                                      receiverId: tr.toUserId,
                                    })
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#E8F1EB] hover:bg-[#D5E6DB] text-[#35483F] text-xs font-bold transition-colors"
                                >
                                  <QrCode className="w-3.5 h-3.5" />
                                  <span>{t('ips.payButton')}</span>
                                </button>
                              )}
                              {tr.fromUserId !== user.id && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReminderData({
                                      debtorName: from?.first_name || fromName,
                                      amountMinor: tr.amountMinor,
                                      currency: group.currency,
                                      groupName: group.name,
                                      shareToken: group.share_token,
                                      creditorBankAccount: toAccount,
                                    })
                                  }
                                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                                    tr.toUserId === user.id
                                      ? 'bg-[#E8F1EB] hover:bg-[#D5E6DB] text-[#35483F]'
                                      : 'bg-white hover:bg-[#E8ECE9]/60 border border-[#E8ECE9] text-[#606A64]'
                                  }`}
                                >
                                  <Bell className="w-3.5 h-3.5" />
                                  <span>{t('reminder.button')}</span>
                                </button>
                              )}
                              {tr.toUserId === user.id && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openSettleModal({
                                      groupId: group.id,
                                      senderId: tr.fromUserId,
                                      receiverId: tr.toUserId,
                                      amountMinor: tr.amountMinor,
                                    })
                                  }
                                  className="px-3.5 py-2 rounded-xl bg-[#16835B] hover:bg-[#126C4B] text-white text-xs font-semibold transition-colors"
                                >
                                  {t('settlements.receivedPayment')}
                                </button>
                              )}
                              {tr.fromUserId === user.id && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openSettleModal({
                                      groupId: group.id,
                                      senderId: tr.fromUserId,
                                      receiverId: tr.toUserId,
                                      amountMinor: tr.amountMinor,
                                    })
                                  }
                                  className="px-3.5 py-2 rounded-xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-xs font-semibold transition-colors"
                                >
                                  {t('settlements.markAsPaid')}
                                </button>
                              )}
                            </div>
                          </div>

                          {showAddMyBankCta && (
                            <button
                              type="button"
                              onClick={() => setBankModalOpen(true)}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-dashed border-[#35483F]/30 text-left text-xs text-[#35483F] hover:bg-[#E8F1EB]/40 transition-colors"
                            >
                              <span className="inline-flex items-center gap-1.5 font-medium">
                                <Building2 className="w-3.5 h-3.5 shrink-0" />
                                <span>{t('ips.addBankCta')}</span>
                              </span>
                              <span className="font-bold shrink-0">{t('ips.addBankAction')} →</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Settlement History */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-[#171C19]">{t('settlements.historyTitle')}</h2>
        {historySettlements.length === 0 ? (
          <div className="bg-white rounded-3xl border border-[#E8ECE9] p-8 text-center text-sm text-[#818A84]">
            {t('settlements.noHistory')}
          </div>
        ) : (
          <div className="space-y-2.5">
            {historySettlements.map(({ settlement, groupName, currency }) => (
              <SettlementCard
                key={settlement.id}
                settlement={settlement}
                currency={currency}
                groupName={groupName}
                profilesMap={profilesMap}
                currentUserId={user.id}
              />
            ))}
          </div>
        )}
      </section>

      <DebtReminderModal
        open={Boolean(reminderData)}
        data={reminderData}
        onClose={() => setReminderData(null)}
      />

      <IpsQrPaymentModal
        open={Boolean(ipsQrData)}
        data={ipsQrData}
        onMarkAsPaid={() => {
          if (!ipsQrData) return;
          openSettleModal({
            groupId: ipsQrData.groupId,
            receiverId: ipsQrData.receiverId,
            amountMinor: ipsQrData.amountMinor,
          });
        }}
        onClose={() => setIpsQrData(null)}
      />

      <BankAccountQuickModal
        open={bankModalOpen}
        initialAccount={user.bank_account}
        initialRecipientName={user.bank_recipient_name}
        defaultRecipientName={`${user.first_name} ${user.last_name}`.trim()}
        onSave={async (bankAccount, bankRecipientName) => {
          await updateProfile({
            bank_account: bankAccount,
            bank_recipient_name: bankRecipientName,
          });
          await refresh();
          showToast(t('ips.bankSavedSuccess'), 'success');
        }}
        onClose={() => setBankModalOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(pendingAction)}
        variant={pendingAction?.action === 'confirmed' ? 'primary' : 'danger'}
        title={
          pendingAction?.action === 'confirmed'
            ? t('settlements.confirmDialogTitle')
            : pendingAction?.action === 'rejected'
            ? t('settlements.rejectDialogTitle')
            : t('settlements.cancelDialogTitle')
        }
        description={
          pendingAction
            ? pendingAction.action === 'confirmed'
              ? t('settlements.confirmDialogBody', {
                  amount: formatCurrency(
                    pendingAction.settlement.amount_minor,
                    pendingAction.currency,
                    lang
                  ),
                  sender:
                    profilesMap[pendingAction.settlement.sender_id]?.first_name ??
                    t('common.member'),
                })
              : pendingAction.action === 'rejected'
              ? t('settlements.rejectDialogBody', {
                  amount: formatCurrency(
                    pendingAction.settlement.amount_minor,
                    pendingAction.currency,
                    lang
                  ),
                  sender:
                    profilesMap[pendingAction.settlement.sender_id]?.first_name ??
                    t('common.member'),
                })
              : t('settlements.cancelDialogBody', {
                  amount: formatCurrency(
                    pendingAction.settlement.amount_minor,
                    pendingAction.currency,
                    lang
                  ),
                  receiver:
                    profilesMap[pendingAction.settlement.receiver_id]?.first_name ??
                    t('common.member'),
                })
            : ''
        }
        loading={busy}
        onConfirm={handleConfirmAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
};
