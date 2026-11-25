import { describe, expect, it } from 'vitest';
import {
  buildReminderMessage,
  buildViberShareUrl,
  buildWhatsAppShareUrl,
  getReminderVariantCount,
  type ReminderTone,
} from './reminderTemplates';

describe('Anti-Blam Debt Reminder Templates', () => {
  const baseParams = {
    debtorName: 'Luka',
    amountFormatted: '1.850 RSD',
    groupName: 'Kopaonik 2026',
    shareUrl: 'https://podeli.vercel.app/g/abc123def456',
    bankAccountFormatted: '160-0000000123456-90',
  };

  it('provides at least 3 distinct variants for each tone', () => {
    const tones: ReminderTone[] = ['polite', 'friendly', 'urgent_joke'];
    for (const tone of tones) {
      const count = getReminderVariantCount(tone);
      expect(count).toBeGreaterThanOrEqual(3);
      const rendered = new Set(
        Array.from({ length: count }, (_, idx) =>
          buildReminderMessage({ ...baseParams, tone, variantIndex: idx, includeBankAccount: true })
        )
      );
      expect(rendered.size).toBe(count);
    }
  });

  it('cleanly includes or omits the bank account without leaving double spaces', () => {
    const withBank = buildReminderMessage({
      ...baseParams,
      tone: 'polite',
      variantIndex: 0,
      includeBankAccount: true,
    });
    expect(withBank).toContain('Račun: 160-0000000123456-90.');
    expect(withBank).toContain('Luka');
    expect(withBank).toContain('1.850 RSD');
    expect(withBank).toContain('Kopaonik 2026');
    expect(withBank).toContain('https://podeli.vercel.app/g/abc123def456');
    expect(withBank).not.toContain('  ');

    const withoutBank = buildReminderMessage({
      ...baseParams,
      tone: 'polite',
      variantIndex: 0,
      includeBankAccount: false,
    });
    expect(withoutBank).not.toContain('Račun:');
    expect(withoutBank).not.toContain('160-0000000123456-90');
    expect(withoutBank).not.toContain('  ');
  });

  it('builds properly URL-encoded WhatsApp and Viber deep links', () => {
    const msg = 'Hej Luka, 1.850 RSD za Kopaonik 😅 https://podeli.vercel.app/g/abc';
    expect(buildWhatsAppShareUrl(msg)).toBe(
      `https://wa.me/?text=${encodeURIComponent(msg)}`
    );
    expect(buildViberShareUrl(msg)).toBe(
      `viber://forward?text=${encodeURIComponent(msg)}`
    );
  });
});
