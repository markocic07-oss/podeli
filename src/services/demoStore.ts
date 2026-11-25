import type {
  Activity,
  AppNotification,
  CreateGroupInput,
  CreateSettlementInput,
  Expense,
  Group,
  GroupInvitation,
  GroupMember,
  GroupWithDetails,
  GuestSession,
  InvitationPreview,
  Profile,
  Settlement,
  SettlementStatus,
  SharedGroupResult,
  UpdateGroupInput,
  UpsertExpenseInput,
} from '../types';
import { calculateGroupBalances } from '../utils/finance';

const DEMO_STORAGE_KEY = 'podeli_demo_state_v1';

export interface DemoState {
  currentUserId: string;
  profiles: Record<string, Profile>;
  groups: Group[];
  members: { id: string; group_id: string; user_id: string; role: 'admin' | 'member'; joined_at: string; is_guest?: boolean; session_token?: string }[];
  invitations: GroupInvitation[];
  expenses: Expense[];
  settlements: Settlement[];
  activities: Activity[];
  notifications: AppNotification[];
}

function generateId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${rand}`;
}

function generateToken(): string {
  const chars = 'abcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 20; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function createInitialDemoState(): DemoState {
  const now = new Date();
  const daysAgo = (days: number, hoursOffset = 0) =>
    new Date(now.getTime() - days * 86400000 - hoursOffset * 3600000).toISOString();
  const dateDaysAgo = (days: number) =>
    new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);

  const marko: Profile = {
    id: 'demo-marko',
    first_name: 'Marko',
    last_name: 'Petrović',
    email: 'marko@podeli.demo',
    avatar_url: null,
    preferred_language: 'sr',
    preferred_currency: 'RSD',
    notification_preferences: { new_expense: true, settlement_updates: true, group_invites: true },
    onboarding_completed: true,
    created_at: daysAgo(45),
  };

  const ana: Profile = {
    id: 'demo-ana',
    first_name: 'Ana',
    last_name: 'Jovanović',
    email: 'ana@podeli.demo',
    avatar_url: null,
    preferred_language: 'sr',
    preferred_currency: 'RSD',
    notification_preferences: { new_expense: true, settlement_updates: true, group_invites: true },
    onboarding_completed: true,
    created_at: daysAgo(44),
  };

  const nikola: Profile = {
    id: 'demo-nikola',
    first_name: 'Nikola',
    last_name: 'Đorđević',
    email: 'nikola@podeli.demo',
    avatar_url: null,
    preferred_language: 'sr',
    preferred_currency: 'RSD',
    notification_preferences: { new_expense: true, settlement_updates: true, group_invites: true },
    onboarding_completed: true,
    created_at: daysAgo(43),
  };

  const jovan: Profile = {
    id: 'demo-jovan',
    first_name: 'Jovan',
    last_name: 'Ilić',
    email: 'jovan@podeli.demo',
    avatar_url: null,
    preferred_language: 'sr',
    preferred_currency: 'RSD',
    notification_preferences: { new_expense: true, settlement_updates: true, group_invites: true },
    onboarding_completed: true,
    created_at: daysAgo(42),
  };

  const amar: Profile = {
    id: 'demo-amar',
    first_name: 'Amar',
    last_name: 'Hadžić',
    email: 'amar@podeli.demo',
    avatar_url: null,
    preferred_language: 'bs',
    preferred_currency: 'BAM',
    notification_preferences: { new_expense: true, settlement_updates: true, group_invites: true },
    onboarding_completed: true,
    created_at: daysAgo(30),
  };

  const group1: Group = {
    id: 'grp-petak',
    name: 'Petak u gradu',
    description: 'Večera, piće i taksi sa ekipom u centru Beograda.',
    category: 'nights_out',
    image_url: null,
    currency: 'RSD',
    created_by: marko.id,
    created_at: daysAgo(14),
    share_token: 'petak-gradu-demo-2026',
    is_public_link_enabled: true,
    guest_payments_auto_confirm: false,
  };

  const group2: Group = {
    id: 'grp-grcka',
    name: 'Letovanje Grčka',
    description: 'Apartman, gorivo, putarine i zajedničke nabavke za Halkidiki.',
    category: 'travel',
    image_url: null,
    currency: 'EUR',
    created_by: marko.id,
    created_at: daysAgo(25),
    share_token: 'letovanje-grcka-demo-2026',
    is_public_link_enabled: true,
    guest_payments_auto_confirm: false,
  };

  const group3: Group = {
    id: 'grp-sarajevo',
    name: 'Vikend u Sarajevu',
    description: 'Ćevapi na Baščaršiji, kafa i smeštaj za produženi vikend.',
    category: 'travel',
    image_url: null,
    currency: 'BAM',
    created_by: amar.id,
    created_at: daysAgo(8),
    share_token: 'vikend-sarajevo-demo-2026',
    is_public_link_enabled: true,
    guest_payments_auto_confirm: false,
  };

  const expenses: Expense[] = [
    {
      id: 'exp-vecera',
      group_id: group1.id,
      title: 'Večera',
      description: 'Zajednička večera u restoranu Lorenzo & Kakalamba',
      amount_minor: 800000, // 8.000,00 RSD
      currency: 'RSD',
      paid_by: marko.id,
      category: 'food',
      split_method: 'equal',
      expense_date: dateDaysAgo(2),
      receipt_url: null,
      created_by: marko.id,
      created_at: daysAgo(2, 4),
      updated_at: daysAgo(2, 4),
      shares: [
        { id: 'sh-1', expense_id: 'exp-vecera', user_id: marko.id, share_amount_minor: 200000 },
        { id: 'sh-2', expense_id: 'exp-vecera', user_id: ana.id, share_amount_minor: 200000 },
        { id: 'sh-3', expense_id: 'exp-vecera', user_id: nikola.id, share_amount_minor: 200000 },
        { id: 'sh-4', expense_id: 'exp-vecera', user_id: jovan.id, share_amount_minor: 200000 },
      ],
    },
    {
      id: 'exp-pice',
      group_id: group1.id,
      title: 'Piće',
      description: 'Kokteli i kraft pivo u Cetinjskoj',
      amount_minor: 240000, // 2.400,00 RSD
      currency: 'RSD',
      paid_by: ana.id,
      category: 'drinks',
      split_method: 'equal',
      expense_date: dateDaysAgo(2),
      receipt_url: null,
      created_by: ana.id,
      created_at: daysAgo(2, 2),
      updated_at: daysAgo(2, 2),
      shares: [
        { id: 'sh-5', expense_id: 'exp-pice', user_id: marko.id, share_amount_minor: 60000 },
        { id: 'sh-6', expense_id: 'exp-pice', user_id: ana.id, share_amount_minor: 60000 },
        { id: 'sh-7', expense_id: 'exp-pice', user_id: nikola.id, share_amount_minor: 60000 },
        { id: 'sh-8', expense_id: 'exp-pice', user_id: jovan.id, share_amount_minor: 60000 },
      ],
    },
    {
      id: 'exp-taksi',
      group_id: group1.id,
      title: 'Taksi',
      description: 'Povratak kući (Jovan je otišao ranije peške)',
      amount_minor: 120000, // 1.200,00 RSD
      currency: 'RSD',
      paid_by: nikola.id,
      category: 'transport',
      split_method: 'equal',
      expense_date: dateDaysAgo(1),
      receipt_url: null,
      created_by: nikola.id,
      created_at: daysAgo(1, 20),
      updated_at: daysAgo(1, 20),
      shares: [
        { id: 'sh-9', expense_id: 'exp-taksi', user_id: marko.id, share_amount_minor: 40000 },
        { id: 'sh-10', expense_id: 'exp-taksi', user_id: ana.id, share_amount_minor: 40000 },
        { id: 'sh-11', expense_id: 'exp-taksi', user_id: nikola.id, share_amount_minor: 40000 },
      ],
    },
    {
      id: 'exp-apartman',
      group_id: group2.id,
      title: 'Apartman Sitonija',
      description: '5 noćenja blizu plaže',
      amount_minor: 45000, // 450,00 EUR
      currency: 'EUR',
      paid_by: marko.id,
      category: 'accommodation',
      split_method: 'equal',
      expense_date: dateDaysAgo(10),
      receipt_url: null,
      created_by: marko.id,
      created_at: daysAgo(10),
      updated_at: daysAgo(10),
      shares: [
        { id: 'sh-12', expense_id: 'exp-apartman', user_id: marko.id, share_amount_minor: 15000 },
        { id: 'sh-13', expense_id: 'exp-apartman', user_id: ana.id, share_amount_minor: 15000 },
        { id: 'sh-14', expense_id: 'exp-apartman', user_id: nikola.id, share_amount_minor: 15000 },
      ],
    },
    {
      id: 'exp-gorivo',
      group_id: group2.id,
      title: 'Gorivo i putarine',
      description: 'Beograd – Nikiti i nazad',
      amount_minor: 12000, // 120,00 EUR
      currency: 'EUR',
      paid_by: nikola.id,
      category: 'transport',
      split_method: 'equal',
      expense_date: dateDaysAgo(9),
      receipt_url: null,
      created_by: nikola.id,
      created_at: daysAgo(9),
      updated_at: daysAgo(9),
      shares: [
        { id: 'sh-15', expense_id: 'exp-gorivo', user_id: marko.id, share_amount_minor: 4000 },
        { id: 'sh-16', expense_id: 'exp-gorivo', user_id: ana.id, share_amount_minor: 4000 },
        { id: 'sh-17', expense_id: 'exp-gorivo', user_id: nikola.id, share_amount_minor: 4000 },
      ],
    },
    {
      id: 'exp-cevapi',
      group_id: group3.id,
      title: 'Ručak na Baščaršiji',
      description: 'Ćevapi, jogurt i baklava',
      amount_minor: 9600, // 96,00 BAM
      currency: 'BAM',
      paid_by: amar.id,
      category: 'food',
      split_method: 'equal',
      expense_date: dateDaysAgo(5),
      receipt_url: null,
      created_by: amar.id,
      created_at: daysAgo(5),
      updated_at: daysAgo(5),
      shares: [
        { id: 'sh-18', expense_id: 'exp-cevapi', user_id: amar.id, share_amount_minor: 4800 },
        { id: 'sh-19', expense_id: 'exp-cevapi', user_id: marko.id, share_amount_minor: 4800 },
      ],
    },
  ];

  const settlements: Settlement[] = [
    {
      id: 'set-1',
      group_id: group1.id,
      sender_id: jovan.id,
      receiver_id: marko.id,
      amount_minor: 100000, // 1.000,00 RSD pending confirmation
      payment_method: 'bank_transfer',
      note: 'Poslato na tekući račun, ostatak dajem u subotu.',
      status: 'pending',
      confirmed_at: null,
      created_at: daysAgo(0, 6),
    },
  ];

  const invitations: GroupInvitation[] = [
    {
      id: 'inv-petak',
      group_id: group1.id,
      token: 'podeli-demo-petak-2026',
      created_by: marko.id,
      expires_at: new Date(now.getTime() + 30 * 86400000).toISOString(),
      max_uses: null,
      uses_count: 3,
      revoked_at: null,
      created_at: daysAgo(14),
    },
    {
      id: 'inv-grcka',
      group_id: group2.id,
      token: 'podeli-demo-grcka-2026',
      created_by: marko.id,
      expires_at: new Date(now.getTime() + 30 * 86400000).toISOString(),
      max_uses: null,
      uses_count: 2,
      revoked_at: null,
      created_at: daysAgo(25),
    },
  ];

  const activities: Activity[] = [
    {
      id: 'act-1',
      group_id: group1.id,
      user_id: jovan.id,
      activity_type: 'settlement_created',
      description: group1.name,
      metadata: { amount_minor: 100000, currency: 'RSD' },
      related_entity_id: 'set-1',
      created_at: daysAgo(0, 6),
    },
    {
      id: 'act-2',
      group_id: group1.id,
      user_id: nikola.id,
      activity_type: 'expense_added',
      description: 'Taksi',
      metadata: { amount_minor: 120000, currency: 'RSD', group_name: group1.name },
      related_entity_id: 'exp-taksi',
      created_at: daysAgo(1, 20),
    },
    {
      id: 'act-3',
      group_id: group1.id,
      user_id: ana.id,
      activity_type: 'expense_added',
      description: 'Piće',
      metadata: { amount_minor: 240000, currency: 'RSD', group_name: group1.name },
      related_entity_id: 'exp-pice',
      created_at: daysAgo(2, 2),
    },
    {
      id: 'act-4',
      group_id: group1.id,
      user_id: marko.id,
      activity_type: 'expense_added',
      description: 'Večera',
      metadata: { amount_minor: 800000, currency: 'RSD', group_name: group1.name },
      related_entity_id: 'exp-vecera',
      created_at: daysAgo(2, 4),
    },
    {
      id: 'act-5',
      group_id: group3.id,
      user_id: amar.id,
      activity_type: 'expense_added',
      description: 'Ručak na Baščaršiji',
      metadata: { amount_minor: 9600, currency: 'BAM', group_name: group3.name },
      related_entity_id: 'exp-cevapi',
      created_at: daysAgo(5),
    },
  ];

  const notifications: AppNotification[] = [
    {
      id: 'not-1',
      user_id: marko.id,
      title: 'Petak u gradu',
      message: 'Jovan Ilić je zabeležio uplatu od 1.000,00 RSD koja čeka tvoju potvrdu.',
      related_group_id: group1.id,
      related_entity_id: 'set-1',
      is_read: false,
      created_at: daysAgo(0, 6),
    },
    {
      id: 'not-2',
      user_id: marko.id,
      title: 'Petak u gradu',
      message: 'Nikola Đorđević je dodao novi trošak: Taksi (1.200,00 RSD).',
      related_group_id: group1.id,
      related_entity_id: 'exp-taksi',
      is_read: false,
      created_at: daysAgo(1, 20),
    },
    {
      id: 'not-3',
      user_id: marko.id,
      title: 'Vikend u Sarajevu',
      message: 'Amar Hadžić je dodao novi trošak: Ručak na Baščaršiji (96,00 KM).',
      related_group_id: group3.id,
      related_entity_id: 'exp-cevapi',
      is_read: true,
      created_at: daysAgo(5),
    },
  ];

  return {
    currentUserId: marko.id,
    profiles: {
      [marko.id]: marko,
      [ana.id]: ana,
      [nikola.id]: nikola,
      [jovan.id]: jovan,
      [amar.id]: amar,
    },
    groups: [group1, group2, group3],
    members: [
      { id: 'gm-1', group_id: group1.id, user_id: marko.id, role: 'admin', joined_at: daysAgo(14) },
      { id: 'gm-2', group_id: group1.id, user_id: ana.id, role: 'member', joined_at: daysAgo(14) },
      { id: 'gm-3', group_id: group1.id, user_id: nikola.id, role: 'member', joined_at: daysAgo(13) },
      { id: 'gm-4', group_id: group1.id, user_id: jovan.id, role: 'member', joined_at: daysAgo(13) },
      { id: 'gm-5', group_id: group2.id, user_id: marko.id, role: 'admin', joined_at: daysAgo(25) },
      { id: 'gm-6', group_id: group2.id, user_id: ana.id, role: 'member', joined_at: daysAgo(24) },
      { id: 'gm-7', group_id: group2.id, user_id: nikola.id, role: 'member', joined_at: daysAgo(24) },
      { id: 'gm-8', group_id: group3.id, user_id: amar.id, role: 'admin', joined_at: daysAgo(8) },
      { id: 'gm-9', group_id: group3.id, user_id: marko.id, role: 'member', joined_at: daysAgo(8) },
    ],
    invitations,
    expenses,
    settlements,
    activities,
    notifications,
  };
}

/**
 * Isolated Demo Backend enforcing identical authorization, currency, rounding,
 * invitation, and settlement state-machine rules as the PostgreSQL RLS/RPC layer.
 */
export class DemoStore {
  private state: DemoState;
  private persistToStorage: boolean;

  constructor(initialState?: DemoState, persistToStorage = true) {
    this.persistToStorage = persistToStorage;
    if (initialState) {
      this.state = structuredClone(initialState);
    } else if (persistToStorage && typeof window !== 'undefined') {
      const saved = window.sessionStorage.getItem(DEMO_STORAGE_KEY);
      if (saved) {
        try {
          this.state = JSON.parse(saved) as DemoState;
        } catch {
          this.state = createInitialDemoState();
        }
      } else {
        this.state = createInitialDemoState();
      }
    } else {
      this.state = createInitialDemoState();
    }
  }

  private save() {
    if (this.persistToStorage && typeof window !== 'undefined') {
      window.sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(this.state));
    }
  }

  reset() {
    this.state = createInitialDemoState();
    this.save();
  }

  getState(): DemoState {
    return this.state;
  }

  getCurrentProfile(): Profile {
    return this.state.profiles[this.state.currentUserId];
  }

  registerTestUser(profile: Profile) {
    this.state.profiles[profile.id] = profile;
    this.save();
  }

  setActingUser(userId: string) {
    if (!this.state.profiles[userId]) {
      throw new Error('USER_NOT_FOUND');
    }
    this.state.currentUserId = userId;
    this.save();
  }

  private isMember(groupId: string, userId: string): boolean {
    return this.state.members.some((m) => m.group_id === groupId && m.user_id === userId);
  }

  private isAdmin(groupId: string, userId: string): boolean {
    return this.state.members.some(
      (m) => m.group_id === groupId && m.user_id === userId && m.role === 'admin'
    );
  }

  private assertMember(groupId: string, userId: string) {
    if (!this.isMember(groupId, userId)) {
      throw new Error('UNAUTHORIZED');
    }
  }

  private assertAdmin(groupId: string, userId: string) {
    if (!this.isAdmin(groupId, userId)) {
      throw new Error('UNAUTHORIZED');
    }
  }

  updateProfile(userId: string, patch: Partial<Profile>): Profile {
    if (userId !== this.state.currentUserId) {
      throw new Error('UNAUTHORIZED');
    }
    const existing = this.state.profiles[userId];
    if (!existing) throw new Error('USER_NOT_FOUND');
    const updated: Profile = {
      ...existing,
      ...patch,
      id: existing.id,
      email: existing.email,
    };
    this.state.profiles[userId] = updated;
    this.save();
    return updated;
  }

  getGroupsForUser(userId: string): GroupWithDetails[] {
    const memberGroupIds = new Set(
      this.state.members.filter((m) => m.user_id === userId).map((m) => m.group_id)
    );
    return this.state.groups
      .filter((g) => memberGroupIds.has(g.id))
      .map((group) => this.buildGroupDetails(group));
  }

  getGroupById(groupId: string, userId: string): GroupWithDetails {
    this.assertMember(groupId, userId);
    const group = this.state.groups.find((g) => g.id === groupId);
    if (!group) throw new Error('GROUP_NOT_FOUND');
    return this.buildGroupDetails(group);
  }

  private buildGroupDetails(group: Group): GroupWithDetails {
    const members: GroupMember[] = this.state.members
      .filter((m) => m.group_id === group.id)
      .map((m) => ({
        ...m,
        profile: this.state.profiles[m.user_id],
      }))
      .filter((m) => Boolean(m.profile));

    const expenses = this.state.expenses
      .filter((e) => e.group_id === group.id)
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || b.created_at.localeCompare(a.created_at));

    const settlements = this.state.settlements
      .filter((s) => s.group_id === group.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    const invitations = this.state.invitations
      .filter((i) => i.group_id === group.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    return { group, members, expenses, settlements, invitations };
  }

  createGroup(userId: string, input: CreateGroupInput): Group {
    if (!input.name.trim()) throw new Error('GROUP_NAME_REQUIRED');
    const now = new Date().toISOString();
    const group: Group = {
      id: generateId('grp'),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      category: input.category,
      image_url: input.image_url ?? null,
      currency: input.currency,
      created_by: userId,
      created_at: now,
      share_token: generateToken(),
      is_public_link_enabled: true,
      guest_payments_auto_confirm: false,
    };
    this.state.groups.unshift(group);
    this.state.members.push({
      id: generateId('gm'),
      group_id: group.id,
      user_id: userId,
      role: 'admin',
      joined_at: now,
    });
    this.state.invitations.push({
      id: generateId('inv'),
      group_id: group.id,
      token: generateToken(),
      created_by: userId,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      max_uses: null,
      uses_count: 0,
      revoked_at: null,
      created_at: now,
    });
    this.state.activities.unshift({
      id: generateId('act'),
      group_id: group.id,
      user_id: userId,
      activity_type: 'group_created',
      description: group.name,
      metadata: { group_name: group.name },
      related_entity_id: group.id,
      created_at: now,
    });
    this.save();
    return group;
  }

  updateGroup(userId: string, groupId: string, input: UpdateGroupInput): Group {
    this.assertAdmin(groupId, userId);
    const group = this.state.groups.find((g) => g.id === groupId);
    if (!group) throw new Error('GROUP_NOT_FOUND');
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new Error('GROUP_NAME_REQUIRED');
      group.name = input.name.trim();
    }
    if (input.description !== undefined) group.description = input.description?.trim() || null;
    if (input.category !== undefined) group.category = input.category;
    if (input.image_url !== undefined) group.image_url = input.image_url;
    if (input.is_public_link_enabled !== undefined) {
      group.is_public_link_enabled = input.is_public_link_enabled;
    }
    if (input.guest_payments_auto_confirm !== undefined) {
      group.guest_payments_auto_confirm = input.guest_payments_auto_confirm;
    }
    this.save();
    return group;
  }

  regenerateShareToken(userId: string, groupId: string): string {
    this.assertAdmin(groupId, userId);
    const group = this.state.groups.find((g) => g.id === groupId);
    if (!group) throw new Error('GROUP_NOT_FOUND');
    group.share_token = generateToken();
    this.save();
    return group.share_token;
  }

  getSharedGroup(shareToken: string): SharedGroupResult {
    const group = this.state.groups.find((g) => g.share_token === shareToken.trim());
    if (!group) return { found: false, reason: 'not_found' };
    if (!group.is_public_link_enabled) return { found: false, reason: 'disabled' };
    const details = this.buildGroupDetails(group);
    return {
      found: true,
      group: details.group,
      members: details.members.map((m) => ({
        ...m,
        profile: { ...m.profile, email: '' },
      })),
      expenses: details.expenses,
      settlements: details.settlements,
    };
  }

  joinSharedGroupAsGuest(
    shareToken: string,
    opts: { displayName?: string; existingGuestId?: string }
  ): GuestSession {
    const group = this.state.groups.find(
      (g) => g.share_token === shareToken.trim() && g.is_public_link_enabled
    );
    if (!group) throw new Error('INVALID_OR_DISABLED_SHARE_LINK');

    const sessionToken = generateToken();
    const now = new Date().toISOString();

    if (opts.existingGuestId) {
      const existing = this.state.members.find(
        (m) => m.group_id === group.id && m.user_id === opts.existingGuestId
      );
      if (!existing) throw new Error('GUEST_MEMBER_NOT_FOUND');
      existing.session_token = sessionToken;
      const prof = this.state.profiles[existing.user_id];
      this.save();
      return {
        groupId: group.id,
        guestMemberId: existing.user_id,
        guestSessionToken: sessionToken,
        displayName: prof ? `${prof.first_name} ${prof.last_name}`.trim() : 'Gost',
        shareToken: group.share_token,
        updatedAt: now,
      };
    }

    const name = opts.displayName?.trim();
    if (!name) throw new Error('DISPLAY_NAME_REQUIRED');

    const guestId = generateId('guest');
    this.state.profiles[guestId] = {
      id: guestId,
      first_name: name,
      last_name: '',
      email: '',
      avatar_url: null,
      preferred_language: 'sr',
      preferred_currency: group.currency,
      notification_preferences: { new_expense: true, settlement_updates: true, group_invites: true },
      onboarding_completed: true,
      created_at: now,
      is_guest: true,
    };
    this.state.members.push({
      id: generateId('gm'),
      group_id: group.id,
      user_id: guestId,
      role: 'member',
      joined_at: now,
      is_guest: true,
      session_token: sessionToken,
    });
    this.save();
    return {
      groupId: group.id,
      guestMemberId: guestId,
      guestSessionToken: sessionToken,
      displayName: name,
      shareToken: group.share_token,
      updatedAt: now,
    };
  }

  private assertValidGuest(shareToken: string, guestMemberId: string, guestSessionToken: string): Group {
    const group = this.state.groups.find(
      (g) => g.share_token === shareToken.trim() && g.is_public_link_enabled
    );
    if (!group) throw new Error('INVALID_OR_DISABLED_SHARE_LINK');
    const member = this.state.members.find(
      (m) =>
        m.group_id === group.id &&
        m.user_id === guestMemberId &&
        m.session_token === guestSessionToken
    );
    if (!member) throw new Error('UNAUTHORIZED_GUEST');
    return group;
  }

  guestCreateExpense(
    shareToken: string,
    guestMemberId: string,
    guestSessionToken: string,
    input: UpsertExpenseInput
  ): Expense {
    const group = this.assertValidGuest(shareToken, guestMemberId, guestSessionToken);
    if (input.group_id !== group.id) throw new Error('UNAUTHORIZED_GUEST');
    return this.createExpense(guestMemberId, input);
  }

  guestCreateSettlement(
    shareToken: string,
    guestMemberId: string,
    guestSessionToken: string,
    input: Omit<CreateSettlementInput, 'sender_id'>
  ): Settlement {
    const group = this.assertValidGuest(shareToken, guestMemberId, guestSessionToken);
    if (input.group_id !== group.id) throw new Error('UNAUTHORIZED_GUEST');
    const created = this.createSettlement(guestMemberId, {
      ...input,
      sender_id: guestMemberId,
    });
    if (group.guest_payments_auto_confirm) {
      created.status = 'confirmed';
      created.confirmed_at = new Date().toISOString();
    } else {
      created.status = 'pending';
      created.confirmed_at = null;
    }
    this.save();
    return created;
  }

  guestTransitionSettlement(
    shareToken: string,
    guestMemberId: string,
    guestSessionToken: string,
    settlementId: string,
    status: Extract<SettlementStatus, 'confirmed' | 'rejected' | 'cancelled'>
  ): Settlement {
    this.assertValidGuest(shareToken, guestMemberId, guestSessionToken);
    return this.transitionSettlement(guestMemberId, settlementId, status);
  }

  joinSharedGroupAsUser(userId: string, shareToken: string): string {
    const group = this.state.groups.find(
      (g) => g.share_token === shareToken.trim() && g.is_public_link_enabled
    );
    if (!group) throw new Error('INVALID_OR_DISABLED_SHARE_LINK');
    if (!this.isMember(group.id, userId)) {
      this.state.members.push({
        id: generateId('gm'),
        group_id: group.id,
        user_id: userId,
        role: 'member',
        joined_at: new Date().toISOString(),
      });
      this.save();
    }
    return group.id;
  }

  claimGuestIdentity(
    userId: string,
    groupId: string,
    guestMemberId: string,
    guestSessionToken: string
  ): boolean {
    const guestRow = this.state.members.find(
      (m) =>
        m.group_id === groupId &&
        m.user_id === guestMemberId &&
        m.session_token === guestSessionToken
    );
    if (!guestRow) return false;
    if (guestMemberId === userId) return true;

    // Ensure real user is a member without duplicating
    if (!this.isMember(groupId, userId)) {
      this.state.members.push({
        id: generateId('gm'),
        group_id: groupId,
        user_id: userId,
        role: 'member',
        joined_at: guestRow.joined_at,
      });
    }

    // Reassign expenses & shares from guestMemberId to userId
    for (const exp of this.state.expenses) {
      if (exp.group_id !== groupId) continue;
      if (exp.paid_by === guestMemberId) exp.paid_by = userId;
      if (exp.created_by === guestMemberId) exp.created_by = userId;
      const existingUserShare = exp.shares.find((s) => s.user_id === userId);
      const guestShare = exp.shares.find((s) => s.user_id === guestMemberId);
      if (guestShare) {
        if (existingUserShare) {
          existingUserShare.share_amount_minor += guestShare.share_amount_minor;
          exp.shares = exp.shares.filter((s) => s.user_id !== guestMemberId);
        } else {
          guestShare.user_id = userId;
        }
      }
    }

    // Reassign settlements
    for (const s of this.state.settlements) {
      if (s.group_id !== groupId) continue;
      if (s.sender_id === guestMemberId) s.sender_id = userId;
      if (s.receiver_id === guestMemberId) s.receiver_id = userId;
    }

    // Remove the old guest member record so there's zero duplication
    this.state.members = this.state.members.filter(
      (m) => !(m.group_id === groupId && m.user_id === guestMemberId)
    );
    this.save();
    return true;
  }

  deleteGroup(userId: string, groupId: string) {
    this.assertAdmin(groupId, userId);
    this.state.groups = this.state.groups.filter((g) => g.id !== groupId);
    this.state.members = this.state.members.filter((m) => m.group_id !== groupId);
    this.state.expenses = this.state.expenses.filter((e) => e.group_id !== groupId);
    this.state.settlements = this.state.settlements.filter((s) => s.group_id !== groupId);
    this.state.invitations = this.state.invitations.filter((i) => i.group_id !== groupId);
    this.state.activities = this.state.activities.filter((a) => a.group_id !== groupId);
    this.state.notifications = this.state.notifications.filter((n) => n.related_group_id !== groupId);
    this.save();
  }

  removeMember(actorId: string, groupId: string, targetUserId: string) {
    if (actorId !== targetUserId) {
      this.assertAdmin(groupId, actorId);
    } else {
      this.assertMember(groupId, actorId);
    }

    const details = this.getGroupById(groupId, actorId);
    const summary = calculateGroupBalances(
      details.members.map((m) => m.user_id),
      details.expenses,
      details.settlements
    );
    const targetBalance = summary.balancesByUser[targetUserId]?.netBalanceMinor ?? 0;
    if (targetBalance !== 0) {
      throw new Error('CANNOT_REMOVE_NON_ZERO_BALANCE');
    }

    const admins = details.members.filter((m) => m.role === 'admin');
    if (admins.length === 1 && admins[0].user_id === targetUserId && details.members.length > 1) {
      throw new Error('CANNOT_REMOVE_LAST_ADMIN');
    }

    this.state.members = this.state.members.filter(
      (m) => !(m.group_id === groupId && m.user_id === targetUserId)
    );
    this.state.activities.unshift({
      id: generateId('act'),
      group_id: groupId,
      user_id: actorId,
      activity_type: 'member_removed',
      description: details.group.name,
      metadata: { target_user_id: targetUserId },
      related_entity_id: targetUserId,
      created_at: new Date().toISOString(),
    });
    this.save();
  }

  createExpense(userId: string, input: UpsertExpenseInput): Expense {
    this.assertMember(input.group_id, userId);
    const group = this.state.groups.find((g) => g.id === input.group_id);
    if (!group) throw new Error('GROUP_NOT_FOUND');

    if (input.currency !== group.currency) {
      throw new Error('CURRENCY_MISMATCH');
    }
    if (!Number.isInteger(input.amount_minor) || input.amount_minor <= 0) {
      throw new Error('INVALID_AMOUNT');
    }
    if (!this.isMember(input.group_id, input.paid_by)) {
      throw new Error('INVALID_PAYER');
    }
    if (!input.shares.length) {
      throw new Error('NO_PARTICIPANTS');
    }

    let sum = 0;
    for (const s of input.shares) {
      if (!this.isMember(input.group_id, s.userId)) {
        throw new Error('INVALID_PARTICIPANT');
      }
      if (!Number.isInteger(s.shareAmountMinor) || s.shareAmountMinor < 0) {
        throw new Error('INVALID_SHARE');
      }
      sum += s.shareAmountMinor;
    }
    if (sum !== input.amount_minor) {
      throw new Error('SHARES_SUM_MISMATCH');
    }

    const now = new Date().toISOString();
    const expenseId = generateId('exp');
    const expense: Expense = {
      id: expenseId,
      group_id: input.group_id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      amount_minor: input.amount_minor,
      currency: group.currency,
      paid_by: input.paid_by,
      category: input.category,
      split_method: input.split_method,
      expense_date: input.expense_date,
      receipt_url: input.receipt_url ?? null,
      created_by: userId,
      created_at: now,
      updated_at: now,
      shares: input.shares.map((s) => ({
        id: generateId('sh'),
        expense_id: expenseId,
        user_id: s.userId,
        share_amount_minor: s.shareAmountMinor,
      })),
    };

    this.state.expenses.unshift(expense);
    this.state.activities.unshift({
      id: generateId('act'),
      group_id: group.id,
      user_id: userId,
      activity_type: 'expense_added',
      description: expense.title,
      metadata: {
        expense_title: expense.title,
        amount_minor: expense.amount_minor,
        currency: expense.currency,
        group_name: group.name,
      },
      related_entity_id: expense.id,
      created_at: now,
    });

    const actor = this.state.profiles[userId];
    const actorName = actor ? `${actor.first_name} ${actor.last_name}`.trim() : 'Član';
    for (const share of expense.shares) {
      if (share.user_id !== userId) {
        this.state.notifications.unshift({
          id: generateId('not'),
          user_id: share.user_id,
          title: group.name,
          message: `${actorName} je dodao/la novi trošak: ${expense.title}`,
          related_group_id: group.id,
          related_entity_id: expense.id,
          is_read: false,
          created_at: now,
        });
      }
    }

    this.save();
    return expense;
  }

  updateExpense(userId: string, expenseId: string, input: UpsertExpenseInput): Expense {
    const existing = this.state.expenses.find((e) => e.id === expenseId);
    if (!existing) throw new Error('EXPENSE_NOT_FOUND');

    if (existing.created_by !== userId && !this.isAdmin(existing.group_id, userId)) {
      throw new Error('UNAUTHORIZED');
    }

    const group = this.state.groups.find((g) => g.id === existing.group_id);
    if (!group) throw new Error('GROUP_NOT_FOUND');
    if (input.currency !== group.currency) throw new Error('CURRENCY_MISMATCH');
    if (!Number.isInteger(input.amount_minor) || input.amount_minor <= 0) throw new Error('INVALID_AMOUNT');
    if (!this.isMember(existing.group_id, input.paid_by)) throw new Error('INVALID_PAYER');

    let sum = 0;
    for (const s of input.shares) {
      if (!this.isMember(existing.group_id, s.userId)) throw new Error('INVALID_PARTICIPANT');
      if (!Number.isInteger(s.shareAmountMinor) || s.shareAmountMinor < 0) throw new Error('INVALID_SHARE');
      sum += s.shareAmountMinor;
    }
    if (sum !== input.amount_minor) throw new Error('SHARES_SUM_MISMATCH');

    const now = new Date().toISOString();
    existing.title = input.title.trim();
    existing.description = input.description?.trim() || null;
    existing.amount_minor = input.amount_minor;
    existing.paid_by = input.paid_by;
    existing.category = input.category;
    existing.split_method = input.split_method;
    existing.expense_date = input.expense_date;
    existing.receipt_url = input.receipt_url ?? null;
    existing.updated_at = now;
    existing.shares = input.shares.map((s) => ({
      id: generateId('sh'),
      expense_id: existing.id,
      user_id: s.userId,
      share_amount_minor: s.shareAmountMinor,
    }));

    this.state.activities.unshift({
      id: generateId('act'),
      group_id: group.id,
      user_id: userId,
      activity_type: 'expense_updated',
      description: existing.title,
      metadata: { amount_minor: existing.amount_minor, currency: existing.currency, group_name: group.name },
      related_entity_id: existing.id,
      created_at: now,
    });

    this.save();
    return existing;
  }

  deleteExpense(userId: string, expenseId: string) {
    const existing = this.state.expenses.find((e) => e.id === expenseId);
    if (!existing) throw new Error('EXPENSE_NOT_FOUND');
    if (existing.created_by !== userId && !this.isAdmin(existing.group_id, userId)) {
      throw new Error('UNAUTHORIZED');
    }
    this.state.expenses = this.state.expenses.filter((e) => e.id !== expenseId);
    this.state.activities.unshift({
      id: generateId('act'),
      group_id: existing.group_id,
      user_id: userId,
      activity_type: 'expense_deleted',
      description: existing.title,
      metadata: { amount_minor: existing.amount_minor, currency: existing.currency },
      related_entity_id: existing.id,
      created_at: new Date().toISOString(),
    });
    this.save();
  }

  createSettlement(userId: string, input: CreateSettlementInput): Settlement {
    this.assertMember(input.group_id, userId);
    this.assertMember(input.group_id, input.sender_id);
    this.assertMember(input.group_id, input.receiver_id);
    if (input.sender_id === input.receiver_id) throw new Error('CANNOT_SETTLE_SELF');
    if (!Number.isInteger(input.amount_minor) || input.amount_minor <= 0) throw new Error('INVALID_AMOUNT');

    const group = this.state.groups.find((g) => g.id === input.group_id)!;
    const now = new Date().toISOString();
    const isReceiverRecording = userId === input.receiver_id;
    const settlement: Settlement = {
      id: generateId('set'),
      group_id: input.group_id,
      sender_id: input.sender_id,
      receiver_id: input.receiver_id,
      amount_minor: input.amount_minor,
      payment_method: input.payment_method,
      note: input.note?.trim() || null,
      status: isReceiverRecording ? 'confirmed' : 'pending',
      confirmed_at: isReceiverRecording ? now : null,
      created_at: now,
    };
    this.state.settlements.unshift(settlement);
    this.state.activities.unshift({
      id: generateId('act'),
      group_id: group.id,
      user_id: userId,
      activity_type: isReceiverRecording ? 'settlement_confirmed' : 'settlement_created',
      description: group.name,
      metadata: { amount_minor: settlement.amount_minor, currency: group.currency },
      related_entity_id: settlement.id,
      created_at: now,
    });
    const sender = this.state.profiles[input.sender_id];
    const notifyUserId = isReceiverRecording ? input.sender_id : input.receiver_id;
    this.state.notifications.unshift({
      id: generateId('not'),
      user_id: notifyUserId,
      title: group.name,
      message: isReceiverRecording
        ? `${sender?.first_name ?? ''} ${sender?.last_name ?? ''} — uplata je potvrđena.`
        : `${sender?.first_name ?? ''} ${sender?.last_name ?? ''} je zabeležio/la uplatu i čeka tvoju potvrdu.`,
      related_group_id: group.id,
      related_entity_id: settlement.id,
      is_read: false,
      created_at: now,
    });
    this.save();
    return settlement;
  }

  transitionSettlement(
    userId: string,
    settlementId: string,
    newStatus: Extract<SettlementStatus, 'confirmed' | 'rejected' | 'cancelled'>
  ): Settlement {
    const settlement = this.state.settlements.find((s) => s.id === settlementId);
    if (!settlement) throw new Error('SETTLEMENT_NOT_FOUND');

    // Prevent duplicate confirmation or mutation after terminal state
    if (settlement.status !== 'pending') {
      throw new Error('SETTLEMENT_ALREADY_PROCESSED');
    }

    if (newStatus === 'confirmed' || newStatus === 'rejected') {
      if (settlement.receiver_id !== userId) throw new Error('UNAUTHORIZED');
    } else if (newStatus === 'cancelled') {
      if (settlement.sender_id !== userId) throw new Error('UNAUTHORIZED');
    }

    const now = new Date().toISOString();
    settlement.status = newStatus;
    settlement.confirmed_at = newStatus === 'confirmed' ? now : null;

    const group = this.state.groups.find((g) => g.id === settlement.group_id)!;
    this.state.activities.unshift({
      id: generateId('act'),
      group_id: settlement.group_id,
      user_id: userId,
      activity_type:
        newStatus === 'confirmed'
          ? 'settlement_confirmed'
          : newStatus === 'rejected'
          ? 'settlement_rejected'
          : 'settlement_cancelled',
      description: group.name,
      metadata: { amount_minor: settlement.amount_minor, currency: group.currency },
      related_entity_id: settlement.id,
      created_at: now,
    });

    if (newStatus === 'confirmed' || newStatus === 'rejected') {
      const actor = this.state.profiles[userId];
      this.state.notifications.unshift({
        id: generateId('not'),
        user_id: settlement.sender_id,
        title: group.name,
        message:
          newStatus === 'confirmed'
            ? `${actor.first_name} ${actor.last_name} je potvrdio/la prijem uplate.`
            : `${actor.first_name} ${actor.last_name} je odbio/la zabeleženu uplatu.`,
        related_group_id: group.id,
        related_entity_id: settlement.id,
        is_read: false,
        created_at: now,
      });
    }

    this.save();
    return settlement;
  }

  undoConfirmedSettlement(userId: string, settlementId: string): void {
    const settlement = this.state.settlements.find((s) => s.id === settlementId);
    if (!settlement) throw new Error('SETTLEMENT_NOT_FOUND');
    if (settlement.status !== 'confirmed') {
      throw new Error('SETTLEMENT_NOT_CONFIRMED');
    }

    const isAdmin = this.state.members.some(
      (m) => m.group_id === settlement.group_id && m.user_id === userId && m.role === 'admin'
    );
    if (settlement.sender_id !== userId && settlement.receiver_id !== userId && !isAdmin) {
      throw new Error('UNAUTHORIZED');
    }

    settlement.status = 'cancelled';
    settlement.confirmed_at = null;

    const group = this.state.groups.find((g) => g.id === settlement.group_id);
    if (group) {
      this.state.activities.unshift({
        id: generateId('act'),
        group_id: settlement.group_id,
        user_id: userId,
        activity_type: 'settlement_cancelled',
        description: group.name,
        metadata: { amount_minor: settlement.amount_minor, currency: group.currency, undone: 1 },
        related_entity_id: settlement.id,
        created_at: new Date().toISOString(),
      });
    }
    this.save();
  }

  createInvitation(userId: string, groupId: string, expiresInDays = 30, maxUses: number | null = null): GroupInvitation {
    this.assertAdmin(groupId, userId);
    const now = new Date().toISOString();
    const inv: GroupInvitation = {
      id: generateId('inv'),
      group_id: groupId,
      token: generateToken(),
      created_by: userId,
      expires_at: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null,
      max_uses: maxUses,
      uses_count: 0,
      revoked_at: null,
      created_at: now,
    };
    this.state.invitations.unshift(inv);
    this.save();
    return inv;
  }

  revokeInvitation(userId: string, invitationId: string) {
    const inv = this.state.invitations.find((i) => i.id === invitationId);
    if (!inv) throw new Error('INVITATION_NOT_FOUND');
    this.assertAdmin(inv.group_id, userId);
    inv.revoked_at = new Date().toISOString();
    this.save();
  }

  getInvitationPreview(token: string, viewerUserId?: string): InvitationPreview {
    const inv = this.state.invitations.find((i) => i.token === token);
    if (!inv) return { valid: false, reason: 'not_found' };
    if (inv.revoked_at) return { valid: false, reason: 'revoked' };
    if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
      return { valid: false, reason: 'expired' };
    }
    if (inv.max_uses !== null && inv.uses_count >= inv.max_uses) {
      return { valid: false, reason: 'max_uses_reached' };
    }

    const group = this.state.groups.find((g) => g.id === inv.group_id);
    if (!group) return { valid: false, reason: 'not_found' };
    const memberCount = this.state.members.filter((m) => m.group_id === group.id).length;

    return {
      valid: true,
      group_id: group.id,
      group_name: group.name,
      group_description: group.description,
      group_category: group.category,
      group_currency: group.currency,
      group_image_url: group.image_url,
      member_count: memberCount,
      already_member: viewerUserId ? this.isMember(group.id, viewerUserId) : false,
    };
  }

  acceptInvitation(userId: string, token: string): string {
    const preview = this.getInvitationPreview(token, userId);
    if (!preview.valid || !preview.group_id) {
      throw new Error(`INVITATION_INVALID_${preview.reason ?? 'unknown'}`);
    }
    const inv = this.state.invitations.find((i) => i.token === token)!;
    if (this.isMember(inv.group_id, userId)) {
      return inv.group_id;
    }

    const now = new Date().toISOString();
    this.state.members.push({
      id: generateId('gm'),
      group_id: inv.group_id,
      user_id: userId,
      role: 'member',
      joined_at: now,
    });
    inv.uses_count += 1;

    this.state.activities.unshift({
      id: generateId('act'),
      group_id: inv.group_id,
      user_id: userId,
      activity_type: 'invitation_accepted',
      description: preview.group_name ?? '',
      metadata: { group_name: preview.group_name ?? '' },
      related_entity_id: inv.id,
      created_at: now,
    });
    this.save();
    return inv.group_id;
  }

  getActivitiesForUser(userId: string): Activity[] {
    const memberGroupIds = new Set(
      this.state.members.filter((m) => m.user_id === userId).map((m) => m.group_id)
    );
    return this.state.activities
      .filter((a) => memberGroupIds.has(a.group_id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  getNotificationsForUser(userId: string): AppNotification[] {
    return this.state.notifications
      .filter((n) => n.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  markNotificationRead(userId: string, notificationId: string) {
    const n = this.state.notifications.find((item) => item.id === notificationId && item.user_id === userId);
    if (n) {
      n.is_read = true;
      this.save();
    }
  }

  markAllNotificationsRead(userId: string) {
    for (const n of this.state.notifications) {
      if (n.user_id === userId) n.is_read = true;
    }
    this.save();
  }

  updateGuestBankAccount(
    _shareToken: string,
    guestMemberId: string,
    _guestSessionToken: string,
    bankAccount: string | null,
    bankRecipientName: string | null
  ) {
    const profile = this.state.profiles[guestMemberId];
    if (profile) {
      profile.bank_account = bankAccount;
      profile.bank_recipient_name = bankRecipientName;
      this.save();
    }
  }
}

export const demoStore = new DemoStore();
