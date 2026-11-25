import type {
  AppLanguage,
  CurrencyCode,
  DashboardCurrencyBalance,
  Expense,
  GroupBalanceSummary,
  GroupWithDetails,
  MemberBalance,
  PercentageInput,
  Settlement,
  ShareAllocation,
  SuggestedTransfer,
} from '../types';

const LOCALE_MAP: Record<AppLanguage, string> = {
  sr: 'sr-Latn-RS',
  hr: 'hr-HR',
  bs: 'bs-Latn-BA',
};

/**
 * Maps app language to its regional currency:
 * - sr -> RSD
 * - hr -> EUR
 * - bs -> BAM
 */
export function getDefaultCurrencyForLanguage(lang: AppLanguage | string): CurrencyCode {
  if (lang === 'hr') return 'EUR';
  if (lang === 'bs') return 'BAM';
  return 'RSD';
}

/**
 * Standard middle exchange rates relative to RSD for cross-currency settlement conversion.
 * 1 EUR ≈ 117.00 RSD, 1 BAM ≈ 59.82 RSD (1 EUR = 1.95583 BAM).
 */
export const CURRENCY_TO_RSD_RATE: Record<CurrencyCode, number> = {
  RSD: 1,
  EUR: 117.0,
  BAM: 59.82,
};

/**
 * Converts integer minor units between RSD, EUR, and BAM accurately.
 */
export function convertMinorCurrency(
  amountMinor: number,
  from: CurrencyCode,
  to: CurrencyCode
): number {
  if (from === to) return amountMinor;
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return 0;
  const rsdMinor = amountMinor * CURRENCY_TO_RSD_RATE[from];
  return Math.round(rsdMinor / CURRENCY_TO_RSD_RATE[to]);
}

/**
 * Parses a user-entered monetary amount string into exact integer minor units (100 minor = 1 major).
 * Handles both regional comma decimals (e.g. "2.500,50" or "2500,5") and dot decimals ("2500.50").
 * Never uses floating-point multiplication to avoid IEEE-754 drift.
 */
export function parseMajorToMinor(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s+/g, '');
  if (!cleaned) return null;

  // Reject negative signs or invalid characters
  if (!/^\d+([.,]\d+)*$/.test(cleaned)) {
    return null;
  }

  let normalized = cleaned;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    // Both separators present: whichever comes last is the decimal separator
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    // Only comma(s)
    const parts = cleaned.split(',');
    if (parts.length > 2) return null;
    normalized = `${parts[0]}.${parts[1]}`;
  } else if (lastDot !== -1) {
    // Only dot(s): could be thousands separator (e.g. 2.500 or 1.000.000) or decimal (25.50)
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      // Multiple dots -> must be thousands separators (each trailing group of 3 digits)
      if (parts.slice(1).every((p) => p.length === 3)) {
        normalized = parts.join('');
      } else {
        return null;
      }
    } else if (parts[1].length === 3 && parts[0].length >= 1) {
      // Ambiguous single dot with 3 digits after it in Balkan locale (e.g. "8.000" -> 8000)
      normalized = parts.join('');
    } else {
      normalized = cleaned;
    }
  }

  const [wholeStr, fracStr = ''] = normalized.split('.');
  if (fracStr.length > 2) {
    // Reject more than 2 decimal places so money isn't silently truncated
    return null;
  }

  const paddedFrac = fracStr.padEnd(2, '0');
  const whole = Number.parseInt(wholeStr, 10);
  const frac = Number.parseInt(paddedFrac, 10);

  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(frac)) {
    return null;
  }

  const totalMinor = whole * 100 + frac;
  if (!Number.isSafeInteger(totalMinor)) {
    return null;
  }
  return totalMinor;
}

/**
 * Formats integer minor units as an editable decimal string (using comma for Balkan UX).
 */
export function minorToEditableString(minor: number): string {
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  if (frac === 0) return String(whole);
  return `${whole},${String(frac).padStart(2, '0')}`;
}

