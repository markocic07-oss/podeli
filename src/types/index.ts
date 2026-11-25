export type AppLanguage = 'sr' | 'hr' | 'bs';

export type CurrencyCode = 'RSD' | 'EUR' | 'BAM';

export type GroupCategory =
  | 'nights_out'
  | 'travel'
  | 'housing'
  | 'family'
  | 'couples'
  | 'celebrations'
  | 'other';

export type ExpenseCategory =
  | 'food'
  | 'drinks'
  | 'transport'
  | 'accommodation'
  | 'groceries'
  | 'bills'
  | 'entertainment'
  | 'gifts'
  | 'other';

export type SplitMethod = 'equal' | 'custom' | 'percentage';

export type GroupRole = 'admin' | 'member';

export type SettlementStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';

export type PaymentMethod = 'cash' | 'bank_transfer';

export type ActivityType =
  | 'group_created'
  | 'member_joined'
  | 'member_removed'
  | 'expense_added'
  | 'expense_updated'
  | 'expense_deleted'
  | 'settlement_created'
  | 'settlement_confirmed'
  | 'settlement_rejected'
  | 'settlement_cancelled'
  | 'invitation_accepted';

export interface NotificationPreferences {
  new_expense: boolean;
  settlement_updates: boolean;
  group_invites: boolean;
}

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  preferred_language: AppLanguage;
  preferred_currency: CurrencyCode;
  notification_preferences: NotificationPreferences;
  onboarding_completed: boolean;
  created_at: string;
  bank_account?: string | null;
  bank_recipient_name?: string | null;
  is_guest?: boolean;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  category: GroupCategory;
  image_url: string | null;
  currency: CurrencyCode;
  created_by: string;
  created_at: string;
  share_token: string;
  is_public_link_enabled: boolean;
  guest_payments_auto_confirm: boolean;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
  is_guest?: boolean;
  profile: Profile;
}

export interface GroupInvitation {
  id: string;
  group_id: string;
  token: string;
  created_by: string;
  expires_at: string | null;
  max_uses: number | null;
  uses_count: number;
  revoked_at: string | null;
  created_at: string;
}

export interface InvitationPreview {
  valid: boolean;
  reason?: 'not_found' | 'expired' | 'revoked' | 'max_uses_reached';
  group_id?: string;
  group_name?: string;
  group_description?: string | null;
  group_category?: GroupCategory;
  group_currency?: CurrencyCode;
  group_image_url?: string | null;
  member_count?: number;
  already_member?: boolean;
}

export interface ExpenseShare {
  id: string;
  expense_id: string;
  user_id: string;
  share_amount_minor: number;
}

export interface Expense {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  amount_minor: number;
  currency: CurrencyCode;
  paid_by: string;
  category: ExpenseCategory;
  split_method: SplitMethod;
  expense_date: string; // YYYY-MM-DD
  receipt_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  shares: ExpenseShare[];
}

export interface Settlement {
  id: string;
  group_id: string;
  sender_id: string;
  receiver_id: string;
  amount_minor: number;
  payment_method: PaymentMethod;
  note: string | null;
  status: SettlementStatus;
  confirmed_at: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  group_id: string;
  user_id: string;
  activity_type: ActivityType;
  description: string;
  metadata?: Record<string, string | number | null>;
  related_entity_id: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  related_group_id: string | null;
  related_entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ShareAllocation {
  userId: string;
  shareAmountMinor: number;
}

export interface PercentageInput {
  userId: string;
  /** Basis points: 100.00% = 10000, 25.50% = 2550 */
  basisPoints: number;
}

export interface MemberBalance {
  userId: string;
  totalPaidMinor: number;
  totalOwedMinor: number;
  confirmedSentMinor: number;
  confirmedReceivedMinor: number;
  /** Positive = should receive money; Negative = owes money */
  netBalanceMinor: number;
}

export interface SuggestedTransfer {
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
}

export interface GroupBalanceSummary {
  totalExpensesMinor: number;
  balancesByUser: Record<string, MemberBalance>;
  memberBalances: MemberBalance[];
  suggestedTransfers: SuggestedTransfer[];
}

export interface DashboardCurrencyBalance {
  currency: CurrencyCode;
  owedToYouMinor: number;
  youOweMinor: number;
  netBalanceMinor: number;
  activeGroupsCount: number;
}

export interface GroupWithDetails {
  group: Group;
  members: GroupMember[];
  expenses: Expense[];
  settlements: Settlement[];
  invitations: GroupInvitation[];
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  category: GroupCategory;
  currency: CurrencyCode;
  image_url?: string | null;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string | null;
  category?: GroupCategory;
  image_url?: string | null;
  is_public_link_enabled?: boolean;
  guest_payments_auto_confirm?: boolean;
}

export interface GuestSession {
  groupId: string;
  guestMemberId: string;
  guestSessionToken: string;
  displayName: string;
  shareToken: string;
  updatedAt: string;
}

export interface SharedGroupResult {
  found: boolean;
  reason?: 'not_found' | 'disabled';
  group?: Group;
  members?: GroupMember[];
  expenses?: Expense[];
  settlements?: Settlement[];
}

export interface UpsertExpenseInput {
  group_id: string;
  title: string;
  description?: string | null;
  amount_minor: number;
  currency: CurrencyCode;
  paid_by: string;
  category: ExpenseCategory;
  split_method: SplitMethod;
  expense_date: string;
  receipt_url?: string | null;
  shares: ShareAllocation[];
}

export interface CreateSettlementInput {
  group_id: string;
  sender_id: string;
  receiver_id: string;
  amount_minor: number;
  payment_method: PaymentMethod;
  note?: string | null;
}
