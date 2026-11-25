import React, { useMemo, useState } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import type { GroupCategory } from '../types';
import { GROUP_CATEGORIES } from '../utils/categories';
import { GroupCard } from '../components/GroupCard';

export const GroupsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { groups, openCreateGroupModal } = useData();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<GroupCategory | 'all'>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter(({ group }) => {
      if (selectedCategory !== 'all' && group.category !== selectedCategory) return false;
      if (q) {
        const hay = `${group.name} ${group.description ?? ''}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [groups, search, selectedCategory]);

  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#171C19] tracking-tight">
            {t('groups.title')}
          </h1>
          <p className="text-sm text-[#818A84] mt-0.5">{t('groups.subtitle')}</p>
        </div>

        <button
          type="button"
          onClick={() => openCreateGroupModal()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>{t('groups.createGroup')}</span>
        </button>
      </header>

      {/* Search & Category Pills */}
      {groups.length > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#818A84] absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('groups.searchPlaceholder')}
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white border border-[#E8ECE9] text-sm text-[#171C19] placeholder:text-[#818A84] focus:outline-none focus:ring-2 focus:ring-[#35483F]/20 focus:border-[#35483F]"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-[#35483F] text-white border-[#35483F]'
                  : 'bg-white text-[#818A84] border-[#E8ECE9] hover:text-[#171C19]'
              }`}
            >
              {t('common.all')}
            </button>
            {GROUP_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-[#35483F] text-white border-[#35483F]'
                    : 'bg-white text-[#818A84] border-[#E8ECE9] hover:text-[#171C19]'
                }`}
              >
                <span>{cat.emoji}</span>
                <span>{t(`groups.categories.${cat.id}`)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#E8ECE9] p-10 text-center shadow-(--shadow-card)">
          <div className="w-14 h-14 rounded-2xl bg-[#E8F1EB] text-[#35483F] flex items-center justify-center mx-auto">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-[#171C19] mt-4">
            {t('dashboard.emptyGroupsTitle')}
          </h3>
          <p className="text-sm text-[#818A84] mt-1.5 max-w-md mx-auto">
            {t('dashboard.emptyGroupsSubtitle')}
          </p>
          <button
            type="button"
            onClick={() => openCreateGroupModal()}
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#35483F] hover:bg-[#2B3B33] text-white text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>{t('dashboard.createFirstGroup')}</span>
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#E8ECE9] p-10 text-center">
          <p className="text-sm text-[#818A84]">{t('common.noResults')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => (
            <GroupCard key={item.group.id} item={item} currentUserId={user.id} />
          ))}
        </div>
      )}
    </div>
  );
};
