import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { AppLanguage } from '../types';
import { sr } from './locales/sr';
import { hr } from './locales/hr';
import { bs } from './locales/bs';

export const LANGUAGE_STORAGE_KEY = 'podeli_language';

export const SUPPORTED_LANGUAGES: { code: AppLanguage; label: string; nativeLabel: string }[] = [
  { code: 'sr', label: 'Srpski', nativeLabel: 'Srpski (SR)' },
  { code: 'hr', label: 'Hrvatski', nativeLabel: 'Hrvatski (HR)' },
  { code: 'bs', label: 'Bosanski', nativeLabel: 'Bosanski (BS)' },
];

export function getSavedLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'sr';
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === 'sr' || stored === 'hr' || stored === 'bs') {
    return stored;
  }
  return 'sr';
}

export function setAppLanguage(lang: AppLanguage): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }
  void i18n.changeLanguage(lang);
}

void i18n.use(initReactI18next).init({
  resources: {
    sr: { translation: sr },
    hr: { translation: hr },
    bs: { translation: bs },
  },
  lng: getSavedLanguage(),
  fallbackLng: 'sr',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
