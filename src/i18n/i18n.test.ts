import { describe, expect, it } from 'vitest';
import { sr } from './locales/sr';
import { hr } from './locales/hr';
import { bs } from './locales/bs';

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

function getValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

describe('PODELI Multilingual Localization (SR / HR / BS)', () => {
  it('maintains 100% translation key parity across Serbian, Croatian, and Bosnian', () => {
    const srKeys = flattenKeys(sr);
    const hrKeys = flattenKeys(hr);
    const bsKeys = flattenKeys(bs);

    expect(hrKeys).toEqual(srKeys);
    expect(bsKeys).toEqual(srKeys);

    for (const key of srKeys) {
      expect(typeof getValue(sr, key)).toBe('string');
      expect((getValue(sr, key) as string).trim().length).toBeGreaterThan(0);
      expect((getValue(hr, key) as string).trim().length).toBeGreaterThan(0);
      expect((getValue(bs, key) as string).trim().length).toBeGreaterThan(0);
    }
  });

  it('uses authentic regional terminology for SR, HR, and BS', () => {
    expect(sr.nav.settings).toBe('Podešavanja');
    expect(sr.activity.title).toBe('Istorija aktivnosti');
    expect(sr.settlements.title).toBe('Poravnanje dugovanja');
    expect(sr.common.save).toBe('Sačuvaj promene');

    expect(hr.nav.settings).toBe('Postavke');
    expect(hr.activity.title).toBe('Povijest aktivnosti');
    expect(hr.settlements.title).toBe('Podmirenje dugovanja');
    expect(hr.common.save).toBe('Spremi promjene');

    expect(bs.nav.settings).toBe('Postavke');
    expect(bs.activity.title).toBe('Historija aktivnosti');
    expect(bs.settlements.title).toBe('Poravnanje dugovanja');
    expect(bs.common.save).toBe('Sačuvaj promjene');
  });
});
