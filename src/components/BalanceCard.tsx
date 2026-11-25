import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Users,
  Handshake,
  Layers,
  QrCode,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppLanguage, CurrencyCode, DashboardCurrencyBalance } from '../types';
import { convertMinorCurrency, formatCurrency } from '../utils/finance';

interface BalanceCardProps {
  balancesByCurrency: Record<CurrencyCode, DashboardCurrencyBalance>;
  preferredCurrency: CurrencyCode;
  totalActiveGroups: number;
  sectionLabel?: string;
  onAddExpense: () => void;
  onCreateGroup: () => void;
  onQuickBill?: () => void;
  onSettleDebt: () => void;
  onOpenMyIpsQr?: () => void;
}

const CURRENCIES: CurrencyCode[] = ['RSD', 'EUR', 'BAM'];

export const BalanceCard: React.FC<BalanceCardProps> = ({
  balancesByCurrency,
  preferredCurrency,
  totalActiveGroups,
  sectionLabel,
  onAddExpense,
  onCreateGroup,
  onQuickBill,
  onSettleDebt,
  onOpenMyIpsQr,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';

  const activeCurrencies = useMemo(() => {
    const used = CURRENCIES.filter((c) => balancesByCurrency[c].activeGroupsCount > 0);
    if (!used.includes(preferredCurrency)) {
      return [preferredCurrency, ...used];
    }
    return used;
  }, [balancesByCurrency, preferredCurrency]);

  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>(preferredCurrency);

  // Whenever user switches language (which updates preferredCurrency: sr->RSD, hr->EUR, bs->BAM), switch displayed currency immediately
  useEffect(() => {
    setSelectedCurrency(preferredCurrency);
  }, [preferredCurrency]);

  const effectiveCurrency = activeCurrencies.includes(selectedCurrency)
    ? selectedCurrency
    : preferredCurrency;

  const current = useMemo<DashboardCurrencyBalance>(() => {
    const direct = balancesByCurrency[effectiveCurrency];
    if (direct.activeGroupsCount > 0) return direct;

    // If user switched language/currency to one with no native groups yet, show converted equivalent of all balances
    let owedToYouMinor = 0;
    let youOweMinor = 0;
    let netBalanceMinor = 0;
    for (const c of CURRENCIES) {
      const b = balancesByCurrency[c];
      if (b.activeGroupsCount === 0) continue;
      owedToYouMinor += convertMinorCurrency(b.owedToYouMinor, c, effectiveCurrency);
      youOweMinor += convertMinorCurrency(b.youOweMinor, c, effectiveCurrency);
      const absNet = Math.abs(b.netBalanceMinor);
      const convNet = convertMinorCurrency(absNet, c, effectiveCurrency);
      netBalanceMinor += b.netBalanceMinor < 0 ? -convNet : convNet;
    }
    return {
      currency: effectiveCurrency,
      owedToYouMinor,
      youOweMinor,
      netBalanceMinor,
      activeGroupsCount: totalActiveGroups,
    };
  }, [balancesByCurrency, effectiveCurrency, totalActiveGroups]);
  const isPositive = current.netBalanceMinor > 0;
  const isNegative = current.netBalanceMinor < 0;

  return (
    <section className="rounded-[24px] sm:rounded-[26px] bg-gradient-to-br from-[#35483F] via-[#3A5146] to-[#476457] text-white p-5 sm:p-7 shadow-(--shadow-hero) relative overflow-hidden">
      {/* Subtle architectural highlight circle */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-white/[0.05]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 -left-16 w-56 h-56 rounded-full bg-white/[0.04]"
      />

      <div className="relative z-10">
        {/* Top row: Label + My IPS QR + currency switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-[#E8F1EB]/90 bg-white/10 px-3 py-1.5 rounded-full">
            <Layers className="w-3.5 h-3.5" />
            <span>{t('common.groupsCount', { count: totalActiveGroups })}</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {onOpenMyIpsQr && (
              <button
                type="button"
                onClick={onOpenMyIpsQr}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-[#35483F] hover:bg-[#E8F1EB] text-xs font-bold shadow-xs transition-colors"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>{t('ips.myQrButton')}</span>
              </button>
            )}

            {activeCurrencies.length > 1 ? (
              <div className="inline-flex items-center bg-black/15 p-0.5 rounded-full">
                {activeCurrencies.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedCurrency(c)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                      effectiveCurrency === c
                        ? 'bg-white text-[#35483F] shadow-xs'
                        : 'text-white/75 hover:text-white'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-xs font-semibold tracking-wide text-[#E8F1EB]/80 bg-white/10 px-3 py-1 rounded-full">
                {effectiveCurrency}
              </span>
            )}
          </div>
        </div>

        {/* Main Net Balance */}
        <div className="mt-5">
          <p className="text-xs uppercase tracking-wider font-medium text-[#E8F1EB]/75">
            {sectionLabel
              ? `${t('dashboard.netBalance')} • ${sectionLabel}`
              : t('dashboard.netBalance')}
          </p>
          <div className="flex items-baseline gap-3 mt-1.5 flex-wrap">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums">
              {formatCurrency(current.netBalanceMinor, effectiveCurrency, lang, { showSign: true })}
            </h2>
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                isPositive
                  ? 'bg-[#16835B]/35 text-[#B4F0D6]'
                  : isNegative
                  ? 'bg-[#C94A4A]/35 text-[#FFD2D2]'
                  : 'bg-white/15 text-[#E8F1EB]'
              }`}
            >
              {isPositive
                ? t('dashboard.owedToYou')
                : isNegative
                ? t('dashboard.youOwe')
                : t('common.settledUp')}
            </span>
          </div>
        </div>

        {/* Owed to you vs You owe breakdown */}
        <div className="grid grid-cols-2 gap-3 mt-6">
          <div className="rounded-2xl bg-white/[0.09] border border-white/10 p-3.5 sm:p-4 backdrop-blur-xs">
            <div className="flex items-center gap-1.5 text-xs text-[#E8F1EB]/80">
              <span className="w-5 h-5 rounded-full bg-[#16835B]/40 text-[#B4F0D6] flex items-center justify-center shrink-0">
                <ArrowDownLeft className="w-3.5 h-3.5" />
              </span>
              <span className="truncate">{t('dashboard.totalOwedToYou')}</span>
            </div>
            <p className="text-lg sm:text-xl font-bold mt-2 tabular-nums text-[#C9F5E1]">
              {formatCurrency(current.owedToYouMinor, effectiveCurrency, lang)}
            </p>
          </div>

          <div className="rounded-2xl bg-white/[0.09] border border-white/10 p-3.5 sm:p-4 backdrop-blur-xs">
            <div className="flex items-center gap-1.5 text-xs text-[#E8F1EB]/80">
              <span className="w-5 h-5 rounded-full bg-[#C94A4A]/40 text-[#FFD2D2] flex items-center justify-center shrink-0">
                <ArrowUpRight className="w-3.5 h-3.5" />
              </span>
              <span className="truncate">{t('dashboard.totalYouOwe')}</span>
            </div>
            <p className="text-lg sm:text-xl font-bold mt-2 tabular-nums text-[#FFD7D7]">
              {formatCurrency(current.youOweMinor, effectiveCurrency, lang)}
            </p>
          </div>
        </div>

        {/* Quick Actions (clean row, no extra clutter) */}
        <div
          className={`grid gap-2 sm:gap-2.5 mt-5 pt-4 border-t border-white/12 ${
            onQuickBill ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
          }`}
        >
          <button
            type="button"
            onClick={onAddExpense}
            className="min-h-[50px] sm:min-h-[46px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-2xl bg-white text-[#35483F] hover:bg-[#E8F1EB] font-semibold text-[11px] sm:text-sm transition-colors shadow-xs active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-full">{t('dashboard.quickAddExpense')}</span>
          </button>

          <button
            type="button"
            onClick={onCreateGroup}
            className="min-h-[50px] sm:min-h-[46px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-2xl bg-white/14 hover:bg-white/22 text-white font-medium text-[11px] sm:text-sm transition-colors active:scale-[0.98]"
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-full">{t('dashboard.quickNewGroup')}</span>
          </button>

          {onQuickBill && (
            <button
              type="button"
              onClick={onQuickBill}
              className="min-h-[50px] sm:min-h-[46px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-2xl bg-white/14 hover:bg-white/22 text-white font-medium text-[11px] sm:text-sm transition-colors active:scale-[0.98]"
            >
              <Zap className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-full">{t('quickBill.title')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onSettleDebt}
            className="min-h-[50px] sm:min-h-[46px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-2xl bg-white/14 hover:bg-white/22 text-white font-medium text-[11px] sm:text-sm transition-colors active:scale-[0.98]"
          >
            <Handshake className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-full">{t('dashboard.quickSettle')}</span>
          </button>
        </div>
      </div>
    </section>
  );
};
