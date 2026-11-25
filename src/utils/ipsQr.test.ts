import { describe, expect, it } from 'vitest';
import {
  formatIpsAmount,
  formatSerbianAccount,
  generateIpsQrString,
  isValidSerbianAccount,
  normalizeSerbianAccount,
  parseAndValidateSerbianAccount,
} from './ipsQr';

// Helper to compute a valid MOD 97 control number for any 16-digit prefix in tests
function makeValidAccount(bank3: string, middle13: string): string {
  const first16 = `${bank3}${middle13.padStart(13, '0')}`;
  const ctrl = 98n - ((BigInt(first16) * 100n) % 97n);
  return `${first16}${ctrl.toString().padStart(2, '0')}`;
}

describe('NBS IPS QR Standard (Account Validation & Payload Generation)', () => {
  const validIntesa = makeValidAccount('160', '123456'); // e.g. 160-0000000123456-XX
  const validCtrl = validIntesa.slice(16, 18);

  it('normalizes dashed, shortened-middle, and raw 18-digit Serbian accounts', () => {
    expect(normalizeSerbianAccount(`160-123456-${validCtrl}`)).toBe(validIntesa);
    expect(normalizeSerbianAccount(`160-0000000123456-${validCtrl}`)).toBe(validIntesa);
    expect(normalizeSerbianAccount(validIntesa)).toBe(validIntesa);
    expect(normalizeSerbianAccount(` 160 - 123456 - ${validCtrl} `)).toBe(validIntesa);

    // Invalid formats
    expect(normalizeSerbianAccount('')).toBeNull();
    expect(normalizeSerbianAccount('16-123456-90')).toBeNull();
    expect(normalizeSerbianAccount('160-123456-9')).toBeNull();
    expect(normalizeSerbianAccount('16012345690')).toBeNull(); // not 18 digits without dashes
    expect(normalizeSerbianAccount('160-12345678901234-90')).toBeNull(); // >13 middle digits
  });

  it('validates MOD 97 control digits strictly', () => {
    expect(isValidSerbianAccount(validIntesa)).toBe(true);
    expect(isValidSerbianAccount(makeValidAccount('265', '5100102345678'))).toBe(true);

    // Flip last digit -> must fail MOD 97
    const wrongCtrl = String((Number(validCtrl) + 1) % 100).padStart(2, '0');
    const tampered = `${validIntesa.slice(0, 16)}${wrongCtrl}`;
    expect(isValidSerbianAccount(tampered)).toBe(false);

    // Bank code 000 rejected
    expect(isValidSerbianAccount(makeValidAccount('000', '12345'))).toBe(false);
    expect(parseAndValidateSerbianAccount(`160-123456-${validCtrl}`)).toEqual({
      valid: true,
      normalized: validIntesa,
    });
  });

  it('formats 18-digit accounts cleanly with dashes for UI display', () => {
    expect(formatSerbianAccount(validIntesa)).toBe(`160-0000000123456-${validCtrl}`);
  });

  it('formats RSD amounts with comma decimal, 2 digits, no spaces or thousands separators', () => {
    expect(formatIpsAmount(185000)).toBe('RSD1850,00');
    expect(formatIpsAmount(185050)).toBe('RSD1850,50');
    expect(formatIpsAmount(5)).toBe('RSD0,05');
    expect(formatIpsAmount(123456789)).toBe('RSD1234567,89');
    expect(() => formatIpsAmount(0)).toThrow();
    expect(() => formatIpsAmount(-100)).toThrow();
    expect(() => formatIpsAmount(Number.NaN)).toThrow();
  });

  it('generates a strictly compliant NBS IPS QR string and sanitizes pipe/newline characters', () => {
    const qr = generateIpsQrString({
      recipientAccount: `160-123456-${validCtrl}`,
      recipientName: 'Marko | Petrović\nBeograd',
      amountMinor: 185050,
      purpose: 'Podeli - Kopaonik | 2026',
    });

    expect(qr).toBe(
      `K:PR|V:01|C:1|R:${validIntesa}|N:Marko Petrović Beograd|I:RSD1850,50|SF:289|S:Podeli - Kopaonik 2026`
    );
    expect(qr.endsWith('|')).toBe(false);
    expect(qr.includes('||')).toBe(false);
  });

  it('truncates recipient name to 70 chars and purpose to 35 chars per NBS spec', () => {
    const qr = generateIpsQrString({
      recipientAccount: validIntesa,
      recipientName: 'A'.repeat(100),
      amountMinor: 10000,
      purpose: 'B'.repeat(60),
    });

    const parts = Object.fromEntries(qr.split('|').map((p) => [p.slice(0, p.indexOf(':')), p.slice(p.indexOf(':') + 1)]));
    expect(parts.N.length).toBe(70);
    expect(parts.S.length).toBe(35);
    expect(parts.SF).toBe('289');
    expect(parts.K).toBe('PR');
    expect(parts.V).toBe('01');
    expect(parts.C).toBe('1');
  });

  it('supports open-amount NBS IPS QR without I: tag when amountMinor is omitted', () => {
    const qr = generateIpsQrString({
      recipientAccount: validIntesa,
      recipientName: 'Marko Petrović',
      purpose: 'Podeli uplata',
    });
    expect(qr).toBe(`K:PR|V:01|C:1|R:${validIntesa}|N:Marko Petrović|SF:289|S:Podeli uplata`);
    expect(qr.includes('|I:')).toBe(false);
  });
});
