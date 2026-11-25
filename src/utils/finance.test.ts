import { describe, expect, it } from 'vitest';
import {
  calculateDashboardBalances,
  calculateEqualSplit,
  calculateGroupBalances,
  calculatePercentageSplit,
  formatCurrency,
  optimizeSettlements,
  parseMajorToMinor,
  parsePercentToBasisPoints,
  validateCustomSplit,
} from './finance';
import type { Expense, GroupWithDetails, Profile, Settlement } from '../types';

function makeExpense(partial: Partial<Expense> & Pick<Expense, 'id' | 'amount_minor' | 'paid_by' | 'shares'>): Expense {
  return {
    group_id: 'g1',
    title: 'Test',
    description: null,
    currency: 'RSD',
    category: 'food',
    split_method: 'equal',
    expense_date: '2026-11-20',
    receipt_url: null,
    created_by: partial.paid_by,
    created_at: '2026-11-20T10:00:00Z',
    updated_at: '2026-11-20T10:00:00Z',
    ...partial,
  };
}

describe('PODELI Financial Engine', () => {
  describe('Monetary parsing & regional formatting', () => {
    it('parses regional and standard amount formats without floating point drift', () => {
      expect(parseMajorToMinor('8.000')).toBe(800000);
      expect(parseMajorToMinor('2.500,00')).toBe(250000);
      expect(parseMajorToMinor('2.500,50')).toBe(250050);
      expect(parseMajorToMinor('19.99')).toBe(1999);
      expect(parseMajorToMinor('19,99')).toBe(1999);
      expect(parseMajorToMinor('0,01')).toBe(1);
      expect(parseMajorToMinor('1.234.567,89')).toBe(123456789);
      expect(parseMajorToMinor('-50')).toBeNull();
      expect(parseMajorToMinor('12,345')).toBeNull();
      expect(parseMajorToMinor('abc')).toBeNull();
    });

    it('formats RSD, EUR, and BAM with proper regional currency suffixes', () => {
      const rsd = formatCurrency(250000, 'RSD', 'sr');
      const eur = formatCurrency(25000, 'EUR', 'hr');
      const bam = formatCurrency(50000, 'BAM', 'bs');
      expect(rsd).toContain('RSD');
      expect(rsd).toContain('2.500,00');
      expect(eur).toContain('€');
      expect(eur).toContain('250,00');
      expect(bam).toContain('KM');
      expect(bam).toContain('500,00');
    });
  });

  describe('Equal expense splitting & rounding', () => {
    it('splits an evenly divisible amount accurately (8.000 RSD / 4 = 2.000 RSD)', () => {
      const shares = calculateEqualSplit(800000, ['marko', 'ana', 'nikola', 'jovan']);
      expect(shares).toHaveLength(4);
      expect(shares.every((s) => s.shareAmountMinor === 200000)).toBe(true);
      expect(shares.reduce((a, b) => a + b.shareAmountMinor, 0)).toBe(800000);
    });

    it('handles fractional amounts without creating or destroying a single minor unit (10.000 RSD / 3)', () => {
      const shares = calculateEqualSplit(1000000, ['marko', 'ana', 'nikola']);
      const sum = shares.reduce((acc, s) => acc + s.shareAmountMinor, 0);
      expect(sum).toBe(1000000);
      expect(shares.map((s) => s.shareAmountMinor)).toEqual([333334, 333333, 333333]);
    });

    it('handles 1 minor unit split across 3 people cleanly', () => {
      const shares = calculateEqualSplit(1, ['u1', 'u2', 'u3']);
      expect(shares.reduce((acc, s) => acc + s.shareAmountMinor, 0)).toBe(1);
      expect(shares.map((s) => s.shareAmountMinor)).toEqual([1, 0, 0]);
    });
  });

  describe('Custom expense splitting', () => {
    it('accepts custom shares matching exact total and rejects mismatches', () => {
      const ok = validateCustomSplit(800000, [
        { userId: 'marko', shareAmountMinor: 300000 },
        { userId: 'ana', shareAmountMinor: 250000 },
        { userId: 'nikola', shareAmountMinor: 250000 },
      ]);
      expect(ok.valid).toBe(true);
      expect(ok.diffMinor).toBe(0);

      const under = validateCustomSplit(800000, [
        { userId: 'marko', shareAmountMinor: 300000 },
        { userId: 'ana', shareAmountMinor: 200000 },
      ]);
      expect(under.valid).toBe(false);
      expect(under.diffMinor).toBe(300000);

      const over = validateCustomSplit(800000, [
        { userId: 'marko', shareAmountMinor: 500000 },
        { userId: 'ana', shareAmountMinor: 400000 },
      ]);
      expect(over.valid).toBe(false);
      expect(over.diffMinor).toBe(-100000);
    });
  });

  describe('Percentage expense splitting', () => {
    it('splits by exact basis-point percentages using Largest Remainder Method', () => {
      expect(parsePercentToBasisPoints('33,33')).toBe(3333);
      const res = calculatePercentageSplit(100000, [
        { userId: 'u1', basisPoints: 3333 },
        { userId: 'u2', basisPoints: 3333 },
        { userId: 'u3', basisPoints: 3334 },
      ]);
      expect(res.valid).toBe(true);
      const sum = res.shares.reduce((acc, s) => acc + s.shareAmountMinor, 0);
      expect(sum).toBe(100000);
      expect(res.shares).toEqual([
        { userId: 'u1', shareAmountMinor: 33330 },
        { userId: 'u2', shareAmountMinor: 33330 },
        { userId: 'u3', shareAmountMinor: 33340 },
      ]);
    });

    it('allocates odd remainders accurately when percentage produces fractional minor units', () => {
      const res = calculatePercentageSplit(101, [
        { userId: 'u1', basisPoints: 5000 },
        { userId: 'u2', basisPoints: 5000 },
      ]);
      expect(res.valid).toBe(true);
      expect(res.shares.reduce((a, b) => a + b.shareAmountMinor, 0)).toBe(101);
      expect(res.shares.map((s) => s.shareAmountMinor)).toEqual([51, 50]);
    });

    it('rejects percentage totals not equal to 100%', () => {
      const res = calculatePercentageSplit(100000, [
        { userId: 'u1', basisPoints: 6000 },
        { userId: 'u2', basisPoints: 3000 },
      ]);
      expect(res.valid).toBe(false);
    });
  });

  describe('Balance calculations, payer exclusion, unequal participation & settlement optimization', () => {
    it('handles payer excluded from expense', () => {
      const exp = makeExpense({
        id: 'e1',
        amount_minor: 600000,
        paid_by: 'marko',
        shares: [
          { id: 's1', expense_id: 'e1', user_id: 'ana', share_amount_minor: 300000 },
          { id: 's2', expense_id: 'e1', user_id: 'nikola', share_amount_minor: 300000 },
        ],
      });
      const summary = calculateGroupBalances(['marko', 'ana', 'nikola'], [exp], []);
      expect(summary.balancesByUser.marko.netBalanceMinor).toBe(600000);
      expect(summary.balancesByUser.ana.netBalanceMinor).toBe(-300000);
      expect(summary.balancesByUser.nikola.netBalanceMinor).toBe(-300000);
      const zeroSum = summary.memberBalances.reduce((a, b) => a + b.netBalanceMinor, 0);
      expect(zeroSum).toBe(0);
    });

    it('handles multiple expenses, multiple payers, fractional shares, and verifies zero-sum invariant', () => {
      // Section 11 exact scenario: Marko paid 8.000, Ana paid 2.000, Nikola paid 0; all 3 equal
      const s1 = calculateEqualSplit(800000, ['marko', 'ana', 'nikola']);
      const s2 = calculateEqualSplit(200000, ['marko', 'ana', 'nikola']);

      const expenses: Expense[] = [
        makeExpense({
          id: 'e1',
          amount_minor: 800000,
          paid_by: 'marko',
          shares: s1.map((s, i) => ({
            id: `1-${i}`,
            expense_id: 'e1',
            user_id: s.userId,
            share_amount_minor: s.shareAmountMinor,
          })),
        }),
        makeExpense({
          id: 'e2',
          amount_minor: 200000,
          paid_by: 'ana',
          shares: s2.map((s, i) => ({
            id: `2-${i}`,
            expense_id: 'e2',
            user_id: s.userId,
            share_amount_minor: s.shareAmountMinor,
          })),
        }),
      ];

      const summary = calculateGroupBalances(['marko', 'ana', 'nikola'], expenses, []);
      expect(summary.totalExpensesMinor).toBe(1000000);

      // Zero-sum invariant MUST hold strictly
      const zeroSum = summary.memberBalances.reduce((a, b) => a + b.netBalanceMinor, 0);
      expect(zeroSum).toBe(0);

      // Applying optimized settlements must zero every single member's balance
      const afterTransfers = new Map(
        summary.memberBalances.map((b) => [b.userId, b.netBalanceMinor])
      );
      for (const tr of summary.suggestedTransfers) {
        afterTransfers.set(tr.fromUserId, (afterTransfers.get(tr.fromUserId) ?? 0) + tr.amountMinor);
        afterTransfers.set(tr.toUserId, (afterTransfers.get(tr.toUserId) ?? 0) - tr.amountMinor);
      }
      for (const bal of afterTransfers.values()) {
        expect(bal).toBe(0);
      }
      expect(summary.suggestedTransfers.length).toBeLessThanOrEqual(2);
    });

    it('handles unequal participant subsets and ignores unconfirmed settlements', () => {
      const e1 = makeExpense({
        id: 'e1',
        amount_minor: 800000,
        paid_by: 'marko',
        shares: [
          { id: '1', expense_id: 'e1', user_id: 'marko', share_amount_minor: 200000 },
          { id: '2', expense_id: 'e1', user_id: 'ana', share_amount_minor: 200000 },
          { id: '3', expense_id: 'e1', user_id: 'nikola', share_amount_minor: 200000 },
          { id: '4', expense_id: 'e1', user_id: 'jovan', share_amount_minor: 200000 },
        ],
      });
      // Only Marko & Ana share e2 (Nikola & Jovan excluded)
      const e2 = makeExpense({
        id: 'e2',
        amount_minor: 100000,
        paid_by: 'ana',
        shares: [
          { id: '5', expense_id: 'e2', user_id: 'marko', share_amount_minor: 50000 },
          { id: '6', expense_id: 'e2', user_id: 'ana', share_amount_minor: 50000 },
        ],
      });

      const settlements: Settlement[] = [
        {
          id: 'st-pending',
          group_id: 'g1',
          sender_id: 'jovan',
          receiver_id: 'marko',
          amount_minor: 200000,
          payment_method: 'cash',
          note: null,
          status: 'pending',
          confirmed_at: null,
          created_at: '2026-11-21T10:00:00Z',
        },
        {
          id: 'st-confirmed',
          group_id: 'g1',
          sender_id: 'nikola',
          receiver_id: 'marko',
          amount_minor: 200000,
          payment_method: 'bank_transfer',
          note: null,
          status: 'confirmed',
          confirmed_at: '2026-11-21T11:00:00Z',
          created_at: '2026-11-21T10:30:00Z',
        },
      ];

      const summary = calculateGroupBalances(
        ['marko', 'ana', 'nikola', 'jovan'],
        [e1, e2],
        settlements
      );

      // Nikola paid 2.000 confirmed -> balance 0
      expect(summary.balancesByUser.nikola.netBalanceMinor).toBe(0);
      // Jovan's settlement is pending -> still owes 2.000
      expect(summary.balancesByUser.jovan.netBalanceMinor).toBe(-200000);
      // Ana owed 2.000 from e1, lent 500 in e2 -> net -1.500
      expect(summary.balancesByUser.ana.netBalanceMinor).toBe(-150000);
      // Marko net: +6.000 - 500 - 2.000 (received from Nikola) = +3.500
      expect(summary.balancesByUser.marko.netBalanceMinor).toBe(350000);

      // Optimized transfers should be Ana -> Marko 1.500 and Jovan -> Marko 2.000
      const optimized = optimizeSettlements(summary.memberBalances);
      expect(optimized).toEqual([
        { fromUserId: 'jovan', toUserId: 'marko', amountMinor: 200000 },
        { fromUserId: 'ana', toUserId: 'marko', amountMinor: 150000 },
      ]);
    });

    it('segregates RSD, EUR, and BAM strictly on dashboard without mixing currencies', () => {
      const dummyProfile = (id: string): Profile => ({
        id,
        first_name: id,
        last_name: '',
        email: `${id}@test.rs`,
        avatar_url: null,
        preferred_language: 'sr',
        preferred_currency: 'RSD',
        notification_preferences: { new_expense: true, settlement_updates: true, group_invites: true },
        onboarding_completed: true,
        created_at: '2026-01-01T00:00:00Z',
      });

      const makeGroup = (id: string, currency: 'RSD' | 'EUR' | 'BAM', paidBy: string, amount: number): GroupWithDetails => ({
        group: {
          id,
          name: id,
          description: null,
          category: 'other',
          image_url: null,
          currency,
          created_by: 'u1',
          created_at: '2026-01-01T00:00:00Z',
          share_token: `token-${id}-1234567890`,
          is_public_link_enabled: true,
          guest_payments_auto_confirm: false,
        },
        members: [
          { id: `${id}-m1`, group_id: id, user_id: 'u1', role: 'admin', joined_at: '', profile: dummyProfile('u1') },
          { id: `${id}-m2`, group_id: id, user_id: 'u2', role: 'member', joined_at: '', profile: dummyProfile('u2') },
        ],
        expenses: [
          makeExpense({
            id: `${id}-e1`,
            group_id: id,
            currency,
            amount_minor: amount,
            paid_by: paidBy,
            shares: [
              { id: 'a', expense_id: `${id}-e1`, user_id: 'u1', share_amount_minor: amount / 2 },
              { id: 'b', expense_id: `${id}-e1`, user_id: 'u2', share_amount_minor: amount / 2 },
            ],
          }),
        ],
        settlements: [],
        invitations: [],
      });

      const dashboard = calculateDashboardBalances('u1', [
        makeGroup('g-rsd', 'RSD', 'u1', 400000), // u1 is owed +2.000 RSD
        makeGroup('g-eur', 'EUR', 'u2', 10000), // u1 owes -50 EUR
        makeGroup('g-bam', 'BAM', 'u1', 20000), // u1 is owed +100 BAM
      ]);

      expect(dashboard.RSD.owedToYouMinor).toBe(200000);
      expect(dashboard.RSD.youOweMinor).toBe(0);
      expect(dashboard.EUR.owedToYouMinor).toBe(0);
      expect(dashboard.EUR.youOweMinor).toBe(5000);
      expect(dashboard.BAM.owedToYouMinor).toBe(10000);
    });
  });
});
