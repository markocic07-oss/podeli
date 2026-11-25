import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, Building2, ChevronDown, Info, QrCode, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import type { AppLanguage, CurrencyCode, PaymentMethod } from '../types';
import {
  convertMinorCurrency,
  formatCurrency,
  getDefaultCurrencyForLanguage,
  minorToEditableString,
  parseMajorToMinor,
} from '../utils/finance';
import { isValidSerbianAccount } from '../utils/ipsQr';
import { IpsQrPaymentModal, type IpsQrPaymentData } from './IpsQrPaymentModal';

const CURRENCY_CYCLE: CurrencyCode[] = ['RSD', 'EUR', 'BAM'];

interface RecordSettlementModalProps {
  open: boolean;
  defaultGroupId?: string;
  defaultSenderId?: string;
  defaultReceiverId?: string;
  defaultAmountMinor?: number;
  onClose: () => void;
}

export const RecordSettlementModal: React.FC<RecordSettlementModalProps> = ({
  open,
  defaultGroupId,
  defaultSenderId,
  defaultReceiverId,
  defaultAmountMinor,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';
  const { user } = useAuth();
  const { groups, createSettlement } = useData();
  const { showToast } = useToast();

  const [groupId, setGroupId] = useState('');
  const [senderId, setSenderId] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [paymentCurrency, setPaymentCurrency] = useState<CurrencyCode>('RSD');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [ipsQrData, setIpsQrData] = useState<IpsQrPaymentData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.group.id === groupId) ?? null,
    [groups, groupId]
  );

  const allMembers = useMemo(() => selectedGroup?.members ?? [], [selectedGroup]);
  const receiverOptions = useMemo(
    () => allMembers.filter((m) => m.user_id !== senderId),
    [allMembers, senderId]
  );

  useEffect(() => {
    if (!open) return;
    const grp = groups.find((g) => g.group.id === defaultGroupId) ?? groups[0] ?? null;
    setGroupId(grp?.group.id ?? '');
    const members = grp?.members ?? [];
    const initialSender =
      defaultSenderId && members.some((m) => m.user_id === defaultSenderId)
        ? defaultSenderId
        : user?.id ?? members[0]?.user_id ?? '';
    setSenderId(initialSender);

    const others = members.filter((m) => m.user_id !== initialSender);
    if (defaultReceiverId && others.some((m) => m.user_id === defaultReceiverId)) {
      setReceiverId(defaultReceiverId);
    } else {
      setReceiverId(others[0]?.user_id ?? '');
    }
    const targetCurrency = getDefaultCurrencyForLanguage(lang);
    const grpCurrency = grp?.group.currency ?? targetCurrency;
    setPaymentCurrency(targetCurrency);
    if (defaultAmountMinor) {
      const displayMinor = convertMinorCurrency(defaultAmountMinor, grpCurrency, targetCurrency);
      setAmountInput(minorToEditableString(displayMinor));
    } else {
      setAmountInput('');
    }
    setPaymentMethod('cash');
    setNote('');
    setIpsQrData(null);
    setError(null);
  }, [open, defaultGroupId, defaultSenderId, defaultReceiverId, defaultAmountMinor, groups, user?.id, lang]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const handleGroupChange = (newId: string) => {
    setGroupId(newId);
    const grp = groups.find((g) => g.group.id === newId);
    const members = grp?.members ?? [];
    const nextSender = user?.id && members.some((m) => m.user_id === user.id) ? user.id : members[0]?.user_id ?? '';
    setSenderId(nextSender);
    const others = members.filter((m) => m.user_id !== nextSender);
    setReceiverId(others[0]?.user_id ?? '');
    if (grp) setPaymentCurrency(grp.group.currency);
  };

  const handleCycleCurrency = () => {
    const idx = CURRENCY_CYCLE.indexOf(paymentCurrency);
    const nextCurrency = CURRENCY_CYCLE[(idx + 1) % CURRENCY_CYCLE.length];
    const currentMinor = parseMajorToMinor(amountInput);
    if (currentMinor && currentMinor > 0) {
      const converted = convertMinorCurrency(currentMinor, paymentCurrency, nextCurrency);
      setAmountInput(minorToEditableString(converted));
    }
    setPaymentCurrency(nextCurrency);
  };

  const groupCurrency: CurrencyCode = selectedGroup?.group.currency ?? 'RSD';
  const enteredMinor = parseMajorToMinor(amountInput) ?? 0;
  const convertedGroupMinor =
    enteredMinor > 0
      ? convertMinorCurrency(enteredMinor, paymentCurrency, groupCurrency)
      : 0;
  const convertedRsdMinor =
    enteredMinor > 0
      ? convertMinorCurrency(enteredMinor, paymentCurrency, 'RSD')
      : 0;

  const receiverMember = allMembers.find((m) => m.user_id === receiverId);
  const receiverAccount = receiverMember?.profile.bank_account ?? null;
  const canShowIpsQr = Boolean(
    receiverAccount && isValidSerbianAccount(receiverAccount) && convertedRsdMinor > 0
  );

  const handleSenderChange = (newSenderId: string) => {
    setSenderId(newSenderId);
    if (receiverId === newSenderId) {
      const other = allMembers.find((m) => m.user_id !== newSenderId);
      setReceiverId(other?.user_id ?? '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!user || !selectedGroup) return;

    const amountMinor = parseMajorToMinor(amountInput);
    if (!amountMinor || amountMinor <= 0) {
      setError(t('expenses.validation.amountInvalid'));
      return;
    }
    if (!senderId || !receiverId || senderId === receiverId) {
      setError(t('settlements.form.selectReceiver'));
      return;
    }

    const finalGroupMinor = convertMinorCurrency(
      amountMinor,
      paymentCurrency,
      selectedGroup.group.currency
    );
    const currencyNote =
      paymentCurrency !== selectedGroup.group.currency
        ? `(${formatCurrency(amountMinor, paymentCurrency, lang)})`
        : '';
    const finalNote = [note.trim(), currencyNote].filter(Boolean).join(' ') || null;

    setSubmitting(true);
    try {
      await createSettlement({
        group_id: selectedGroup.group.id,
        sender_id: senderId,
        receiver_id: receiverId,
        amount_minor: finalGroupMinor,
        payment_method: paymentMethod,
        note: finalNote,
      });
      showToast(
        user.id === receiverId
          ? t('settlements.confirmedSuccess')
          : t('settlements.createdSuccess'),
        'success'
      );
      onClose();
    } catch {
      setError(t('app.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-[#171C19]/45 backdrop-blur-[2px] animate-fade-in"
        role="dialog"
        aria-modal="true"
      >
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-[#E8ECE9] shadow-(--shadow-modal) overflow-hidden animate-scale-in">
        <div className="px-6 py-4 border-b border-[#E8ECE9] flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#171C19]">{t('settlements.form.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#818A84] hover:bg-[#F5F7F6] hover:text-[#171C19]"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-[#E8F1EB]/70 text-xs text-[#35483F] leading-relaxed">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{t('settlements.disclaimer')}</span>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-2xl bg-[#FCEEEE] text-[#C94A4A] text-sm font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
              {t('settlements.form.group')}
            </label>
            <select
              value={groupId}
              onChange={(e) => handleGroupChange(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm font-medium text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
            >
              {groups.map((g) => (
                <option key={g.group.id} value={g.group.id}>
                  {g.group.name} ({g.group.currency})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
                {t('settlements.form.sender')}
              </label>
              <select
                required
                value={senderId}
                onChange={(e) => handleSenderChange(e.target.value)}
                className="w-full px-3.5 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm font-medium text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
              >
                {allMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {`${m.profile.first_name} ${m.profile.last_name}`.trim()}
                    {m.user_id === user?.id ? ` (${t('common.you')})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
                {t('settlements.form.receiver')}
              </label>
              <select
                required
                value={receiverId}
                onChange={(e) => setReceiverId(e.target.value)}
                className="w-full px-3.5 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm font-medium text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
              >
                {receiverOptions.length === 0 && (
                  <option value="">{t('settlements.form.selectReceiver')}</option>
                )}
                {receiverOptions.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {`${m.profile.first_name} ${m.profile.last_name}`.trim()}
                    {m.user_id === user?.id ? ` (${t('common.you')})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
              {t('settlements.form.amount')}
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                required
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0,00"
                className="w-full pl-4 pr-20 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm font-bold tabular-nums text-[#171C19] focus:bg-white focus:outline-none focus:border-[#35483F]"
              />
              <button
                type="button"
                onClick={handleCycleCurrency}
                title="Promeni valutu (RSD / EUR / BAM)"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-0.5 text-xs font-bold text-[#35483F] bg-[#E8F1EB] hover:bg-[#D5E6DB] px-2.5 py-1 rounded-xl transition-colors"
              >
                <span>{paymentCurrency}</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
            {paymentCurrency !== groupCurrency && convertedGroupMinor > 0 && (
              <p className="text-[11px] font-medium text-[#476457] mt-1.5 px-1">
                ≈ {formatCurrency(convertedGroupMinor, groupCurrency, lang)} ({groupCurrency})
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
              {t('settlements.form.method')}
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  ['cash', Banknote],
                  ['bank_transfer', Building2],
                ] as const
              ).map(([method, Icon]) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`flex items-center justify-center gap-2 py-3 px-3 rounded-2xl border text-xs sm:text-sm font-semibold transition-all ${
                    paymentMethod === method
                      ? 'bg-[#35483F] text-white border-[#35483F]'
                      : 'bg-white text-[#171C19] border-[#E8ECE9] hover:bg-[#F5F7F6]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t(`settlements.methods.${method}`)}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
              {t('settlements.form.note')}{' '}
              <span className="font-normal text-[#818A84]">({t('common.optional')})</span>
            </label>
            <input
              type="text"
              maxLength={400}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('settlements.form.notePlaceholder')}
              className="w-full px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm text-[#171C19] placeholder:text-[#818A84] focus:bg-white focus:outline-none focus:border-[#35483F]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            {canShowIpsQr && receiverAccount && selectedGroup && (
              <button
                type="button"
                onClick={() =>
                  setIpsQrData({
                    recipientAccount: receiverAccount,
                    recipientName:
                      receiverMember?.profile.bank_recipient_name ||
                      `${receiverMember?.profile.first_name ?? ''} ${receiverMember?.profile.last_name ?? ''}`.trim() ||
                      t('common.member'),
                    amountMinor: convertedRsdMinor,
                    groupName: selectedGroup.group.name,
                    receiverId,
                    convertedFromLabel:
                      paymentCurrency !== 'RSD'
                        ? `${formatCurrency(enteredMinor, paymentCurrency, lang)} → NBS IPS QR (RSD)`
                        : undefined,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold text-[#35483F] bg-[#E8F1EB] hover:bg-[#D5E6DB] transition-colors mr-auto"
              >
                <QrCode className="w-4 h-4" />
                <span>{t('ips.payButton')}</span>
              </button>
            )}
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl text-sm font-medium text-[#171C19] bg-[#F5F7F6] hover:bg-[#E8ECE9]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || receiverOptions.length === 0}
              className="px-5 py-2.5 rounded-2xl text-sm font-semibold text-white bg-[#35483F] hover:bg-[#2B3B33] disabled:opacity-50"
            >
              {submitting ? t('common.saving') : t('settlements.form.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>

    <IpsQrPaymentModal
      open={Boolean(ipsQrData)}
      data={ipsQrData}
      onMarkAsPaid={() => setIpsQrData(null)}
      onClose={() => setIpsQrData(null)}
    />
    </>
  );
};
