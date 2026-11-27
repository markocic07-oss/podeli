import React, { useEffect, useState } from 'react';
import { ImagePlus, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import type { AppLanguage, CurrencyCode, Group, GroupCategory } from '../types';
import { GROUP_CATEGORIES } from '../utils/categories';
import { getDefaultCurrencyForLanguage } from '../utils/finance';

interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
  editingGroup?: Group | null;
  onCreated?: (group: Group) => void;
}

const CURRENCIES: CurrencyCode[] = ['RSD', 'EUR', 'BAM'];

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  open,
  onClose,
  editingGroup = null,
  onCreated,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'sr';
  const defaultLangCurrency = getDefaultCurrencyForLanguage(lang);
  const { user } = useAuth();
  const { createGroup, updateGroup, uploadFile } = useData();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<GroupCategory>('nights_out');
  const [currency, setCurrency] = useState<CurrencyCode>(defaultLangCurrency);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editingGroup) {
      setName(editingGroup.name);
      setDescription(editingGroup.description ?? '');
      setCategory(editingGroup.category);
      setCurrency(editingGroup.currency);
      setImageUrl(editingGroup.image_url);
    } else {
      setName('');
      setDescription('');
      setCategory('nights_out');
      setCurrency(defaultLangCurrency);
      setImageUrl(null);
    }
    setError(null);
  }, [open, editingGroup, defaultLangCurrency]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const url = await uploadFile('group-images', user.id, file);
      setImageUrl(url);
    } catch {
      showToast(t('app.errorGeneric'), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('auth.errors.requiredFields'));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (editingGroup) {
        await updateGroup(editingGroup.id, {
          name: name.trim(),
          description: description.trim() || null,
          category,
          image_url: imageUrl,
        });
        showToast(t('groups.updatedSuccess'), 'success');
        onClose();
      } else {
        const created = await createGroup({
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          currency,
          image_url: imageUrl,
        });
        showToast(t('groups.createdSuccess'), 'success');
        onClose();
        onCreated?.(created);
      }
    } catch {
      setError(t('app.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#171C19]/45 backdrop-blur-[2px] animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white w-full sm:max-w-lg rounded-3xl border border-[#E8ECE9] shadow-(--shadow-modal) max-h-[88dvh] flex flex-col overflow-hidden animate-scale-in">
        <div className="px-5 py-3.5 border-b border-[#E8ECE9] flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold text-[#171C19]">
            {editingGroup ? t('groups.editGroup') : t('groups.createGroup')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#818A84] hover:bg-[#F5F7F6] hover:text-[#171C19] transition-colors"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-2xl bg-[#FCEEEE] text-[#C94A4A] text-sm font-medium">
              {error}
            </div>
          )}

          {/* Group Name */}
          <div>
            <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
              {t('groups.form.name')} *
            </label>
            <input
              type="text"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('groups.form.namePlaceholder')}
              className="w-full px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm text-[#171C19] placeholder:text-[#818A84] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#35483F]/20 focus:border-[#35483F]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-[#171C19] mb-1.5">
              {t('groups.form.description')}{' '}
              <span className="font-normal text-[#818A84]">({t('common.optional')})</span>
            </label>
            <textarea
              rows={2}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('groups.form.descriptionPlaceholder')}
              className="w-full px-4 py-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60 text-sm text-[#171C19] placeholder:text-[#818A84] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#35483F]/20 focus:border-[#35483F] resize-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-semibold text-[#171C19] mb-2">
              {t('groups.form.category')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {GROUP_CATEGORIES.map((cat) => {
                const selected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl border text-left text-xs sm:text-sm font-medium transition-all ${
                      selected
                        ? 'bg-[#E8F1EB] border-[#35483F] text-[#35483F] shadow-xs'
                        : 'bg-white border-[#E8ECE9] text-[#171C19] hover:bg-[#F5F7F6]'
                    }`}
                  >
                    <span className="text-lg">{cat.emoji}</span>
                    <span className="truncate">{t(`groups.categories.${cat.id}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Currency (only selectable on creation so group currency stays consistent) */}
          {!editingGroup && (
            <div>
              <label className="block text-sm font-semibold text-[#171C19] mb-2">
                {t('groups.form.currency')}
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {CURRENCIES.map((c) => {
                  const selected = currency === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c)}
                      className={`py-3 px-3 rounded-2xl border text-center transition-all ${
                        selected
                          ? 'bg-[#35483F] border-[#35483F] text-white shadow-xs'
                          : 'bg-white border-[#E8ECE9] text-[#171C19] hover:bg-[#F5F7F6]'
                      }`}
                    >
                      <div className="text-sm font-bold">{t(`currencies.short.${c}`)}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-[#818A84] mt-2 leading-relaxed">
                {t('groups.form.currencyWarning')}
              </p>
            </div>
          )}

          {/* Optional Group Image */}
          <div>
            <label className="block text-sm font-semibold text-[#171C19] mb-2">
              {t('groups.form.image')}{' '}
              <span className="font-normal text-[#818A84]">({t('common.optional')})</span>
            </label>
            {imageUrl ? (
              <div className="flex items-center gap-4 p-3 rounded-2xl border border-[#E8ECE9] bg-[#F5F7F6]/60">
                <img
                  src={imageUrl}
                  alt={name}
                  className="w-14 h-14 rounded-2xl object-cover border border-[#E8ECE9]"
                />
                <button
                  type="button"
                  onClick={() => setImageUrl(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C94A4A] hover:underline"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('common.removeImage')}
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl border border-dashed border-[#CBD4CE] bg-[#F5F7F6]/50 hover:bg-[#E8F1EB]/40 text-sm font-medium text-[#476457] cursor-pointer transition-colors">
                <ImagePlus className="w-4 h-4" />
                <span>{uploading ? t('app.loading') : t('common.upload')}</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </label>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-5 py-3 rounded-2xl text-sm font-medium text-[#171C19] bg-[#F5F7F6] hover:bg-[#E8ECE9] transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || uploading}
              className="px-6 py-3 rounded-2xl text-sm font-semibold text-white bg-[#35483F] hover:bg-[#2B3B33] transition-colors disabled:opacity-50"
            >
              {submitting
                ? t('common.saving')
                : editingGroup
                ? t('groups.form.submitEdit')
                : t('groups.form.submitCreate')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
