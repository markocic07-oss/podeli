import { supabase } from '../lib/supabase';
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
import { demoStore } from './demoStore';

export interface PodeliBackend {
  fetchAllUserGroups(userId: string): Promise<GroupWithDetails[]>;
  fetchActivities(userId: string): Promise<Activity[]>;
  fetchNotifications(userId: string): Promise<AppNotification[]>;
  updateProfile(userId: string, patch: Partial<Profile>): Promise<Profile>;
  createGroup(userId: string, input: CreateGroupInput): Promise<Group>;
  updateGroup(userId: string, groupId: string, input: UpdateGroupInput): Promise<Group>;
  deleteGroup(userId: string, groupId: string): Promise<void>;
  removeMember(actorId: string, groupId: string, targetUserId: string): Promise<void>;
  createExpense(userId: string, input: UpsertExpenseInput): Promise<string>;
  updateExpense(userId: string, expenseId: string, input: UpsertExpenseInput): Promise<void>;
  deleteExpense(userId: string, expenseId: string): Promise<void>;
  createSettlement(userId: string, input: CreateSettlementInput): Promise<Settlement>;
  transitionSettlement(
    userId: string,
    settlementId: string,
    status: Extract<SettlementStatus, 'confirmed' | 'rejected' | 'cancelled'>
  ): Promise<Settlement>;
  undoConfirmedSettlement(userId: string, settlementId: string): Promise<void>;
  createInvitation(userId: string, groupId: string): Promise<GroupInvitation>;
  revokeInvitation(userId: string, invitationId: string): Promise<void>;
  getInvitationPreview(token: string, viewerUserId?: string): Promise<InvitationPreview>;
  acceptInvitation(userId: string, token: string): Promise<string>;
  markNotificationRead(userId: string, notificationId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  uploadImage(bucket: 'avatars' | 'group-images' | 'receipts', pathPrefix: string, file: File): Promise<string>;
  // Zero-friction shareable group link & guest methods
  regenerateShareToken(userId: string, groupId: string): Promise<string>;
  getSharedGroup(shareToken: string): Promise<SharedGroupResult>;
  joinSharedGroupAsGuest(
    shareToken: string,
    opts: { displayName?: string; existingGuestId?: string }
  ): Promise<GuestSession>;
  guestCreateExpense(
    shareToken: string,
    guestMemberId: string,
    guestSessionToken: string,
    input: UpsertExpenseInput
  ): Promise<string>;
  guestCreateSettlement(
    shareToken: string,
    guestMemberId: string,
    guestSessionToken: string,
    input: Omit<CreateSettlementInput, 'sender_id'>
  ): Promise<Settlement>;
  guestTransitionSettlement(
    shareToken: string,
    guestMemberId: string,
    guestSessionToken: string,
    settlementId: string,
    status: Extract<SettlementStatus, 'confirmed' | 'rejected' | 'cancelled'>
  ): Promise<void>;
  joinSharedGroupAsUser(userId: string, shareToken: string): Promise<string>;
  claimGuestIdentity(
    userId: string,
    groupId: string,
    guestMemberId: string,
    guestSessionToken: string
  ): Promise<boolean>;
  updateGuestBankAccount(
    shareToken: string,
    guestMemberId: string,
    guestSessionToken: string,
    bankAccount: string | null,
    bankRecipientName: string | null
  ): Promise<void>;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('FILE_READ_ERROR'));
    reader.readAsDataURL(file);
  });
}

