import { cn } from '@/utils/cn';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      aria-hidden="true"
    />
  );
}

/** Skeleton that matches the ProductCard layout */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
      {/* Image placeholder */}
      <Skeleton className="w-full aspect-square" />
      {/* Content */}
      <div className="p-4 space-y-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-1/4 mt-1" />
        <Skeleton className="h-8 w-full mt-3 rounded-lg" />
      </div>
    </div>
  );
}
