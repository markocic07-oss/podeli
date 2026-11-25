import React, { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  PlusCircle,
  Scale,
  Users,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface HowItWorksGuideProps {
  variant?: 'full' | 'compact';
  onDismiss?: () => void;
}

export const HowItWorksGuide: React.FC<HowItWorksGuideProps> = ({
  variant = 'full',
  onDismiss,
}) => {
  const { t } = useTranslation();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const steps = [
    {
      icon: Users,
      title: t('guide.step1Title'),
      desc: t('guide.step1Desc'),
    },
    {
      icon: PlusCircle,
      title: t('guide.step2Title'),
      desc: t('guide.step2Desc'),
    },
    {
      icon: Scale,
      title: t('guide.step3Title'),
      desc: t('guide.step3Desc'),
    },
    {
      icon: CheckCircle2,
      title: t('guide.step4Title'),
      desc: t('guide.step4Desc'),
    },
  ];

  const faqs = [
    { q: t('guide.faq1Q'), a: t('guide.faq1A') },
    { q: t('guide.faq2Q'), a: t('guide.faq2A') },
    { q: t('guide.faq3Q'), a: t('guide.faq3A') },
  ];

  if (variant === 'compact') {
    return (
      <section className="bg-white rounded-3xl border border-[#E8ECE9] p-4 sm:p-5 shadow-(--shadow-card) space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-[#E8F1EB] text-[#35483F] flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <h2 className="text-sm sm:text-base font-bold text-[#171C19] leading-snug">
              {t('guide.quickCardTitle')}
            </h2>
          </div>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label={t('guide.hideGuide')}
              className="p-1.5 rounded-xl text-[#818A84] hover:text-[#171C19] hover:bg-[#F5F7F6] shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div
                key={idx}
                className="flex items-start gap-2.5 p-3 rounded-2xl bg-[#F5F7F6]/80"
              >
                <Icon className="w-4 h-4 text-[#35483F] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#171C19]">{step.title}</p>
                  <p className="text-xs text-[#818A84] mt-0.5 leading-relaxed line-clamp-2">
                    {step.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Link
            to="/settings?tab=guide"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#35483F] hover:underline"
          >
            <span>{t('guide.openFullGuide')}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs font-medium text-[#818A84] hover:text-[#171C19]"
            >
              {t('guide.hideGuide')}
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="bg-white rounded-3xl border border-[#E8ECE9] p-5 sm:p-6 shadow-(--shadow-card) space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#E8F1EB] text-[#35483F] flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#171C19]">{t('guide.title')}</h2>
            <p className="text-sm text-[#818A84] mt-0.5 leading-relaxed">
              {t('guide.subtitle')}
            </p>
          </div>
        </div>

        {/* 4 Steps */}
        <div className="space-y-3">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div
                key={idx}
                className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#F5F7F6] border border-[#E8ECE9]/70"
              >
                <div className="w-10 h-10 rounded-2xl bg-white text-[#35483F] border border-[#E8ECE9] flex items-center justify-center shrink-0 shadow-2xs">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[#171C19]">{step.title}</h3>
                  <p className="text-xs sm:text-sm text-[#606A64] mt-1 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Important note */}
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-[#E8F1EB]/75 text-[#35483F]">
          <Info className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide">{t('guide.noteTitle')}</p>
            <p className="text-xs sm:text-sm mt-0.5 leading-relaxed">{t('guide.noteBody')}</p>
          </div>
        </div>
      </div>

      {/* FAQ Accordion */}
      <div className="bg-white rounded-3xl border border-[#E8ECE9] p-5 sm:p-6 shadow-(--shadow-card) space-y-3">
        <h3 className="text-base font-bold text-[#171C19]">{t('guide.faqTitle')}</h3>

        <div className="divide-y divide-[#E8ECE9]">
          {faqs.map((item, idx) => {
            const expanded = openFaq === idx;
            return (
              <div key={idx} className="py-3 first:pt-1 last:pb-0">
                <button
                  type="button"
                  onClick={() => setOpenFaq(expanded ? null : idx)}
                  className="w-full flex items-center justify-between gap-3 text-left py-1"
                >
                  <span className="text-sm font-semibold text-[#171C19]">{item.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-[#818A84] shrink-0 transition-transform ${
                      expanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {expanded && (
                  <p className="text-xs sm:text-sm text-[#606A64] mt-2 leading-relaxed pr-6">
                    {item.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
