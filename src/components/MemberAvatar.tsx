import React from 'react';
import type { Profile } from '../types';

interface MemberAvatarProps {
  profile?: Pick<Profile, 'first_name' | 'last_name' | 'avatar_url' | 'email'> | null;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<MemberAvatarProps['size']>, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-20 h-20 text-2xl',
};

const PALETTES = [
  'bg-[#E8F1EB] text-[#35483F]',
  'bg-[#E6F1F8] text-[#235473]',
  'bg-[#F3EFE6] text-[#6B5427]',
  'bg-[#F0EBF6] text-[#553B73]',
  'bg-[#E6F4EE] text-[#16835B]',
  'bg-[#FDF4E6] text-[#8C5A10]',
];

function getInitials(profile?: MemberAvatarProps['profile'], name?: string): string {
  if (profile) {
    const f = profile.first_name?.trim()?.[0] ?? '';
    const l = profile.last_name?.trim()?.[0] ?? '';
    if (f || l) return `${f}${l}`.toUpperCase();
    if (profile.email) return profile.email.slice(0, 2).toUpperCase();
  }
  if (name) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }
  return '?';
}

function getPaletteIndex(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % PALETTES.length;
}

export const MemberAvatar: React.FC<MemberAvatarProps> = ({
  profile,
  name,
  size = 'md',
  className = '',
}) => {
  const fullName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim() || profile.email
    : name || 'Korisnik';

  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={fullName}
        className={`${SIZE_CLASSES[size]} rounded-full object-cover ring-2 ring-white shrink-0 ${className}`}
      />
    );
  }

  const palette = PALETTES[getPaletteIndex(fullName)];

  return (
    <div
      title={fullName}
      aria-label={fullName}
      className={`${SIZE_CLASSES[size]} ${palette} rounded-full font-semibold inline-flex items-center justify-center ring-2 ring-white shrink-0 select-none ${className}`}
    >
      {getInitials(profile, name)}
    </div>
  );
};
