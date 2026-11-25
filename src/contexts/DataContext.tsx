import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { getBackend } from '../services/dataService';
import { getAllGuestIdentities, removeGuestIdentity } from '../lib/guestIdentity';
import type {
  Activity,
  AppNotification,
  CreateGroupInput,
  CreateSettlementInput,
  CurrencyCode,
  DashboardCurrencyBalance,
  Expense,
  Group,
  GroupInvitation,
  GroupWithDetails,
  Profile,
  Settlement,
  SettlementStatus,
  UpdateGroupInput,
  UpsertExpenseInput,
} from '../types';
import { calculateDashboardBalances } from '../utils/finance';

interface DataContextValue {
  groups: GroupWithDetails[];
  activities: Activity[];
  notifications: AppNotification[];
  profilesMap: Record<string, Profile>;
  dashboardBalances: Record<CurrencyCode, DashboardCurrencyBalance>;
  unreadNotificationsCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  createGroup: (input: CreateGroupInput) => Promise<Group>;
  updateGroup: (groupId: string, input: UpdateGroupInput) => Promise<Group>;
  deleteGroup: (groupId: string) => Promise<void>;
  removeMember: (groupId: string, targetUserId: string) => Promise<void>;
  createExpense: (input: UpsertExpenseInput) => Promise<string>;
  updateExpense: (expenseId: string, input: UpsertExpenseInput) => Promise<void>;
  deleteExpense: (expenseId: string) => Promise<void>;
  createSettlement: (input: CreateSettlementInput) => Promise<Settlement>;
  transitionSettlement: (
    settlementId: string,
    status: Extract<SettlementStatus, 'confirmed' | 'rejected' | 'cancelled'>
  ) => Promise<Settlement>;
  undoConfirmedSettlement: (settlementId: string) => Promise<void>;
  createInvitation: (groupId: string) => Promise<GroupInvitation>;
  revokeInvitation: (invitationId: string) => Promise<void>;
  regenerateShareToken: (groupId: string) => Promise<string>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  uploadFile: (bucket: 'avatars' | 'group-images' | 'receipts', pathPrefix: string, file: File) => Promise<string>;
  // Global quick modals triggers
  openAddExpenseModal: (opts?: { groupId?: string; expense?: Expense }) => void;
  openCreateGroupModal: () => void;
  openSettleModal: (opts?: { groupId?: string; senderId?: string; receiverId?: string; amountMinor?: number }) => void;
  addExpenseModalState: { open: boolean; groupId?: string; expense?: Expense };
  closeAddExpenseModal: () => void;
  createGroupModalOpen: boolean;
  closeCreateGroupModal: () => void;
  settleModalState: { open: boolean; groupId?: string; senderId?: string; receiverId?: string; amountMinor?: number };
  closeSettleModal: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isDemo } = useAuth();
  const [groups, setGroups] = useState<GroupWithDetails[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const [addExpenseModalState, setAddExpenseModalState] = useState<{
    open: boolean;
    groupId?: string;
    expense?: Expense;
  }>({ open: false });
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState(false);
  const [settleModalState, setSettleModalState] = useState<{
    open: boolean;
    groupId?: string;
    senderId?: string;
    receiverId?: string;
    amountMinor?: number;
  }>({ open: false });

  const backend = useMemo(() => getBackend(isDemo), [isDemo]);

  const refresh = useCallback(async () => {
    if (!user) {
      setGroups([]);
      setActivities([]);
      setNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const [g, a, n] = await Promise.all([
        backend.fetchAllUserGroups(user.id),
        backend.fetchActivities(user.id),
        backend.fetchNotifications(user.id),
      ]);
      setGroups(g);
      setActivities(a);
      setNotifications(n);
    } catch (err) {
      console.error('Failed to refresh PODELI data:', err);
    } finally {
      setLoading(false);
    }
  }, [user, backend]);

  useEffect(() => {
    let active = true;
    const syncAndRefresh = async () => {
      if (user) {
        // Soft Account Upgrade: automatically claim any stored guest identities from localStorage
        const pendingGuests = getAllGuestIdentities();
        if (pendingGuests.length > 0) {
          for (const g of pendingGuests) {
            try {
              const claimed = await backend.claimGuestIdentity(
                user.id,
                g.groupId,
                g.guestMemberId,
                g.guestSessionToken
              );
              if (claimed) {
                removeGuestIdentity(g.groupId);
              }
            } catch {
              // Ignore expired or invalid guest tokens
            }
          }
        }
      }
      if (active) {
        await refresh();
      }
    };
    void syncAndRefresh();
    return () => {
      active = false;
    };
  }, [user, backend, refresh]);

  const profilesMap = useMemo(() => {
    const map: Record<string, Profile> = {};
    if (user) map[user.id] = user;
    for (const g of groups) {
      for (const m of g.members) {
        if (m.profile) map[m.user_id] = m.profile;
      }
    }
    return map;
  }, [user, groups]);

  const dashboardBalances = useMemo(() => {
    return calculateDashboardBalances(user?.id ?? '', groups);
  }, [user?.id, groups]);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const createGroup = useCallback(
    async (input: CreateGroupInput) => {
      if (!user) throw new Error('UNAUTHORIZED');
      const created = await backend.createGroup(user.id, input);
      await refresh();
      return created;
    },
    [user, backend, refresh]
  );

  const updateGroup = useCallback(
    async (groupId: string, input: UpdateGroupInput) => {
      if (!user) throw new Error('UNAUTHORIZED');
      const updated = await backend.updateGroup(user.id, groupId, input);
      await refresh();
      return updated;
    },
    [user, backend, refresh]
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      if (!user) throw new Error('UNAUTHORIZED');
      await backend.deleteGroup(user.id, groupId);
      await refresh();
    },
    [user, backend, refresh]
  );

  const removeMember = useCallback(
    async (groupId: string, targetUserId: string) => {
      if (!user) throw new Error('UNAUTHORIZED');
      await backend.removeMember(user.id, groupId, targetUserId);
      await refresh();
    },
    [user, backend, refresh]
  );

  const createExpense = useCallback(
    async (input: UpsertExpenseInput) => {
      if (!user) throw new Error('UNAUTHORIZED');
      const id = await backend.createExpense(user.id, input);
      await refresh();
      return id;
    },
    [user, backend, refresh]
  );

  const updateExpense = useCallback(
    async (expenseId: string, input: UpsertExpenseInput) => {
      if (!user) throw new Error('UNAUTHORIZED');
      await backend.updateExpense(user.id, expenseId, input);
      await refresh();
    },
    [user, backend, refresh]
  );

  const deleteExpense = useCallback(
    async (expenseId: string) => {
      if (!user) throw new Error('UNAUTHORIZED');
      await backend.deleteExpense(user.id, expenseId);
      await refresh();
    },
    [user, backend, refresh]
  );

  const createSettlement = useCallback(
    async (input: CreateSettlementInput) => {
      if (!user) throw new Error('UNAUTHORIZED');
      const created = await backend.createSettlement(user.id, input);
      await refresh();
      return created;
    },
    [user, backend, refresh]
  );

  const transitionSettlement = useCallback(
    async (
      settlementId: string,
      status: Extract<SettlementStatus, 'confirmed' | 'rejected' | 'cancelled'>
    ) => {
      if (!user) throw new Error('UNAUTHORIZED');
      const updated = await backend.transitionSettlement(user.id, settlementId, status);
      await refresh();
      return updated;
    },
    [user, backend, refresh]
  );

  const undoConfirmedSettlement = useCallback(
    async (settlementId: string) => {
      if (!user) throw new Error('UNAUTHORIZED');
      await backend.undoConfirmedSettlement(user.id, settlementId);
      await refresh();
    },
    [user, backend, refresh]
  );

  const createInvitation = useCallback(
    async (groupId: string) => {
      if (!user) throw new Error('UNAUTHORIZED');
      const inv = await backend.createInvitation(user.id, groupId);
      await refresh();
      return inv;
    },
    [user, backend, refresh]
  );

  const revokeInvitation = useCallback(
    async (invitationId: string) => {
      if (!user) throw new Error('UNAUTHORIZED');
      await backend.revokeInvitation(user.id, invitationId);
      await refresh();
    },
    [user, backend, refresh]
  );

  const regenerateShareToken = useCallback(
    async (groupId: string) => {
      if (!user) throw new Error('UNAUTHORIZED');
      const token = await backend.regenerateShareToken(user.id, groupId);
      await refresh();
      return token;
    },
    [user, backend, refresh]
  );

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      if (!user) return;
      await backend.markNotificationRead(user.id, notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
    },
    [user, backend]
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (!user) return;
    await backend.markAllNotificationsRead(user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [user, backend]);

  const uploadFile = useCallback(
    async (bucket: 'avatars' | 'group-images' | 'receipts', pathPrefix: string, file: File) => {
      return backend.uploadImage(bucket, pathPrefix, file);
    },
    [backend]
  );

  return (
    <DataContext.Provider
      value={{
        groups,
        activities,
        notifications,
        profilesMap,
        dashboardBalances,
        unreadNotificationsCount,
        loading,
        refresh,
        createGroup,
        updateGroup,
        deleteGroup,
        removeMember,
        createExpense,
        updateExpense,
        deleteExpense,
        createSettlement,
        transitionSettlement,
        undoConfirmedSettlement,
        createInvitation,
        revokeInvitation,
        regenerateShareToken,
        markNotificationRead,
        markAllNotificationsRead,
        uploadFile,
        openAddExpenseModal: (opts) => setAddExpenseModalState({ open: true, ...opts }),
        openCreateGroupModal: () => setCreateGroupModalOpen(true),
        openSettleModal: (opts) => setSettleModalState({ open: true, ...opts }),
        addExpenseModalState,
        closeAddExpenseModal: () => setAddExpenseModalState({ open: false }),
        createGroupModalOpen,
        closeCreateGroupModal: () => setCreateGroupModalOpen(false),
        settleModalState,
        closeSettleModal: () => setSettleModalState({ open: false }),
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
