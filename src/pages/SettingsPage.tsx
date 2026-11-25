import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Building2,
  Camera,
  CheckCircle2,
  Globe,
  Lock,
  LogOut,
  Mail,
  ShieldAlert,
  User,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import type { CurrencyCode, NotificationPreferences } from '../types';
import { MemberAvatar } from '../components/MemberAvatar';
import { LanguageSelector } from '../components/LanguageSelector';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { HowItWorksGuide } from '../components/HowItWorksGuide';
import {
  formatSerbianAccount,
  parseAndValidateSerbianAccount,
} from '../utils/ipsQr';

const CURRENCIES: CurrencyCode[] = ['RSD', 'EUR', 'BAM'];

type SettingsTab = 'profile' | 'guide' | 'preferences' | 'security';

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user, isDemo, updateProfile, uploadAvatar, updateEmail, updatePassword, logout } =
    useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = (searchParams.get('tab') as SettingsTab) || 'profile';
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    ['profile', 'guide', 'preferences', 'security'].includes(initialTab)
      ? initialTab
      : 'profile'
  );

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bankAccountInput, setBankAccountInput] = useState('');
  const [bankRecipientName, setBankRecipientName] = useState('');
  const [bankAccountError, setBankAccountError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>('RSD');
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    new_expense: true,
    settlement_updates: true,
    group_invites: true,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const paramTab = searchParams.get('tab') as SettingsTab | null;
    if (paramTab && ['profile', 'guide', 'preferences', 'security'].includes(paramTab)) {
      setActiveTab(paramTab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.first_name);
    setLastName(user.last_name);
    setBankAccountInput(user.bank_account ? formatSerbianAccount(user.bank_account) : '');
    setBankRecipientName(user.bank_recipient_name ?? '');
    setBankAccountError(null);
    setCurrency(user.preferred_currency);
    setNotifPrefs(
      user.notification_preferences ?? {
        new_expense: true,
        settlement_updates: true,
        group_invites: true,
      }
    );
  }, [user]);

  if (!user) return null;

  const switchTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    setSearchParams(tab === 'profile' ? {} : { tab }, { replace: true });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      await uploadAvatar(file);
      showToast(t('settings.profileSaved'), 'success');
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBankAccountError(null);

    let normalizedAccount: string | null = null;
    const trimmedAccount = bankAccountInput.trim();
    if (trimmedAccount) {
      const check = parseAndValidateSerbianAccount(trimmedAccount);
      if (!check.valid || !check.normalized) {
        setBankAccountError(t('ips.invalidAccountError'));
        return;
      }
      normalizedAccount = check.normalized;
    }

    setSavingProfile(true);
    try {
      await updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        bank_account: normalizedAccount,
        bank_recipient_name: normalizedAccount
          ? bankRecipientName.trim().slice(0, 70) || `${firstName.trim()} ${lastName.trim()}`.trim()
          : null,
        preferred_currency: currency,
        notification_preferences: notifPrefs,
      });
      showToast(t('settings.profileSaved'), 'success');
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      showToast(t('settings.demoActionBlocked'), 'info');
      return;
    }
    if (!newEmail.includes('@')) {
      showToast(t('auth.errors.invalidEmail'), 'error');
      return;
    }
    setSavingEmail(true);
    try {
      await updateEmail(newEmail);
      setNewEmail('');
      showToast(t('settings.emailChangeSent'), 'success');
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      showToast(t('settings.demoActionBlocked'), 'info');
      return;
    }
    if (newPassword.length < 6) {
      showToast(t('auth.errors.passwordTooShort'), 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast(t('auth.errors.passwordMismatch'), 'error');
      return;
    }
    setSavingPassword(true);
    try {
      await updatePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      showToast(t('auth.passwordUpdatedSuccess'), 'success');
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (isDemo) {
      setConfirmDeleteOpen(false);
      showToast(t('settings.demoActionBlocked'), 'info');
      return;
    }
    setDeleting(true);
    try {
      await logout();
      showToast(t('settings.accountDeleted'), 'success');
      navigate('/login');
    } finally {
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'profile', label: t('settings.tabs.profile'), icon: User },
    { id: 'guide', label: t('settings.tabs.guide'), icon: BookOpen },
    { id: 'preferences', label: t('settings.tabs.preferences'), icon: Globe },
    { id: 'security', label: t('settings.tabs.security'), icon: Lock },
  ];

  return (
    <div className="space-y-5 max-w-3xl animate-fade-in-up">
      {/* Compact Profile Hero Card */}
      <section className="bg-white rounded-3xl border border-[#E8ECE9] p-5 shadow-(--shadow-card) flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="relative shrink-0">
            <MemberAvatar profile={user} size="lg" />
            <label
              title={t('settings.changeAvatar')}
              className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-[#35483F] text-white flex items-center justify-center ring-2 ring-white cursor-pointer hover:bg-[#2B3B33]"
            >
              <Camera className="w-3.5 h-3.5" />
              <input
                type="file"
                accept="image/*"
                disabled={uploadingAvatar}
                onChange={handleAvatarChange}
                className="hidden"
              />
            </label>
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-[#171C19] truncate">
              {`${firstName} ${lastName}`.trim() || user.email}
            </h1>
            <p className="text-xs sm:text-sm text-[#818A84] truncate">{user.email}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-[#F5F7F6] hover:bg-[#E8ECE9] text-[#171C19] text-xs font-semibold shrink-0"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">
            {isDemo ? t('app.exitDemo') : t('nav.logout')}
          </span>
        </button>
      </section>

      {/* Clean 2x2 (mobile) / 4-col (desktop) Section Selector */}
      <nav
        aria-label={t('settings.accountMenuTitle')}
        className="grid grid-cols-2 sm:grid-cols-4 gap-2"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchTab(tab.id)}
              className={`flex items-center justify-center gap-2 min-h-[46px] px-3 py-2.5 rounded-2xl border text-xs sm:text-sm font-semibold transition-all ${
                active
                  ? 'bg-[#35483F] text-white border-[#35483F] shadow-xs'
                  : 'bg-white text-[#171C19] border-[#E8ECE9] hover:bg-[#F5F7F6]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* TAB 1: PROFILE */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <section className="bg-white rounded-3xl border border-[#E8ECE9] p-5 sm:p-6 shadow-(--shadow-card) space-y-4">
            <h2 className="text-base font-bold text-[#171C19]">
              {t('settings.profileSection')}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
                  {t('settings.firstName')}
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full min-h-[46px] px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
                  {t('settings.lastName')}
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full min-h-[46px] px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
                />
              </div>
            </div>

            {/* Serbian Bank Account for NBS IPS QR */}
            <div className="pt-4 mt-2 border-t border-[#E8ECE9] space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#E8F1EB] text-[#35483F] flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#171C19]">{t('ips.bankFormTitle')}</h3>
                  <p className="text-xs text-[#818A84]">{t('ips.bankFormSubtitle')}</p>
                </div>
              </div>

              {bankAccountError && (
                <div className="px-3.5 py-2.5 rounded-xl bg-[#FCEEEE] text-[#C94A4A] text-xs font-semibold">
                  {bankAccountError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
                    {t('ips.accountLabel')}
                  </label>
                  <input
                    type="text"
                    value={bankAccountInput}
                    onChange={(e) => {
                      setBankAccountInput(e.target.value);
                      setBankAccountError(null);
                    }}
                    placeholder="160-123456-90"
                    className="w-full min-h-[46px] px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 font-mono text-base sm:text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
                  />
                  <p className="text-[11px] text-[#818A84] mt-1">{t('ips.accountFormatHint')}</p>
                  {(() => {
                    const check = bankAccountInput.trim()
                      ? parseAndValidateSerbianAccount(bankAccountInput)
                      : null;
                    if (!check?.valid || !check.normalized) return null;
                    return (
                      <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#16835B] bg-[#E6F4EE] px-2.5 py-1 rounded-lg">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{formatSerbianAccount(check.normalized)}</span>
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
                    {t('ips.recipientNameLabel')}
                  </label>
                  <input
                    type="text"
                    maxLength={70}
                    value={bankRecipientName}
                    onChange={(e) => setBankRecipientName(e.target.value)}
                    placeholder={`${firstName} ${lastName}`.trim() || 'Marko Petrović'}
                    className="w-full min-h-[46px] px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="w-full sm:w-auto px-6 min-h-[46px] py-3 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                {savingProfile ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </section>

          {/* Direct shortcut card to How-To Guide right inside Profile */}
          <button
            type="button"
            onClick={() => switchTab('guide')}
            className="w-full text-left bg-[#E8F1EB]/75 hover:bg-[#E8F1EB] border border-[#35483F]/15 rounded-3xl p-4 sm:p-5 flex items-center justify-between gap-3 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#35483F] text-white flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#171C19]">{t('guide.title')}</p>
                <p className="text-xs text-[#476457] mt-0.5 truncate">{t('guide.subtitle')}</p>
              </div>
            </div>
            <span className="text-xs font-bold text-[#35483F] shrink-0">
              {t('guide.openFullGuide')} →
            </span>
          </button>
        </form>
      )}

      {/* TAB 2: HOW TO USE GUIDE */}
      {activeTab === 'guide' && <HowItWorksGuide variant="full" />}

      {/* TAB 3: LANGUAGE, CURRENCY & NOTIFICATIONS */}
      {activeTab === 'preferences' && (
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <section className="bg-white rounded-3xl border border-[#E8ECE9] p-5 sm:p-6 shadow-(--shadow-card) space-y-5">
            <h2 className="text-base font-bold text-[#171C19]">
              {t('settings.preferencesSection')}
            </h2>

            <div>
              <label className="block text-sm font-semibold text-[#171C19] mb-2">
                {t('settings.language')}
              </label>
              <LanguageSelector variant="pills" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#171C19] mb-2">
                {t('settings.defaultCurrency')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {CURRENCIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`min-h-[46px] px-4 py-3 rounded-2xl border text-sm font-semibold transition-all text-left sm:text-center ${
                      currency === c
                        ? 'bg-[#35483F] text-white border-[#35483F]'
                        : 'bg-white text-[#171C19] border-[#E8ECE9] hover:bg-[#F5F7F6]'
                    }`}
                  >
                    {t(`currencies.${c}`)}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-white rounded-3xl border border-[#E8ECE9] p-5 sm:p-6 shadow-(--shadow-card) space-y-4">
            <h2 className="text-base font-bold text-[#171C19]">
              {t('settings.notificationsSection')}
            </h2>

            {(
              [
                ['new_expense', t('settings.notifNewExpense'), t('settings.notifNewExpenseDesc')],
                [
                  'settlement_updates',
                  t('settings.notifSettlements'),
                  t('settings.notifSettlementsDesc'),
                ],
                ['group_invites', t('settings.notifInvites'), t('settings.notifInvitesDesc')],
              ] as const
            ).map(([key, title, desc]) => {
              const enabled = notifPrefs[key];
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-4 py-2 border-b last:border-b-0 border-[#E8ECE9]/70"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#171C19]">{title}</p>
                    <p className="text-xs text-[#818A84] mt-0.5">{desc}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() =>
                      setNotifPrefs((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                    className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 ${
                      enabled ? 'bg-[#35483F]' : 'bg-[#D5DCD8]'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                        enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              );
            })}

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="w-full sm:w-auto px-6 min-h-[46px] py-3 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                {savingProfile ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </section>
        </form>
      )}

      {/* TAB 4: SECURITY & ACCOUNT */}
      {activeTab === 'security' && (
        <div className="space-y-4">
          <section className="bg-white rounded-3xl border border-[#E8ECE9] p-5 sm:p-6 shadow-(--shadow-card) space-y-6">
            <h2 className="text-base font-bold text-[#171C19]">
              {t('settings.securitySection')}
            </h2>

            <form onSubmit={handleChangeEmail} className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-[#171C19]">
                <Mail className="w-4 h-4 text-[#476457]" />
                <span>{t('settings.changeEmailTitle')}</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder={t('settings.newEmail')}
                  className="flex-1 min-h-[46px] px-4 py-2.5 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
                />
                <button
                  type="submit"
                  disabled={savingEmail || !newEmail}
                  className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-[#E8F1EB] hover:bg-[#D8E8DD] text-[#35483F] text-sm font-semibold disabled:opacity-50"
                >
                  {t('settings.changeEmailButton')}
                </button>
              </div>
            </form>

            <form
              onSubmit={handleChangePassword}
              className="space-y-3 pt-5 border-t border-[#E8ECE9]"
            >
              <label className="flex items-center gap-2 text-sm font-semibold text-[#171C19]">
                <Lock className="w-4 h-4 text-[#476457]" />
                <span>{t('settings.changePasswordTitle')}</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('settings.newPassword')}
                  className="min-h-[46px] px-4 py-2.5 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('settings.confirmNewPassword')}
                  className="min-h-[46px] px-4 py-2.5 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-base sm:text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
                />
              </div>
              <button
                type="submit"
                disabled={savingPassword || !newPassword}
                className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-2xl bg-[#E8F1EB] hover:bg-[#D8E8DD] text-[#35483F] text-sm font-semibold disabled:opacity-50"
              >
                {t('settings.changePasswordButton')}
              </button>
            </form>
          </section>

          <section className="bg-white rounded-3xl border border-[#E8ECE9] p-5 sm:p-6 shadow-(--shadow-card) flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="max-w-md">
              <h3 className="text-sm font-bold text-[#C94A4A] flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" />
                <span>{t('settings.deleteAccountTitle')}</span>
              </h3>
              <p className="text-xs text-[#818A84] mt-1 leading-relaxed">
                {t('settings.deleteAccountDesc')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#FCEEEE] hover:bg-[#F9DCDC] text-[#C94A4A] text-sm font-semibold shrink-0"
            >
              {t('settings.deleteAccountButton')}
            </button>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        variant="danger"
        title={t('settings.deleteAccountConfirmTitle')}
        description={t('settings.deleteAccountConfirmBody')}
        confirmLabel={t('settings.deleteAccountButton')}
        loading={deleting}
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
};
