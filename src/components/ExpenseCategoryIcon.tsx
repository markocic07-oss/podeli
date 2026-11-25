import React from 'react';
import {
  Utensils,
  Wine,
  Car,
  Home,
  ShoppingBasket,
  Zap,
  Ticket,
  Gift,
  Receipt,
} from 'lucide-react';
import type { ExpenseCategory } from '../types';
import { EXPENSE_CATEGORY_MAP } from '../utils/categories';

const ICON_MAP: Record<ExpenseCategory, React.FC<{ className?: string }>> = {
  food: Utensils,
  drinks: Wine,
  transport: Car,
  accommodation: Home,
  groceries: ShoppingBasket,
  bills: Zap,
  entertainment: Ticket,
  gifts: Gift,
  other: Receipt,
};

interface ExpenseCategoryIconProps {
  category: ExpenseCategory;
  size?: 'sm' | 'md' | 'lg';
}

export const ExpenseCategoryIcon: React.FC<ExpenseCategoryIconProps> = ({
  category,
  size = 'md',
}) => {
  const meta = EXPENSE_CATEGORY_MAP[category] ?? EXPENSE_CATEGORY_MAP.other;
  const Icon = ICON_MAP[category] ?? Receipt;
  const boxClass =
    size === 'sm' ? 'w-9 h-9 rounded-xl' : size === 'lg' ? 'w-12 h-12 rounded-2xl' : 'w-11 h-11 rounded-2xl';
  const iconClass = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';

  return (
    <div className={`${boxClass} ${meta.bgClass} ${meta.textClass} flex items-center justify-center shrink-0`}>
      <Icon className={iconClass} />
    </div>
  );
};
