import React from 'react';
import {
  Home,
  Users,
  Receipt,
  Handshake,
  Activity as ActivityIcon,
  Settings,
  Plus,
  LogOut,
  RotateCcw,
  Sparkles,
  User,
} from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { PodeliLogo } from '../components/PodeliLogo';
import { MemberAvatar } from '../components/MemberAvatar';
import { LanguageSelector } from '../components/LanguageSelector';
import { AddExpenseModal } from '../components/AddExpenseModal';
import { CreateGroupModal } from '../components/CreateGroupModal';
import { RecordSettlementModal } from '../components/RecordSettlementModal';

export const AppLayout: React.FC = () => {
  const { t } = useTranslation();
  const { user, isDemo, logout, resetDemo } = useAuth();
  const {
    openAddExpenseModal,
    addExpenseModalState,
    closeAddExpenseModal,
    createGroupModalOpen,
    closeCreateGroupModal,
    settleModalState,
    closeSettleModal,
    refresh,
  } = useData();
  const navigate = useNavigate();

  const desktopNavItems = [
    { to: '/', label: t('nav.home'), icon: Home, end: true },
    { to: '/groups', label: t('nav.groups'), icon: Users, end: false },
    { to: '/expenses', label: t('nav.expenses'), icon: Receipt, end: false },
    { to: '/settlements', label: t('nav.settlements'), icon: Handshake, end: false },
    { to: '/activity', label: t('nav.activity'), icon: ActivityIcon, end: false },
    { to: '/settings', label: t('nav.settings'), icon: Settings, end: false },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleResetDemo = async () => {
    resetDemo();
    await refresh();
  };

  const fullName = user
    ? `${user.first_name} ${user.last_name}`.trim() || user.email
    : '';

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-[#F5F7F6] flex flex-col md:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-68 md:fixed md:inset-y-0 bg-white border-r border-[#E8ECE9] z-30">
        <div className="px-6 pt-6 pb-5">
          <NavLink to="/" className="inline-block">
            <PodeliLogo size="md" />
          </NavLink>
        </div>

        {/* Primary Add Expense Button */}
        <div className="px-4 mb-3">
          <button
            type="button"
            onClick={() => openAddExpenseModal()}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold shadow-sm transition-all active:scale-[0.99]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>{t('nav.addExpense')}</span>
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {desktopNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-[#E8F1EB] text-[#35483F] font-semibold'
                      : 'text-[#818A84] hover:text-[#171C19] hover:bg-[#F5F7F6]'
                  }`
                }
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom User Profile + Language + Logout */}
        <div className="p-4 border-t border-[#E8ECE9] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#818A84]">{t('nav.language')}</span>
            <LanguageSelector variant="compact" />
          </div>

          <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#F5F7F6]">
            <MemberAvatar profile={user} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#171C19] truncate">{fullName}</p>
              <p className="text-[11px] text-[#818A84] truncate">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title={isDemo ? t('app.exitDemo') : t('nav.logout')}
              aria-label={isDemo ? t('app.exitDemo') : t('nav.logout')}
              className="p-2 rounded-xl text-[#818A84] hover:text-[#C94A4A] hover:bg-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-68 flex flex-col min-w-0 w-full max-w-full">
        {/* Demo Mode Banner */}
        {isDemo && (
          <div className="bg-[#E8F1EB] border-b border-[#35483F]/15 px-4 pt-[calc(env(safe-area-inset-top)+0.625rem)] pb-2.5 md:pt-2.5">
            <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-[#35483F]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#35483F] text-white font-semibold shrink-0">
                  <Sparkles className="w-3 h-3" />
                  {t('app.demoBadge')}
                </span>
                <span className="truncate sm:whitespace-normal font-medium">
                  {t('app.demoBanner')}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleResetDemo}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/80 hover:bg-white text-[#35483F] font-semibold transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  {t('app.resetDemo')}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-2.5 py-1 rounded-lg bg-[#35483F] text-white font-semibold hover:bg-[#2B3B33] transition-colors"
                >
                  {t('app.exitDemo')}
                </button>
              </div>
            </div>
          </div>
        )}

        <main
          className={`flex-1 w-full max-w-5xl mx-auto px-3.5 sm:px-6 lg:px-8 pb-28 md:pb-10 ${
            isDemo ? 'pt-4 md:pt-5' : 'pt-[calc(env(safe-area-inset-top)+1rem)] md:pt-6'
          }`}
        >
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobilna navigacija"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E8ECE9] safe-area-bottom"
      >
        <div className="grid grid-cols-5 items-center h-16 px-2">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                isActive ? 'text-[#35483F] font-semibold' : 'text-[#818A84]'
              }`
            }
          >
            <Home className="w-5 h-5" />
            <span>{t('nav.home')}</span>
          </NavLink>

          <NavLink
            to="/groups"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                isActive ? 'text-[#35483F] font-semibold' : 'text-[#818A84]'
              }`
            }
          >
            <Users className="w-5 h-5" />
            <span>{t('nav.groupsShort')}</span>
          </NavLink>

          {/* Prominent Central Add Expense Action */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => openAddExpenseModal()}
              aria-label={t('nav.addExpense')}
              className="-mt-6 w-14 h-14 rounded-full bg-[#35483F] hover:bg-[#2B3B33] text-white flex items-center justify-center shadow-(--shadow-fab) ring-4 ring-[#F5F7F6] active:scale-95 transition-transform"
            >
              <Plus className="w-7 h-7 stroke-[2.5]" />
            </button>
          </div>

          <NavLink
            to="/activity"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                isActive ? 'text-[#35483F] font-semibold' : 'text-[#818A84]'
              }`
            }
          >
            <ActivityIcon className="w-5 h-5" />
            <span>{t('nav.activity')}</span>
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                isActive ? 'text-[#35483F] font-semibold' : 'text-[#818A84]'
              }`
            }
          >
            <User className="w-5 h-5" />
            <span>{t('nav.profile')}</span>
          </NavLink>
        </div>
      </nav>

      {/* Global Modals */}
      <AddExpenseModal
        open={addExpenseModalState.open}
        defaultGroupId={addExpenseModalState.groupId}
        editingExpense={addExpenseModalState.expense ?? null}
        onClose={closeAddExpenseModal}
      />

      <CreateGroupModal
        open={createGroupModalOpen}
        onClose={closeCreateGroupModal}
        onCreated={(group) => navigate(`/groups/${group.id}`)}
      />

      <RecordSettlementModal
        open={settleModalState.open}
        defaultGroupId={settleModalState.groupId}
        defaultSenderId={settleModalState.senderId}
        defaultReceiverId={settleModalState.receiverId}
        defaultAmountMinor={settleModalState.amountMinor}
        onClose={closeSettleModal}
      />
    </div>
  );
};