/**
 * Parses a percentage string (e.g. "33,33" or "50") into integer basis points (100% = 10000).
 */
export function parsePercentToBasisPoints(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.').replace('%', '');
  if (!cleaned) return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [wholeStr, fracStr = ''] = cleaned.split('.');
  const padded = fracStr.padEnd(2, '0');
  const bps = Number.parseInt(wholeStr, 10) * 100 + Number.parseInt(padded, 10);
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10000) return null;
  return bps;
}

/**
 * Formats integer minor units with authentic regional formatting:
 * - RSD: 2.500,00 RSD
 * - EUR: 250,00 €
 * - BAM: 500,00 KM
 */
export function formatCurrency(
  minor: number,
  currency: CurrencyCode,
  lang: AppLanguage = 'sr',
  options?: { showSign?: boolean; compactZeroDecimals?: boolean }
): string {
  const isNeg = minor < 0;
  const absMinor = Math.abs(Math.trunc(minor));
  const majorValue = absMinor / 100;

  const locale = LOCALE_MAP[lang] || 'sr-Latn-RS';
  const showDecimals = !(options?.compactZeroDecimals && absMinor % 100 === 0);

  const formattedNumber = new Intl.NumberFormat(locale, {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(majorValue);

  const symbol = currency === 'EUR' ? '€' : currency === 'BAM' ? 'KM' : 'RSD';
  const sign = isNeg ? '−' : options?.showSign && minor > 0 ? '+' : '';

  return `${sign}${formattedNumber} ${symbol}`;
}

/**
 * Formats an ISO date or YYYY-MM-DD string in natural regional format.
 */
export function formatDate(dateStr: string, lang: AppLanguage = 'sr'): string {
  const locale = LOCALE_MAP[lang] || 'sr-Latn-RS';
  const d = dateStr.length === 10 ? new Date(`${dateStr}T12:00:00`) : new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Formats a timestamp relative to now or as short date + time.
 */
export function formatDateTime(isoStr: string, lang: AppLanguage = 'sr'): string {
  const locale = LOCALE_MAP[lang] || 'sr-Latn-RS';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Splits an integer amount equally across participants without losing or creating a single minor unit.
 * Remainder minor units (0..n-1) are distributed deterministically (+1 minor unit each) to the first `remainder` participants.
 */
export function calculateEqualSplit(
  amountMinor: number,
  participantIds: string[]
): ShareAllocation[] {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('AMOUNT_MUST_BE_POSITIVE_INTEGER');
  }
  const uniqueIds = Array.from(new Set(participantIds));
  if (uniqueIds.length === 0) {
    throw new Error('NO_PARTICIPANTS');
  }

  const count = uniqueIds.length;
  const baseShare = Math.floor(amountMinor / count);
  const remainder = amountMinor - baseShare * count;

  return uniqueIds.map((userId, index) => ({
    userId,
    shareAmountMinor: baseShare + (index < remainder ? 1 : 0),
  }));
}

/**
 * Validates custom exact-amount split allocations.
 */
export function validateCustomSplit(
  amountMinor: number,
  shares: ShareAllocation[]
): { valid: boolean; sumMinor: number; diffMinor: number } {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0 || shares.length === 0) {
    return { valid: false, sumMinor: 0, diffMinor: amountMinor };
  }

  const seen = new Set<string>();
  let sumMinor = 0;

  for (const s of shares) {
    if (!Number.isInteger(s.shareAmountMinor) || s.shareAmountMinor < 0) {
      return { valid: false, sumMinor, diffMinor: amountMinor - sumMinor };
    }
    if (seen.has(s.userId)) {
      return { valid: false, sumMinor, diffMinor: amountMinor - sumMinor };
    }
    seen.add(s.userId);
    sumMinor += s.shareAmountMinor;
  }

  const diffMinor = amountMinor - sumMinor;
  return {
    valid: diffMinor === 0 && sumMinor === amountMinor,
    sumMinor,
    diffMinor,
  };
}

/**
 * Splits an integer amount by percentage using integer basis points (100.00% = 10000)
 * and the Largest Remainder Method (Hamilton method) so shares ALWAYS sum exactly to amountMinor.
 */
export function calculatePercentageSplit(
  amountMinor: number,
  inputs: PercentageInput[]
): { valid: boolean; totalBasisPoints: number; shares: ShareAllocation[] } {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0 || inputs.length === 0) {
    return { valid: false, totalBasisPoints: 0, shares: [] };
  }

  let totalBasisPoints = 0;
  for (const item of inputs) {
    if (!Number.isInteger(item.basisPoints) || item.basisPoints < 0) {
      return { valid: false, totalBasisPoints, shares: [] };
    }
    totalBasisPoints += item.basisPoints;
  }

  if (totalBasisPoints !== 10000) {
    return { valid: false, totalBasisPoints, shares: [] };
  }

  // Exact integer math using BigInt to prevent any overflow
  const amountBig = BigInt(amountMinor);
  const denom = 10000n;

  const provisional = inputs.map((item, idx) => {
    const numerator = amountBig * BigInt(item.basisPoints);
    const floorVal = Number(numerator / denom);
    const remainder = Number(numerator % denom);
    return {
      userId: item.userId,
      floorVal,
      remainder,
      idx,
    };
  });

  const allocated = provisional.reduce((acc, p) => acc + p.floorVal, 0);
  let leftover = amountMinor - allocated;

  // Sort copy by largest remainder descending, breaking ties deterministically by original order
  const byRemainder = [...provisional].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.idx - b.idx;
  });

  const bonusMap = new Map<string, number>();
  for (let i = 0; i < leftover; i++) {
    const target = byRemainder[i % byRemainder.length];
    bonusMap.set(target.userId, (bonusMap.get(target.userId) ?? 0) + 1);
  }

  const shares: ShareAllocation[] = provisional.map((p) => ({
    userId: p.userId,
    shareAmountMinor: p.floorVal + (bonusMap.get(p.userId) ?? 0),
  }));

  return {
    valid: true,
    totalBasisPoints,
    shares,
  };
}

