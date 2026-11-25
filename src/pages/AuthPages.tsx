import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  MailCheck,
  Sparkles,
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import type { CurrencyCode } from '../types';
import { PodeliLogo } from '../components/PodeliLogo';
import { LanguageSelector } from '../components/LanguageSelector';
import { MemberAvatar } from '../components/MemberAvatar';

const AuthShell: React.FC<{
  title: string;
  subtitle: string;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => {
  const { t } = useTranslation();
  const { isSupabaseReady, enterDemo } = useAuth();
  const navigate = useNavigate();

  const handleEnterDemo = () => {
    enterDemo();
    navigate('/');
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-[#F5F7F6] flex flex-col lg:flex-row pt-[env(safe-area-inset-top)] lg:pt-0">
      {/* Left Brand Panel (Desktop) */}
      <div className="hidden lg:flex lg:w-[44%] bg-gradient-to-br from-[#35483F] via-[#3A5146] to-[#476457] text-white p-12 flex-col justify-between relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/[0.05]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-24 w-80 h-80 rounded-full bg-white/[0.04]"
        />

        <div className="relative z-10">
          <PodeliLogo size="lg" inverted />
        </div>

        <div className="relative z-10 space-y-6 max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            {t('app.tagline')}
          </h2>

          {/* Mini Preview Card */}
          <div className="rounded-3xl bg-white/10 border border-white/15 p-5 backdrop-blur-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#E8F1EB]/80">
                🥂 Petak u gradu
              </span>
              <span className="text-[11px] font-bold bg-white/15 px-2.5 py-0.5 rounded-full">
                RSD
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-[#E8F1EB]/80">{t('dashboard.owedToYou')}</span>
              <span className="text-2xl font-bold tabular-nums text-[#C9F5E1]">
                +5.000,00 RSD
              </span>
            </div>
            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-[#E8F1EB]/80">
              <span>Večera • Piće • Taksi</span>
              <span>4 {t('groups.tabs.members').toLowerCase()}</span>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-[#E8F1EB]/60">
          PODELI • RSD · EUR · BAM • SR · HR · BS
        </p>
      </div>

      {/* Right Auth Form Column */}
      <div className="flex-1 flex flex-col justify-between p-5 sm:p-8 lg:p-12">
        <div className="flex items-center justify-between max-w-md w-full mx-auto">
          <div className="lg:hidden">
            <PodeliLogo size="md" />
          </div>
          <div className="ml-auto">
            <LanguageSelector variant="compact" />
          </div>
        </div>

        <div className="w-full max-w-md mx-auto my-8 space-y-6 animate-fade-in-up">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#171C19] tracking-tight">
              {title}
            </h1>
            <p className="text-sm text-[#818A84] mt-1.5 leading-relaxed">{subtitle}</p>
          </div>

          {!isSupabaseReady && (
            <div className="p-4 rounded-2xl bg-[#FDF4E6] border border-[#B87314]/25 text-xs text-[#7D500E] space-y-1.5">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{t('auth.supabaseNotConfiguredTitle')}</span>
              </div>
              <p className="leading-relaxed">{t('auth.supabaseNotConfiguredDesc')}</p>
            </div>
          )}

          <div className="bg-white rounded-3xl border border-[#E8ECE9] p-6 sm:p-7 shadow-(--shadow-card)">
            {children}
          </div>

          {/* Dedicated Demo Mode Entry */}
          <div className="bg-[#E8F1EB]/65 border border-[#35483F]/15 rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#35483F]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('app.demoBadge')}</span>
              </div>
              <p className="text-xs text-[#476457] mt-1 leading-relaxed">
                {t('auth.tryDemoHint')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleEnterDemo}
              className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-xs font-semibold whitespace-nowrap inline-flex items-center justify-center gap-1.5 transition-colors shrink-0"
            >
              <span>{t('auth.tryDemo')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
};

export const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const { login, isSupabaseReady } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError(t('auth.errors.requiredFields'));
      return;
    }
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(redirect);
    } catch {
      setError(
        isSupabaseReady
          ? t('auth.errors.invalidCredentials')
          : t('auth.supabaseNotConfiguredDesc')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="px-4 py-3 rounded-2xl bg-[#FCEEEE] text-[#C94A4A] text-sm font-medium">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
            {t('auth.email')}
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.emailPlaceholder')}
            className="w-full px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#35483F]/20 focus:border-[#35483F]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-[#171C19]">{t('auth.password')}</label>
            <Link
              to="/forgot-password"
              className="text-xs font-semibold text-[#35483F] hover:underline"
            >
              {t('auth.forgotLink')}
            </Link>
          </div>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.passwordPlaceholder')}
            className="w-full px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#35483F]/20 focus:border-[#35483F]"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
        >
          {submitting ? t('app.loading') : t('auth.loginButton')}
        </button>

        <Link
          to="/brzi-racun"
          className="w-full py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6] hover:bg-[#E8F1EB]/60 text-[#35483F] text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          <span>⚡ {t('quickBill.guestEntryButton')}</span>
        </Link>

        <p className="text-center text-sm text-[#818A84] pt-2">
          {t('auth.noAccount')}{' '}
          <Link
            to={
              redirect !== '/'
                ? `/register?redirect=${encodeURIComponent(redirect)}`
                : '/register'
            }
            className="font-semibold text-[#35483F] hover:underline"
          >
            {t('auth.createAccountLink')}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
};

export const RegisterPage: React.FC = () => {
  const { t } = useTranslation();
  const { register, pendingVerificationEmail, clearPendingVerification, isSupabaseReady } =
    useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/onboarding';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pendingVerificationEmail) {
    return (
      <AuthShell
        title={t('auth.verifyTitle')}
        subtitle={t('auth.verifySubtitle', { email: pendingVerificationEmail })}
      >
        <div className="text-center space-y-5 py-2">
          <div className="w-14 h-14 rounded-2xl bg-[#E6F4EE] text-[#16835B] flex items-center justify-center mx-auto">
            <MailCheck className="w-7 h-7" />
          </div>
          <Link
            to="/login"
            onClick={clearPendingVerification}
            className="block w-full py-3 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold"
          >
            {t('auth.backToLogin')}
          </Link>
        </div>
      </AuthShell>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setError(t('auth.errors.requiredFields'));
      return;
    }
    if (password.length < 6) {
      setError(t('auth.errors.passwordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.errors.passwordMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      const { needsEmailVerification } = await register({
        firstName,
        lastName,
        email,
        password,
      });
      if (!needsEmailVerification) {
        navigate(redirect);
      }
    } catch {
      setError(
        isSupabaseReady ? t('auth.errors.emailInUse') : t('auth.supabaseNotConfiguredDesc')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="px-4 py-3 rounded-2xl bg-[#FCEEEE] text-[#C94A4A] text-sm font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
              {t('auth.firstName')}
            </label>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t('auth.firstNamePlaceholder')}
              className="w-full px-3.5 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
              {t('auth.lastName')}
            </label>
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={t('auth.lastNamePlaceholder')}
              className="w-full px-3.5 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
            {t('auth.email')}
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.emailPlaceholder')}
            className="w-full px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
            {t('auth.password')}
          </label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.passwordPlaceholder')}
            className="w-full px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
            {t('auth.confirmPassword')}
          </label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('auth.confirmPasswordPlaceholder')}
            className="w-full px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
        >
          {submitting ? t('app.loading') : t('auth.registerButton')}
        </button>

        <p className="text-center text-sm text-[#818A84] pt-2">
          {t('auth.hasAccount')}{' '}
          <Link to="/login" className="font-semibold text-[#35483F] hover:underline">
            {t('auth.loginLink')}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
};

export const ForgotPasswordPage: React.FC = () => {
  const { t } = useTranslation();
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch {
      setError(t('app.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')}>
      {sent ? (
        <div className="text-center space-y-4 py-2">
          <div className="w-14 h-14 rounded-2xl bg-[#E6F4EE] text-[#16835B] flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <p className="text-sm text-[#171C19] font-medium">{t('auth.resetSentSuccess')}</p>
          <Link
            to="/login"
            className="block w-full py-3 rounded-2xl bg-[#35483F] text-white text-sm font-semibold"
          >
            {t('auth.backToLogin')}
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-2xl bg-[#FCEEEE] text-[#C94A4A] text-sm font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
              {t('auth.email')}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailPlaceholder')}
              className="w-full px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold disabled:opacity-50"
          >
            {submitting ? t('app.loading') : t('auth.sendResetButton')}
          </button>

          <Link
            to="/login"
            className="block text-center text-sm font-semibold text-[#35483F] hover:underline pt-1"
          >
            {t('auth.backToLogin')}
          </Link>
        </form>
      )}
    </AuthShell>
  );
};

export const ResetPasswordPage: React.FC = () => {
  const { t } = useTranslation();
  const { updatePassword } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError(t('auth.errors.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.errors.passwordMismatch'));
      return;
    }
    setSubmitting(true);
    try {
      await updatePassword(password);
      showToast(t('auth.passwordUpdatedSuccess'), 'success');
      navigate('/');
    } catch {
      setError(t('app.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="px-4 py-3 rounded-2xl bg-[#FCEEEE] text-[#C94A4A] text-sm font-medium">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
            {t('settings.newPassword')}
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
            {t('settings.confirmNewPassword')}
          </label>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm focus:bg-white focus:outline-none focus:border-[#35483F]"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? t('common.saving') : t('auth.updatePasswordButton')}
        </button>
      </form>
    </AuthShell>
  );
};

export const OnboardingPage: React.FC = () => {
  const { t } = useTranslation();
  const { user, updateProfile, uploadAvatar } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [currency, setCurrency] = useState<CurrencyCode>(user?.preferred_currency ?? 'RSD');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadAvatar(file);
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      await updateProfile({
        preferred_currency: currency,
        onboarding_completed: true,
      });
      navigate('/');
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7F6] flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-[#E8ECE9] p-7 sm:p-8 shadow-(--shadow-card) space-y-6 animate-scale-in">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <PodeliLogo size="md" />
          </div>
          <h1 className="text-2xl font-bold text-[#171C19] pt-2">{t('onboarding.title')}</h1>
          <p className="text-sm text-[#818A84]">{t('onboarding.subtitle')}</p>
        </div>

        {/* Avatar Upload */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <MemberAvatar profile={user} size="xl" />
            <label className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#35483F] text-white flex items-center justify-center ring-2 ring-white cursor-pointer hover:bg-[#2B3B33]">
              <Camera className="w-4 h-4" />
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={handleAvatar}
                className="hidden"
              />
            </label>
          </div>
          <p className="text-xs text-[#818A84]">{t('onboarding.avatarHint')}</p>
        </div>

        {/* Language */}
        <div>
          <label className="block text-sm font-semibold text-[#171C19] mb-2">
            {t('onboarding.languageLabel')}
          </label>
          <LanguageSelector variant="pills" />
        </div>

        {/* Currency */}
        <div>
          <label className="block text-sm font-semibold text-[#171C19] mb-2">
            {t('onboarding.currencyLabel')}
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {(['RSD', 'EUR', 'BAM'] as CurrencyCode[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`py-3 rounded-2xl border text-sm font-bold transition-all ${
                  currency === c
                    ? 'bg-[#35483F] text-white border-[#35483F]'
                    : 'bg-white text-[#171C19] border-[#E8ECE9] hover:bg-[#F5F7F6]'
                }`}
              >
                {t(`currencies.short.${c}`)}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={saving || uploading}
          onClick={handleComplete}
          className="w-full py-3.5 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {saving ? t('common.saving') : t('onboarding.completeButton')}
        </button>
      </div>
    </div>
  );
};
