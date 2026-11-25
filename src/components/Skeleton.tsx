import React from 'react';

export const SkeletonBox: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-[#E8ECE9] rounded-xl ${className}`} />
);

export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="rounded-3xl bg-[#35483F]/90 p-6 md:p-8 space-y-5">
      <div className="flex justify-between items-center">
        <SkeletonBox className="h-5 w-32 bg-white/15" />
        <SkeletonBox className="h-7 w-24 rounded-full bg-white/15" />
      </div>
      <SkeletonBox className="h-11 w-56 bg-white/20" />
      <div className="grid grid-cols-2 gap-4 pt-2">
        <SkeletonBox className="h-16 rounded-2xl bg-white/10" />
        <SkeletonBox className="h-16 rounded-2xl bg-white/10" />
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <SkeletonBox className="h-36 rounded-2xl bg-white" />
      <SkeletonBox className="h-36 rounded-2xl bg-white" />
    </div>
  </div>
);