/**
 * Calculates exact net balances for every member of a group from expenses and confirmed settlements.
 *
 * Principle:
 * - For each expense:
 *   - Payer is credited `expense.amount_minor` (+paid)
 *   - Each participant is debited `share.share_amount_minor` (-owed)
 * - For each CONFIRMED settlement (pending/rejected/cancelled do NOT change balances):
 *   - Sender's net balance increases by +amount_minor (they paid off debt)
 *   - Receiver's net balance decreases by -amount_minor (they received owed money)
 *
 * Invariant: Sum of all member netBalanceMinor values in a group is ALWAYS 0.
 */
export function calculateGroupBalances(
  memberIds: string[],
  expenses: Expense[],
  settlements: Settlement[]
): GroupBalanceSummary {
  const map = new Map<string, MemberBalance>();

  const ensureMember = (userId: string): MemberBalance => {
    let entry = map.get(userId);
    if (!entry) {
      entry = {
        userId,
        totalPaidMinor: 0,
        totalOwedMinor: 0,
        confirmedSentMinor: 0,
        confirmedReceivedMinor: 0,
        netBalanceMinor: 0,
      };
      map.set(userId, entry);
    }
    return entry;
  };

  for (const id of memberIds) {
    ensureMember(id);
  }

  let totalExpensesMinor = 0;

  for (const expense of expenses) {
    totalExpensesMinor += expense.amount_minor;
    const payer = ensureMember(expense.paid_by);
    payer.totalPaidMinor += expense.amount_minor;

    for (const share of expense.shares) {
      const participant = ensureMember(share.user_id);
      participant.totalOwedMinor += share.share_amount_minor;
    }
  }

  for (const settlement of settlements) {
    if (settlement.status !== 'confirmed') continue;
    const sender = ensureMember(settlement.sender_id);
    const receiver = ensureMember(settlement.receiver_id);
    sender.confirmedSentMinor += settlement.amount_minor;
    receiver.confirmedReceivedMinor += settlement.amount_minor;
  }

  const balancesByUser: Record<string, MemberBalance> = {};
  const memberBalances: MemberBalance[] = [];

  for (const [userId, entry] of map.entries()) {
    entry.netBalanceMinor =
      entry.totalPaidMinor -
      entry.totalOwedMinor +
      entry.confirmedSentMinor -
      entry.confirmedReceivedMinor;
    balancesByUser[userId] = entry;
    memberBalances.push(entry);
  }

  const suggestedTransfers = optimizeSettlements(memberBalances);

  return {
    totalExpensesMinor,
    balancesByUser,
    memberBalances,
    suggestedTransfers,
  };
}