export const demoBackend: PodeliBackend = {
  async fetchAllUserGroups(userId) {
    return demoStore.getGroupsForUser(userId);
  },
  async fetchActivities(userId) {
    return demoStore.getActivitiesForUser(userId);
  },
  async fetchNotifications(userId) {
    return demoStore.getNotificationsForUser(userId);
  },
  async updateProfile(userId, patch) {
    return demoStore.updateProfile(userId, patch);
  },
  async createGroup(userId, input) {
    return demoStore.createGroup(userId, input);
  },
  async updateGroup(userId, groupId, input) {
    return demoStore.updateGroup(userId, groupId, input);
  },
  async deleteGroup(userId, groupId) {
    demoStore.deleteGroup(userId, groupId);
  },
  async removeMember(actorId, groupId, targetUserId) {
    demoStore.removeMember(actorId, groupId, targetUserId);
  },
  async createExpense(userId, input) {
    return demoStore.createExpense(userId, input).id;
  },
  async updateExpense(userId, expenseId, input) {
    demoStore.updateExpense(userId, expenseId, input);
  },
  async deleteExpense(userId, expenseId) {
    demoStore.deleteExpense(userId, expenseId);
  },
  async createSettlement(userId, input) {
    return demoStore.createSettlement(userId, input);
  },
  async transitionSettlement(userId, settlementId, status) {
    return demoStore.transitionSettlement(userId, settlementId, status);
  },
  async undoConfirmedSettlement(userId, settlementId) {
    demoStore.undoConfirmedSettlement(userId, settlementId);
  },
  async createInvitation(userId, groupId) {
    return demoStore.createInvitation(userId, groupId);
  },
  async revokeInvitation(userId, invitationId) {
    demoStore.revokeInvitation(userId, invitationId);
  },
  async getInvitationPreview(token, viewerUserId) {
    return demoStore.getInvitationPreview(token, viewerUserId);
  },
  async acceptInvitation(userId, token) {
    return demoStore.acceptInvitation(userId, token);
  },
  async markNotificationRead(userId, notificationId) {
    demoStore.markNotificationRead(userId, notificationId);
  },
  async markAllNotificationsRead(userId) {
    demoStore.markAllNotificationsRead(userId);
  },
  async uploadImage(_bucket, _pathPrefix, file) {
    return fileToDataUrl(file);
  },
  async regenerateShareToken(userId, groupId) {
    return demoStore.regenerateShareToken(userId, groupId);
  },
  async getSharedGroup(shareToken) {
    return demoStore.getSharedGroup(shareToken);
  },
  async joinSharedGroupAsGuest(shareToken, opts) {
    return demoStore.joinSharedGroupAsGuest(shareToken, opts);
  },
  async guestCreateExpense(shareToken, guestMemberId, guestSessionToken, input) {
    return demoStore.guestCreateExpense(shareToken, guestMemberId, guestSessionToken, input).id;
  },
  async guestCreateSettlement(shareToken, guestMemberId, guestSessionToken, input) {
    return demoStore.guestCreateSettlement(shareToken, guestMemberId, guestSessionToken, input);
  },
  async guestTransitionSettlement(shareToken, guestMemberId, guestSessionToken, settlementId, status) {
    demoStore.guestTransitionSettlement(shareToken, guestMemberId, guestSessionToken, settlementId, status);
  },
  async joinSharedGroupAsUser(userId, shareToken) {
    return demoStore.joinSharedGroupAsUser(userId, shareToken);
  },
  async claimGuestIdentity(userId, groupId, guestMemberId, guestSessionToken) {
    return demoStore.claimGuestIdentity(userId, groupId, guestMemberId, guestSessionToken);
  },
  async updateGuestBankAccount(shareToken, guestMemberId, guestSessionToken, bankAccount, bankRecipientName) {
    demoStore.updateGuestBankAccount(shareToken, guestMemberId, guestSessionToken, bankAccount, bankRecipientName);
  },
};

function requireSupabase() {
  if (!supabase) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }
  return supabase;
}

interface RawGuestRow {
  id: string;
  group_id: string;
  display_name: string;
  claimed_by_user_id: string | null;
  bank_account?: string | null;
  bank_recipient_name?: string | null;
  created_at: string;
}

interface RawGuestShareRow {
  id: string;
  expense_id: string;
  guest_id: string;
  share_amount_minor: number;
}

