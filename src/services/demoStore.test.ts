import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialDemoState, DemoStore } from './demoStore';
import { calculateGroupBalances, calculateEqualSplit } from '../utils/finance';
import type { Profile } from '../types';

describe('PODELI Service Layer, Security & Workflows', () => {
  let store: DemoStore;

  beforeEach(() => {
    store = new DemoStore(createInitialDemoState(), false);
  });

  it('computes accurate balances on the Petak u gradu demo dataset', () => {
    const details = store.getGroupById('grp-petak', 'demo-marko');
    const summary = calculateGroupBalances(
      details.members.map((m) => m.user_id),
      details.expenses,
      details.settlements
    );

    // Večera 8000 (Marko, 4 ppl = 2000 each)
    // Piće 2400 (Ana, 4 ppl = 600 each)
    // Taksi 1200 (Nikola, 3 ppl Marko/Ana/Nikola = 400 each; Jovan excluded)
    // Pending settlement Jovan->Marko 1000 is NOT confirmed yet
    expect(summary.totalExpensesMinor).toBe(1160000);
    expect(summary.balancesByUser['demo-marko'].netBalanceMinor).toBe(500000); // paid 8000, owed 3000
    expect(summary.balancesByUser['demo-ana'].netBalanceMinor).toBe(-60000); // paid 2400, owed 3000
    expect(summary.balancesByUser['demo-nikola'].netBalanceMinor).toBe(-180000); // paid 1200, owed 3000
    expect(summary.balancesByUser['demo-jovan'].netBalanceMinor).toBe(-260000); // paid 0, owed 2600
    expect(summary.memberBalances.reduce((a, b) => a + b.netBalanceMinor, 0)).toBe(0);
  });

  it('confirms a settlement accurately and prevents duplicate confirmation', () => {
    store.transitionSettlement('demo-marko', 'set-1', 'confirmed');

    const details = store.getGroupById('grp-petak', 'demo-marko');
    const summary = calculateGroupBalances(
      details.members.map((m) => m.user_id),
      details.expenses,
      details.settlements
    );
    // Jovan's 1.000 RSD payment to Marko is now confirmed
    expect(summary.balancesByUser['demo-marko'].netBalanceMinor).toBe(400000);
    expect(summary.balancesByUser['demo-jovan'].netBalanceMinor).toBe(-160000);
    expect(summary.memberBalances.reduce((a, b) => a + b.netBalanceMinor, 0)).toBe(0);

    // Attempting to confirm the same settlement a second time MUST fail
    expect(() => store.transitionSettlement('demo-marko', 'set-1', 'confirmed')).toThrow(
      'SETTLEMENT_ALREADY_PROCESSED'
    );
  });

  it('allows sender to cancel pending settlement without changing balances', () => {
    const before = store.getGroupById('grp-petak', 'demo-marko');
    const balBefore = calculateGroupBalances(
      before.members.map((m) => m.user_id),
      before.expenses,
      before.settlements
    );

    const cancelled = store.transitionSettlement('demo-jovan', 'set-1', 'cancelled');
    expect(cancelled.status).toBe('cancelled');

    const after = store.getGroupById('grp-petak', 'demo-marko');
    const balAfter = calculateGroupBalances(
      after.members.map((m) => m.user_id),
      after.expenses,
      after.settlements
    );
    expect(balAfter.balancesByUser['demo-marko'].netBalanceMinor).toBe(
      balBefore.balancesByUser['demo-marko'].netBalanceMinor
    );
  });

  it('recalculates balances accurately after editing and deleting an expense', () => {
    // Edit Večera from 8.000 RSD to 4.000 RSD
    store.updateExpense('demo-marko', 'exp-vecera', {
      group_id: 'grp-petak',
      title: 'Večera (korigovano)',
      amount_minor: 400000,
      currency: 'RSD',
      paid_by: 'demo-marko',
      category: 'food',
      split_method: 'equal',
      expense_date: '2026-11-20',
      shares: calculateEqualSplit(400000, ['demo-marko', 'demo-ana', 'demo-nikola', 'demo-jovan']),
    });

    let details = store.getGroupById('grp-petak', 'demo-marko');
    let summary = calculateGroupBalances(
      details.members.map((m) => m.user_id),
      details.expenses,
      details.settlements
    );
    expect(summary.totalExpensesMinor).toBe(760000);
    expect(summary.balancesByUser['demo-marko'].netBalanceMinor).toBe(200000); // paid 4000, owed 2000

    // Delete the expense completely
    store.deleteExpense('demo-marko', 'exp-vecera');
    details = store.getGroupById('grp-petak', 'demo-marko');
    summary = calculateGroupBalances(
      details.members.map((m) => m.user_id),
      details.expenses,
      details.settlements
    );
    expect(summary.totalExpensesMinor).toBe(360000);
    expect(summary.balancesByUser['demo-marko'].netBalanceMinor).toBe(-100000); // owed 600 + 400
    expect(summary.memberBalances.reduce((a, b) => a + b.netBalanceMinor, 0)).toBe(0);
  });

  it('enforces strict currency consistency within a group', () => {
    expect(() =>
      store.createExpense('demo-marko', {
        group_id: 'grp-petak', // RSD group
        title: 'Pogrešna valuta',
        amount_minor: 5000,
        currency: 'EUR', // Mismatch!
        paid_by: 'demo-marko',
        category: 'other',
        split_method: 'equal',
        expense_date: '2026-11-20',
        shares: calculateEqualSplit(5000, ['demo-marko', 'demo-ana']),
      })
    ).toThrow('CURRENCY_MISMATCH');
  });

  it('handles invitation preview, acceptance, revocation, and max uses', () => {
    const outsider: Profile = {
      id: 'user-milica',
      first_name: 'Milica',
      last_name: 'Kovačević',
      email: 'milica@primer.rs',
      avatar_url: null,
      preferred_language: 'sr',
      preferred_currency: 'RSD',
      notification_preferences: { new_expense: true, settlement_updates: true, group_invites: true },
      onboarding_completed: true,
      created_at: new Date().toISOString(),
    };
    store.registerTestUser(outsider);

    // Before joining, outsider CANNOT access private group data
    expect(() => store.getGroupById('grp-petak', outsider.id)).toThrow('UNAUTHORIZED');

    // Create a single-use invitation as admin
    const inv = store.createInvitation('demo-marko', 'grp-petak', 7, 1);
    const preview = store.getInvitationPreview(inv.token, outsider.id);
    expect(preview.valid).toBe(true);
    expect(preview.group_name).toBe('Petak u gradu');
    expect(preview.already_member).toBe(false);

    // Accept invitation
    const joinedGroupId = store.acceptInvitation(outsider.id, inv.token);
    expect(joinedGroupId).toBe('grp-petak');

    // Now Milica can read the group
    const groupDetails = store.getGroupById('grp-petak', outsider.id);
    expect(groupDetails.members.some((m) => m.user_id === outsider.id)).toBe(true);

    // Token reached max_uses=1 so another user cannot use it
    const anotherPreview = store.getInvitationPreview(inv.token, 'demo-amar');
    expect(anotherPreview.valid).toBe(false);
    expect(anotherPreview.reason).toBe('max_uses_reached');

    // Revoking an invitation immediately invalidates it
    const inv2 = store.createInvitation('demo-marko', 'grp-petak', 30, null);
    store.revokeInvitation('demo-marko', inv2.id);
    expect(store.getInvitationPreview(inv2.token).valid).toBe(false);
    expect(store.getInvitationPreview(inv2.token).reason).toBe('revoked');
  });

  it('blocks unauthorized actions across expenses, settlements, members, and profiles', () => {
    // Amar is NOT a member of grp-petak
    expect(() => store.getGroupById('grp-petak', 'demo-amar')).toThrow('UNAUTHORIZED');
    expect(() =>
      store.createExpense('demo-amar', {
        group_id: 'grp-petak',
        title: 'Neovlašćeni trošak',
        amount_minor: 10000,
        currency: 'RSD',
        paid_by: 'demo-amar',
        category: 'other',
        split_method: 'equal',
        expense_date: '2026-11-20',
        shares: [{ userId: 'demo-amar', shareAmountMinor: 10000 }],
      })
    ).toThrow('UNAUTHORIZED');

    // Non-admin member Ana cannot delete Marko's expense
    expect(() => store.deleteExpense('demo-ana', 'exp-vecera')).toThrow('UNAUTHORIZED');

    // Sender (Jovan) cannot self-confirm his own settlement to Marko
    expect(() => store.transitionSettlement('demo-jovan', 'set-1', 'confirmed')).toThrow(
      'UNAUTHORIZED'
    );

    // Receiver (Marko) cannot cancel Jovan's settlement (only reject/confirm)
    expect(() => store.transitionSettlement('demo-marko', 'set-1', 'cancelled')).toThrow(
      'UNAUTHORIZED'
    );

    // Non-admin cannot create invitation or delete group
    expect(() => store.createInvitation('demo-ana', 'grp-petak')).toThrow('UNAUTHORIZED');
    expect(() => store.deleteGroup('demo-ana', 'grp-petak')).toThrow('UNAUTHORIZED');

    // Admin cannot remove member with non-zero balance
    expect(() => store.removeMember('demo-marko', 'grp-petak', 'demo-jovan')).toThrow(
      'CANNOT_REMOVE_NON_ZERO_BALANCE'
    );

    // User cannot edit another user's profile
    expect(() => store.updateProfile('demo-ana', { first_name: 'Hacked' })).toThrow('UNAUTHORIZED');
  });

  it('supports zero-friction guest access, expense/payment recording, token reset, and soft account upgrade', () => {
    const shareToken = 'petak-gradu-demo-2026';

    // 1. Guest opens /g/:share_token without login
    const shared = store.getSharedGroup(shareToken);
    expect(shared.found).toBe(true);
    expect(shared.group?.name).toBe('Petak u gradu');
    // Emails are stripped for privacy on public shared view
    expect(shared.members?.every((m) => m.profile.email === '')).toBe(true);

    // 2. Guest adds their name ("Luka")
    const session = store.joinSharedGroupAsGuest(shareToken, { displayName: 'Luka' });
    expect(session.displayName).toBe('Luka');
    expect(session.guestSessionToken.length).toBeGreaterThanOrEqual(12);

    // 3. Guest adds an expense split between Luka and Marko (2.000 RSD -> 1.000 each)
    store.guestCreateExpense(shareToken, session.guestMemberId, session.guestSessionToken, {
      group_id: 'grp-petak',
      title: 'Kafa',
      amount_minor: 200000,
      currency: 'RSD',
      paid_by: session.guestMemberId,
      category: 'drinks',
      split_method: 'equal',
      expense_date: '2026-11-23',
      shares: calculateEqualSplit(200000, [session.guestMemberId, 'demo-marko']),
    });

    // Unauthorized guest with wrong session token MUST fail
    expect(() =>
      store.guestCreateExpense(shareToken, session.guestMemberId, 'wrong-token', {
        group_id: 'grp-petak',
        title: 'Fake',
        amount_minor: 10000,
        currency: 'RSD',
        paid_by: session.guestMemberId,
        category: 'other',
        split_method: 'equal',
        expense_date: '2026-11-23',
        shares: [{ userId: session.guestMemberId, shareAmountMinor: 10000 }],
      })
    ).toThrow('UNAUTHORIZED_GUEST');

    // 4. Guest marks payment with auto-confirm OFF (pending) then ON (confirmed)
    const pendingPay = store.guestCreateSettlement(
      shareToken,
      session.guestMemberId,
      session.guestSessionToken,
      {
        group_id: 'grp-petak',
        receiver_id: 'demo-marko',
        amount_minor: 50000,
        payment_method: 'cash',
      }
    );
    expect(pendingPay.status).toBe('pending');

    store.updateGroup('demo-marko', 'grp-petak', { guest_payments_auto_confirm: true });
    const autoConfirmedPay = store.guestCreateSettlement(
      shareToken,
      session.guestMemberId,
      session.guestSessionToken,
      {
        group_id: 'grp-petak',
        receiver_id: 'demo-marko',
        amount_minor: 50000,
        payment_method: 'bank_transfer',
      }
    );
    expect(autoConfirmedPay.status).toBe('confirmed');

    // 5. Admin resets share token -> old token immediately stops working
    const newToken = store.regenerateShareToken('demo-marko', 'grp-petak');
    expect(newToken).not.toBe(shareToken);
    expect(store.getSharedGroup(shareToken).found).toBe(false);
    expect(store.getSharedGroup(newToken).found).toBe(true);

    // Admin disables public link -> returns disabled
    store.updateGroup('demo-marko', 'grp-petak', { is_public_link_enabled: false });
    expect(store.getSharedGroup(newToken)).toEqual({ found: false, reason: 'disabled' });

    // 6. Soft Account Upgrade: Luka registers a real account and claims his guest identity
    const realLuka: Profile = {
      id: 'user-luka-real',
      first_name: 'Luka',
      last_name: 'Simić',
      email: 'luka@primer.rs',
      avatar_url: null,
      preferred_language: 'sr',
      preferred_currency: 'RSD',
      notification_preferences: { new_expense: true, settlement_updates: true, group_invites: true },
      onboarding_completed: true,
      created_at: new Date().toISOString(),
    };
    store.registerTestUser(realLuka);

    const claimed = store.claimGuestIdentity(
      realLuka.id,
      'grp-petak',
      session.guestMemberId,
      session.guestSessionToken
    );
    expect(claimed).toBe(true);

    // Luka is now a real member, guest row removed (no duplicate), and his Kafa expense belongs to him
    const afterClaim = store.getGroupById('grp-petak', realLuka.id);
    expect(afterClaim.members.some((m) => m.user_id === realLuka.id)).toBe(true);
    expect(afterClaim.members.some((m) => m.user_id === session.guestMemberId)).toBe(false);
    const kafa = afterClaim.expenses.find((e) => e.title === 'Kafa');
    expect(kafa?.paid_by).toBe(realLuka.id);
    expect(kafa?.shares.some((s) => s.user_id === realLuka.id)).toBe(true);
  });
});
