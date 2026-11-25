/**
 * Official National Bank of Serbia (NBS) IPS QR Payment Standard utility.
 *
 * Implements:
 * - Serbian bank account normalization (dashed, shortened middle part, or 18-digit raw)
 * - Official MOD 97-10 control-digit validation using exact BigInt arithmetic
 * - Human-friendly account formatting (XXX-YYYYYYYYYYYYY-ZZ)
 * - Strict NBS IPS QR payload generator (K:PR|V:01|C:1|R:...|N:...|I:RSD...,..|SF:289|S:...)
 */

export interface IpsQrPayloadInput {
  /** 18-digit normalized (or valid dashed) Serbian bank account */
  recipientAccount: string;
  /** Recipient full name (trimmed, sanitized, max 70 chars) */
  recipientName: string;
  /** Amount in minor units (paras: 185050 = 1850,50 RSD). Optional: omit for open-amount QR. */
  amountMinor?: number | null;
  /** Purpose of payment (max 35 chars, e.g. "Podeli - Kopaonik") */
  purpose?: string;
  /** Payment code (defaults to '289' — transactions of natural persons) */
  paymentCode?: string;
}

/**
 * Normalizes any user-entered Serbian bank account into exactly 18 digits without dashes.
 *
 * Supported inputs:
 * - "160-5100102345678-90" -> "160510010234567890"
 * - "160-123456-90"        -> "160000000012345690" (middle zero-padded to 13 digits)
 * - "160000000012345690"   -> "160000000012345690"
 * - spaces / unicode dashes are tolerated
 *
 * Returns null if the structure cannot be normalized into a valid 18-digit account.
 */
export function normalizeSerbianAccount(input: string): string | null {
  const cleaned = input
    .trim()
    .replace(/\s+/g, '')
    .replace(/[–—−]/g, '-');

  if (!cleaned) return null;

  if (cleaned.includes('-')) {
    const parts = cleaned.split('-');
    if (parts.length !== 3) return null;
    const [bankCode, accountPart, controlDigits] = parts;
    if (!/^\d{3}$/.test(bankCode)) return null;
    if (!/^\d{1,13}$/.test(accountPart)) return null;
    if (!/^\d{2}$/.test(controlDigits)) return null;
    return `${bankCode}${accountPart.padStart(13, '0')}${controlDigits}`;
  }

  if (!/^\d{18}$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Validates an 18-digit Serbian bank account using the official NBS MOD 97 control-digit algorithm.
 *
 * Formula:
 *   first16 = account18.slice(0, 16)
 *   control = account18.slice(16, 18)
 *   expectedControl = 98 - ((BigInt(first16) * 100n) % 97n)
 *   valid iff expectedControl === BigInt(control)
 */
export function isValidSerbianAccount(account18: string): boolean {
  if (!/^\d{18}$/.test(account18)) return false;
  // Bank code cannot be 000
  if (account18.startsWith('000')) return false;

  const first16 = BigInt(account18.slice(0, 16));
  const control = BigInt(account18.slice(16, 18));
  const remainder = (first16 * 100n) % 97n;
  const expectedControl = 98n - remainder;

  return expectedControl === control;
}

/**
 * Convenience helper: normalizes and validates in one step.
 */
export function parseAndValidateSerbianAccount(input: string): {
  valid: boolean;
  normalized: string | null;
} {
  const normalized = normalizeSerbianAccount(input);
  if (!normalized) return { valid: false, normalized: null };
  return {
    valid: isValidSerbianAccount(normalized),
    normalized,
  };
}

/**
 * Formats an 18-digit Serbian bank account for clean UI display: "160-0000000123456-90".
 */
export function formatSerbianAccount(account18: string): string {
  const normalized = normalizeSerbianAccount(account18);
  if (!normalized) return account18;
  return `${normalized.slice(0, 3)}-${normalized.slice(3, 16)}-${normalized.slice(16, 18)}`;
}

/**
 * Sanitizes a text tag value for NBS IPS QR (removes '|', CR/LF, collapses whitespace, truncates).
 */
function sanitizeIpsText(raw: string, maxLength: number): string {
  return raw
    .replace(/\|/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

/**
 * Formats integer minor units (paras) strictly for NBS IPS QR I:RSD tag:
 * - Comma decimal separator
 * - Exactly 2 decimal places
 * - NO thousands separators
 * - NO space between RSD and number
 * Example: 185050 -> "RSD1850,50", 185000 -> "RSD1850,00"
 */
export function formatIpsAmount(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('INVALID_IPS_AMOUNT');
  }
  const whole = Math.floor(amountMinor / 100);
  const frac = amountMinor % 100;
  return `RSD${whole},${String(frac).padStart(2, '0')}`;
}

/**
 * Generates a strictly compliant NBS IPS QR string.
 *
 * Example output:
 * K:PR|V:01|C:1|R:160000000012345690|N:Marko Petrovic|I:RSD1850,00|SF:289|S:Podeli - Kopaonik
 */
export function generateIpsQrString(input: IpsQrPayloadInput): string {
  const normalizedAccount = normalizeSerbianAccount(input.recipientAccount);
  if (!normalizedAccount || !isValidSerbianAccount(normalizedAccount)) {
    throw new Error('INVALID_SERBIAN_ACCOUNT');
  }

  const cleanName = sanitizeIpsText(input.recipientName, 70);
  if (!cleanName) {
    throw new Error('INVALID_RECIPIENT_NAME');
  }

  const hasAmount = input.amountMinor !== undefined && input.amountMinor !== null && input.amountMinor !== 0;
  const formattedAmount = hasAmount ? formatIpsAmount(input.amountMinor as number) : null;
  const paymentCode = /^\d{3}$/.test(input.paymentCode ?? '289')
    ? (input.paymentCode ?? '289')
    : '289';
  const cleanPurpose = sanitizeIpsText(input.purpose || 'Podeli poravnanje', 35);

  const tags: string[] = [
    'K:PR',
    'V:01',
    'C:1',
    `R:${normalizedAccount}`,
    `N:${cleanName}`,
  ];

  if (formattedAmount) {
    tags.push(`I:${formattedAmount}`);
  }

  tags.push(`SF:${paymentCode}`);

  if (cleanPurpose) {
    tags.push(`S:${cleanPurpose}`);
  }

  const payload = tags.join('|');

  // Final sanity assertions: never emit NaN, trailing pipe, empty tag, or dot decimal in I:
  if (
    payload.includes('NaN') ||
    payload.endsWith('|') ||
    payload.includes('||') ||
    (formattedAmount && !/\|I:RSD\d+,\d{2}\|/.test(payload))
  ) {
    throw new Error('IPS_QR_SANITY_CHECK_FAILED');
  }

  return payload;
}
