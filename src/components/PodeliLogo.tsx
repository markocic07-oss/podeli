import React from 'react';

interface PodeliLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  inverted?: boolean;
}

export const PodeliLogo: React.FC<PodeliLogoProps> = ({
  size = 'md',
  showTagline = false,
  inverted = false,
}) => {
  const iconSize = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-11 h-11' : 'w-9 h-9';
  const textSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <div
        className={`${iconSize} rounded-xl flex items-center justify-center shrink-0 ${
          inverted ? 'bg-white/15' : 'bg-[#35483F]'
        } shadow-sm`}
      >
        <svg viewBox="0 0 128 128" fill="none" className="w-full h-full p-1">
          <path
            d="M36 42C36 35.3726 41.3726 30 48 30H64C78.3594 30 90 41.6406 90 56C90 70.3594 78.3594 82 64 82H52V94C52 97.3137 49.3137 100 46 100H42C38.6863 100 36 97.3137 36 94V42Z"
            fill="#E8F1EB"
          />
          <circle cx="64" cy="56" r="11" fill="#35483F" />
          <path d="M74 86L92 68" stroke="#85C7A5" strokeWidth="8" strokeLinecap="round" />
          <circle cx="75" cy="91" r="6" fill="#85C7A5" />
          <circle cx="91" cy="83" r="6" fill="#E8F1EB" />
        </svg>
      </div>
      <div className="flex flex-col">
        <span
          className={`${textSize} font-bold tracking-tight leading-none ${
            inverted ? 'text-white' : 'text-[#171C19]'
          }`}
        >
          PODELI
        </span>
        {showTagline && (
          <span
            className={`text-xs mt-0.5 ${
              inverted ? 'text-white/75' : 'text-[#818A84]'
            }`}
          >
            Zajednički troškovi, bez komplikacija.
          </span>
        )}
      </div>
    </div>
  );
};
