import React from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n';
import type { AppLanguage } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface LanguageSelectorProps {
  variant?: 'compact' | 'pills' | 'select';
  className?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  variant = 'compact',
  className = '',
}) => {
  const { i18n, t } = useTranslation();
  const { setLanguage } = useAuth();
  const current = (i18n.language as AppLanguage) || 'sr';

  const handleChange = (lang: AppLanguage) => {
    void setLanguage(lang);
  };

  if (variant === 'pills') {
    return (
      <div className={`grid grid-cols-3 gap-2 ${className}`}>
        {SUPPORTED_LANGUAGES.map((lang) => {
          const active = current === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => handleChange(lang.code)}
              className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                active
                  ? 'bg-[#35483F] text-white border-[#35483F] shadow-sm'
                  : 'bg-white text-[#171C19] border-[#E8ECE9] hover:border-[#476457]/40 hover:bg-[#F5F7F6]'
              }`}
            >
              {lang.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 'select') {
    return (
      <div className={`relative ${className}`}>
        <Globe className="w-4 h-4 text-[#818A84] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select
          aria-label={t('nav.language')}
          value={current}
          onChange={(e) => handleChange(e.target.value as AppLanguage)}
          className="w-full appearance-none pl-10 pr-8 py-2.5 bg-white border border-[#E8ECE9] rounded-xl text-sm font-medium text-[#171C19] focus:outline-none focus:ring-2 focus:ring-[#35483F]/20 focus:border-[#35483F]"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center bg-[#F5F7F6] border border-[#E8ECE9] rounded-xl p-0.5 ${className}`}
      role="group"
      aria-label={t('nav.language')}
    >
      {SUPPORTED_LANGUAGES.map((lang) => {
        const active = current === lang.code;
        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => handleChange(lang.code)}
            title={lang.label}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              active
                ? 'bg-[#35483F] text-white shadow-xs'
                : 'text-[#818A84] hover:text-[#171C19]'
            }`}
          >
            {lang.code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
};
