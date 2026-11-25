import React from 'react';
import { cn } from '../../lib/utils';
import { Skeleton } from './Skeleton';

/**
 * Rule-divided 4-column Swiss Rail KPI strip.
 * Hairline dividers separate high-density tabular operational metrics cleanly without bloated boxes.
 */
export function TimetableStrip({ children, className }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-border rounded bg-card divide-y sm:divide-y-0 sm:divide-x divide-border',
        className
      )}
    >
      {children}
    </div>
  );
}

export function TimetableCell({
  label,
  tag,
  value,
  subtext,
  tone = 'default',
  loading = false,
  className,
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-status-ok'
      : tone === 'warn'
        ? 'text-status-warn'
        : tone === 'err'
          ? 'text-status-err'
          : tone === 'route'
            ? 'text-route'
            : 'text-foreground';

  return (
    <div className={cn('px-4 py-3.5 sm:px-5 flex flex-col justify-between min-w-0', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">
          {label}
        </span>
        {tag && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80 shrink-0">
            {tag}
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-7 w-24 mt-2.5" />
      ) : (
        <>
          <div className={cn('mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums leading-none', toneClass)}>
            {value}
          </div>
          {subtext && (
            <div className="mt-2 font-mono text-[11px] text-muted-foreground tabular-nums truncate">
              {subtext}
            </div>
          )}
        </>
      )}
    </div>
  );
}