/**
 * Greedy debt-simplification algorithm that minimizes the number of transfers
 * needed to bring every group member's net balance to exactly 0.
 */
export function optimizeSettlements(balances: MemberBalance[]): SuggestedTransfer[] {
  const debtors: { userId: string; amount: number }[] = [];
  const creditors: { userId: string; amount: number }[] = [];

  for (const b of balances) {
    if (b.netBalanceMinor < 0) {
      debtors.push({ userId: b.userId, amount: -b.netBalanceMinor });
    } else if (b.netBalanceMinor > 0) {
      creditors.push({ userId: b.userId, amount: b.netBalanceMinor });
    }
  }

  // Deterministic descending sort (largest amounts first; tie-break by userId)
  const sortDesc = (a: { userId: string; amount: number }, b: { userId: string; amount: number }) =>
    b.amount !== a.amount ? b.amount - a.amount : a.userId.localeCompare(b.userId);

  const transfers: SuggestedTransfer[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(sortDesc);
    creditors.sort(sortDesc);

    const debtor = debtors[0];
    const creditor = creditors[0];
    const transferAmount = Math.min(debtor.amount, creditor.amount);

    if (transferAmount > 0) {
      transfers.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amountMinor: transferAmount,
      });
    }

    debtor.amount -= transferAmount;
    creditor.amount -= transferAmount;

    if (debtor.amount === 0) debtors.shift();
    if (creditor.amount === 0) creditors.shift();
  }

  return transfers;
}

/**
 * Aggregates the current user's balances across all groups, strictly segregated by currency.
 * Never combines RSD, EUR, and BAM into a single fake total.
 */
export function calculateDashboardBalances(
  userId: string,
  groups: GroupWithDetails[]
): Record<CurrencyCode, DashboardCurrencyBalance> {
  const result: Record<CurrencyCode, DashboardCurrencyBalance> = {
    RSD: { currency: 'RSD', owedToYouMinor: 0, youOweMinor: 0, netBalanceMinor: 0, activeGroupsCount: 0 },
    EUR: { currency: 'EUR', owedToYouMinor: 0, youOweMinor: 0, netBalanceMinor: 0, activeGroupsCount: 0 },
    BAM: { currency: 'BAM', owedToYouMinor: 0, youOweMinor: 0, netBalanceMinor: 0, activeGroupsCount: 0 },
  };

  for (const item of groups) {
    const currency = item.group.currency;
    const bucket = result[currency];
    bucket.activeGroupsCount += 1;

    const summary = calculateGroupBalances(
      item.members.map((m) => m.user_id),
      item.expenses,
      item.settlements
    );
    const myBalance = summary.balancesByUser[userId]?.netBalanceMinor ?? 0;

    if (myBalance > 0) {
      bucket.owedToYouMinor += myBalance;
    } else if (myBalance < 0) {
      bucket.youOweMinor += -myBalance;
    }
    bucket.netBalanceMinor += myBalance;
  }

  return result;
}