interface RawGuestSettlementRow {
  id: string;
  group_id: string;
  sender_user_id: string | null;
  sender_guest_id: string | null;
  receiver_user_id: string | null;
  receiver_guest_id: string | null;
  amount_minor: number;
  payment_method: 'cash' | 'bank_transfer';
  note: string | null;
  status: SettlementStatus;
  confirmed_at: string | null;
  created_at: string;
}

export const supabaseBackend: PodeliBackend = {
  async fetchAllUserGroups(_userId) {
    const client = requireSupabase();
    const { data: groups, error: groupsErr } = await client
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false });
    if (groupsErr) throw groupsErr;
    if (!groups || groups.length === 0) return [];

    const groupIds = groups.map((g) => g.id);

    const [
      membersRes,
      guestsRes,
      expensesRes,
      guestSharesRes,
      settlementsRes,
      guestSettlementsRes,
      invitationsRes,
    ] = await Promise.all([
      client
        .from('group_members')
        .select('id, group_id, user_id, role, joined_at, profile:profiles(*)')
        .in('group_id', groupIds),
      client
        .from('group_guests')
        .select('id, group_id, display_name, claimed_by_user_id, bank_account, bank_recipient_name, created_at')
        .in('group_id', groupIds)
        .is('claimed_by_user_id', null),
      client
        .from('expenses')
        .select('*, shares:expense_shares(*)')
        .in('group_id', groupIds)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false }),
      client.from('guest_expense_shares').select('*'),
      client
        .from('settlements')
        .select('*')
        .in('group_id', groupIds)
        .order('created_at', { ascending: false }),
      client
        .from('guest_settlements')
        .select('*')
        .in('group_id', groupIds)
        .order('created_at', { ascending: false }),
      client
        .from('group_invitations')
        .select('*')
        .in('group_id', groupIds)
        .order('created_at', { ascending: false }),
    ]);

    if (membersRes.error) throw membersRes.error;
    if (expensesRes.error) throw expensesRes.error;
    if (settlementsRes.error) throw settlementsRes.error;
    if (invitationsRes.error) throw invitationsRes.error;

    const unclaimedGuests = (guestsRes.data ?? []) as RawGuestRow[];
    const unclaimedGuestIds = new Set(unclaimedGuests.map((g) => g.id));
    const guestShares = ((guestSharesRes.data ?? []) as RawGuestShareRow[]).filter((gs) =>
      unclaimedGuestIds.has(gs.guest_id)
    );
    const guestSettlements = (guestSettlementsRes.data ?? []) as RawGuestSettlementRow[];

    return (groups as Group[]).map((group) => {
      const regMembers = ((membersRes.data ?? []) as unknown as GroupMember[]).filter(
        (m) => m.group_id === group.id
      );
      const guestMembers: GroupMember[] = unclaimedGuests
        .filter((gg) => gg.group_id === group.id)
        .map((gg) => ({
          id: gg.id,
          group_id: gg.group_id,
          user_id: gg.id,
          role: 'member',
          joined_at: gg.created_at,
          is_guest: true,
          profile: {
            id: gg.id,
            first_name: gg.display_name,
            last_name: '',
            email: '',
            avatar_url: null,
            preferred_language: 'sr',
            preferred_currency: group.currency,
            notification_preferences: {
              new_expense: true,
              settlement_updates: true,
              group_invites: true,
            },
            onboarding_completed: true,
            created_at: gg.created_at,
            bank_account: gg.bank_account ?? null,
            bank_recipient_name: gg.bank_recipient_name ?? null,
            is_guest: true,
          },
        }));

      const expenses = ((expensesRes.data ?? []) as unknown as (Expense & {
        paid_by_guest_id?: string | null;
        created_by_guest_id?: string | null;
      })[])
        .filter((e) => e.group_id === group.id)
        .map((e) => {
          const extraShares = guestShares
            .filter((gs) => gs.expense_id === e.id)
            .map((gs) => ({
              id: gs.id,
              expense_id: gs.expense_id,
              user_id: gs.guest_id,
              share_amount_minor: Number(gs.share_amount_minor),
            }));
          return {
            ...e,
            amount_minor: Number(e.amount_minor),
            paid_by: e.paid_by_guest_id || e.paid_by,
            created_by: e.created_by_guest_id || e.created_by,
            shares: [
              ...(e.shares ?? []).map((s) => ({
                ...s,
                share_amount_minor: Number(s.share_amount_minor),
              })),
              ...extraShares,
            ],
          };
        });

      const regSettlements = ((settlementsRes.data ?? []) as Settlement[])
        .filter((s) => s.group_id === group.id)
        .map((s) => ({ ...s, amount_minor: Number(s.amount_minor) }));

      const mappedGuestSettlements: Settlement[] = guestSettlements
        .filter((gs) => gs.group_id === group.id)
        .map((gs) => ({
          id: gs.id,
          group_id: gs.group_id,
          sender_id: gs.sender_user_id || gs.sender_guest_id || '',
          receiver_id: gs.receiver_user_id || gs.receiver_guest_id || '',
          amount_minor: Number(gs.amount_minor),
          payment_method: gs.payment_method,
          note: gs.note,
          status: gs.status,
          confirmed_at: gs.confirmed_at,
          created_at: gs.created_at,
        }));

      const settlements = [...regSettlements, ...mappedGuestSettlements].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      );

      const invitations = ((invitationsRes.data ?? []) as GroupInvitation[]).filter(
        (i) => i.group_id === group.id
      );

      return {
        group,
        members: [...regMembers, ...guestMembers],
        expenses,
        settlements,
        invitations,
      };
    });
  },

  async fetchActivities(_userId) {
    const client = requireSupabase();
    const { data, error } = await client
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []) as Activity[];
  },

  async fetchNotifications(userId) {
    const client = requireSupabase();
    const { data, error } = await client
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) throw error;
    return (data ?? []) as AppNotification[];
  },

  async updateProfile(userId, patch) {
    const client = requireSupabase();
    const { data, error } = await client
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('*')
      .single();
    if (error) throw error;
    return data as Profile;
  },

  async createGroup(_userId, input) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('create_group_with_admin', {
      p_name: input.name,
      p_description: input.description ?? null,
      p_category: input.category,
      p_currency: input.currency,
      p_image_url: input.image_url ?? null,
    });
    if (error) throw error;
    return data as Group;
  },

  async updateGroup(_userId, groupId, input) {
    const client = requireSupabase();
    const { data, error } = await client
      .from('groups')
      .update(input)
      .eq('id', groupId)
      .select('*')
      .single();
    if (error) throw error;
    return data as Group;
  },

  async deleteGroup(_userId, groupId) {
    const client = requireSupabase();
    const { error } = await client.from('groups').delete().eq('id', groupId);
    if (error) throw error;
  },

  async removeMember(_actorId, groupId, targetUserId) {
    const client = requireSupabase();
    const { error } = await client
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', targetUserId);
    if (error) throw error;
  },

  async createExpense(_userId, input) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('create_expense_with_mixed_shares', {
      p_group_id: input.group_id,
      p_title: input.title,
      p_description: input.description ?? null,
      p_amount_minor: input.amount_minor,
      p_paid_by: input.paid_by,
      p_category: input.category,
      p_split_method: input.split_method,
      p_expense_date: input.expense_date,
      p_receipt_url: input.receipt_url ?? null,
      p_shares: input.shares,
    });
    if (error) throw error;
    return String(data);
  },

  async updateExpense(_userId, expenseId, input) {
    const client = requireSupabase();
    const sumShares = input.shares.reduce((acc, s) => acc + s.shareAmountMinor, 0);
    if (sumShares !== input.amount_minor) {
      throw new Error('SHARES_SUM_MISMATCH');
    }

    const { error: updateErr } = await client
      .from('expenses')
      .update({
        title: input.title.trim(),
        description: input.description?.trim() || null,
        amount_minor: input.amount_minor,
        paid_by: input.paid_by,
        category: input.category,
        split_method: input.split_method,
        expense_date: input.expense_date,
        receipt_url: input.receipt_url ?? null,
      })
      .eq('id', expenseId);
    if (updateErr) throw updateErr;

    const { error: delErr } = await client
      .from('expense_shares')
      .delete()
      .eq('expense_id', expenseId);
    if (delErr) throw delErr;

    const { error: insErr } = await client.from('expense_shares').insert(
      input.shares.map((s) => ({
        expense_id: expenseId,
        user_id: s.userId,
        share_amount_minor: s.shareAmountMinor,
      }))
    );
    if (insErr) throw insErr;
  },

  async deleteExpense(_userId, expenseId) {
    const client = requireSupabase();
    const { error } = await client.from('expenses').delete().eq('id', expenseId);
    if (error) throw error;
  },

  async createSettlement(_userId, input) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('record_instant_settlement', {
      p_group_id: input.group_id,
      p_sender_id: input.sender_id,
      p_receiver_id: input.receiver_id,
      p_amount_minor: input.amount_minor,
      p_payment_method: input.payment_method,
      p_note: input.note ?? null,
    });
    if (error) throw error;
    const row = data as Settlement;
    return {
      ...row,
      amount_minor: Number(row.amount_minor),
    };
  },

  async transitionSettlement(_userId, settlementId, status) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('transition_settlement_status', {
      p_settlement_id: settlementId,
      p_new_status: status,
    });
    if (!error) return data as Settlement;

    if (error.message?.includes('Settlement not found')) {
      const { data: gs, error: gsErr } = await client
        .from('guest_settlements')
        .update({
          status,
          confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
        })
        .eq('id', settlementId)
        .eq('status', 'pending')
        .select('*')
        .single();
      if (gsErr) throw gsErr;
      const row = gs as RawGuestSettlementRow;
      return {
        id: row.id,
        group_id: row.group_id,
        sender_id: row.sender_user_id || row.sender_guest_id || '',
        receiver_id: row.receiver_user_id || row.receiver_guest_id || '',
        amount_minor: Number(row.amount_minor),
        payment_method: row.payment_method,
        note: row.note,
        status: row.status,
        confirmed_at: row.confirmed_at,
        created_at: row.created_at,
      };
    }

    throw error;
  },

  async undoConfirmedSettlement(_userId, settlementId) {
    const client = requireSupabase();
    const { error } = await client.rpc('undo_confirmed_settlement', {
      p_settlement_id: settlementId,
    });
    if (error) throw error;
  },

  async createInvitation(_userId, groupId) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('create_group_invitation', {
      p_group_id: groupId,
      p_expires_in_days: 30,
      p_max_uses: null,
    });
    if (error) throw error;
    return data as GroupInvitation;
  },

  async revokeInvitation(_userId, invitationId) {
    const client = requireSupabase();
    const { error } = await client
      .from('group_invitations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', invitationId);
    if (error) throw error;
  },

  async getInvitationPreview(token) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('get_invitation_preview', {
      p_token: token,
    });
    if (error) throw error;
    return data as InvitationPreview;
  },

  async acceptInvitation(_userId, token) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('accept_group_invitation', {
      p_token: token,
    });
    if (error) throw error;
    return String(data);
  },

  async markNotificationRead(userId, notificationId) {
    const client = requireSupabase();
    const { error } = await client
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async markAllNotificationsRead(userId) {
    const client = requireSupabase();
    const { error } = await client
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) throw error;
  },

  async uploadImage(bucket, pathPrefix, file) {
    const client = requireSupabase();
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await client.storage.from(bucket).upload(filePath, file, {
      upsert: true,
      contentType: file.type,
    });
    if (error) throw error;

    if (bucket === 'receipts') {
      const { data: signed, error: signErr } = await client.storage
        .from(bucket)
        .createSignedUrl(filePath, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;
      return signed.signedUrl;
    }

    const { data } = client.storage.from(bucket).getPublicUrl(filePath);
    return data.publicUrl;
  },

  async regenerateShareToken(_userId, groupId) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('regenerate_group_share_token', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return String(data);
  },

  async getSharedGroup(shareToken) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('get_shared_group', {
      p_share_token: shareToken,
    });
    if (error) throw error;
    return data as SharedGroupResult;
  },

  async joinSharedGroupAsGuest(shareToken, opts) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('join_shared_group_as_guest', {
      p_share_token: shareToken,
      p_display_name: opts.displayName ?? null,
      p_existing_guest_id: opts.existingGuestId ?? null,
    });
    if (error) throw error;
    const res = data as {
      group_id: string;
      guest_member_id: string;
      display_name: string;
      guest_session_token: string;
    };
    return {
      groupId: res.group_id,
      guestMemberId: res.guest_member_id,
      guestSessionToken: res.guest_session_token,
      displayName: res.display_name,
      shareToken,
      updatedAt: new Date().toISOString(),
    };
  },

  async guestCreateExpense(shareToken, guestMemberId, guestSessionToken, input) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('guest_create_expense', {
      p_share_token: shareToken,
      p_guest_member_id: guestMemberId,
      p_guest_session_token: guestSessionToken,
      p_title: input.title,
      p_description: input.description ?? null,
      p_amount_minor: input.amount_minor,
      p_paid_by: input.paid_by,
      p_category: input.category,
      p_split_method: input.split_method,
      p_expense_date: input.expense_date,
      p_shares: input.shares,
    });
    if (error) throw error;
    return String(data);
  },

  async guestCreateSettlement(shareToken, guestMemberId, guestSessionToken, input) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('guest_create_settlement', {
      p_share_token: shareToken,
      p_guest_member_id: guestMemberId,
      p_guest_session_token: guestSessionToken,
      p_receiver_id: input.receiver_id,
      p_amount_minor: input.amount_minor,
      p_payment_method: input.payment_method,
      p_note: input.note ?? null,
    });
    if (error) throw error;
    return data as Settlement;
  },

  async guestTransitionSettlement(shareToken, guestMemberId, guestSessionToken, settlementId, status) {
    const client = requireSupabase();
    const { error } = await client.rpc('guest_transition_settlement', {
      p_share_token: shareToken,
      p_guest_member_id: guestMemberId,
      p_guest_session_token: guestSessionToken,
      p_settlement_id: settlementId,
      p_new_status: status,
    });
    if (error) throw error;
  },

  async joinSharedGroupAsUser(_userId, shareToken) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('join_shared_group_as_user', {
      p_share_token: shareToken,
    });
    if (error) throw error;
    return String(data);
  },

  async claimGuestIdentity(_userId, groupId, guestMemberId, guestSessionToken) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('claim_guest_identity', {
      p_group_id: groupId,
      p_guest_member_id: guestMemberId,
      p_guest_session_token: guestSessionToken,
    });
    if (error) throw error;
    return Boolean(data);
  },

  async updateGuestBankAccount(shareToken, guestMemberId, guestSessionToken, bankAccount, bankRecipientName) {
    const client = requireSupabase();
    const { error } = await client.rpc('update_guest_bank_account', {
      p_share_token: shareToken,
      p_guest_member_id: guestMemberId,
      p_guest_session_token: guestSessionToken,
      p_bank_account: bankAccount,
      p_bank_recipient_name: bankRecipientName,
    });
    if (error) throw error;
  },
};

export function getBackend(isDemo: boolean): PodeliBackend {
  return isDemo ? demoBackend : supabaseBackend;
}
