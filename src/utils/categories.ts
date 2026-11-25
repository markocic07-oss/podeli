import type { ExpenseCategory, GroupCategory } from '../types';

export interface GroupCategoryMeta {
  id: GroupCategory;
  emoji: string;
  bgClass: string;
  textClass: string;
}

export const GROUP_CATEGORIES: GroupCategoryMeta[] = [
  { id: 'nights_out', emoji: '🥂', bgClass: 'bg-[#E8F1EB]', textClass: 'text-[#35483F]' },
  { id: 'travel', emoji: '✈️', bgClass: 'bg-[#E6F1F8]', textClass: 'text-[#235473]' },
  { id: 'housing', emoji: '🏠', bgClass: 'bg-[#F3EFE6]', textClass: 'text-[#6B5427]' },
  { id: 'family', emoji: '👨‍👩‍👧‍👦', bgClass: 'bg-[#F0EBF6]', textClass: 'text-[#553B73]' },
  { id: 'couples', emoji: '❤️', bgClass: 'bg-[#FCEEEE]', textClass: 'text-[#9E3939]' },
  { id: 'celebrations', emoji: '🎉', bgClass: 'bg-[#FDF4E6]', textClass: 'text-[#8C5A10]' },
  { id: 'other', emoji: '🧾', bgClass: 'bg-[#EEF1EF]', textClass: 'text-[#476457]' },
];

export const GROUP_CATEGORY_MAP: Record<GroupCategory, GroupCategoryMeta> = Object.fromEntries(
  GROUP_CATEGORIES.map((c) => [c.id, c])
) as Record<GroupCategory, GroupCategoryMeta>;

export interface ExpenseCategoryMeta {
  id: ExpenseCategory;
  bgClass: string;
  textClass: string;
}

export const EXPENSE_CATEGORIES: ExpenseCategoryMeta[] = [
  { id: 'food', bgClass: 'bg-[#FDF4E6]', textClass: 'text-[#9A6012]' },
  { id: 'drinks', bgClass: 'bg-[#F0EBF6]', textClass: 'text-[#5B3D80]' },
  { id: 'transport', bgClass: 'bg-[#E6F1F8]', textClass: 'text-[#245A7A]' },
  { id: 'accommodation', bgClass: 'bg-[#E8F1EB]', textClass: 'text-[#35483F]' },
  { id: 'groceries', bgClass: 'bg-[#E6F4EE]', textClass: 'text-[#16835B]' },
  { id: 'bills', bgClass: 'bg-[#FCEEEE]', textClass: 'text-[#B34040]' },
  { id: 'entertainment', bgClass: 'bg-[#F4ECF7]', textClass: 'text-[#6C3483]' },
  { id: 'gifts', bgClass: 'bg-[#FEF0F5]', textClass: 'text-[#A63A64]' },
  { id: 'other', bgClass: 'bg-[#EEF1EF]', textClass: 'text-[#476457]' },
];

export const EXPENSE_CATEGORY_MAP: Record<ExpenseCategory, ExpenseCategoryMeta> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.id, c])
) as Record<ExpenseCategory, ExpenseCategoryMeta>;
