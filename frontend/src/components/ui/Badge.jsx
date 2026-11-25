import React from 'react';
import { cn } from '../../lib/utils';

export function Badge({
  className,
  variant = 'default',
  children,
  ...props
}) {
  const variants = {
    default: 'border-primary/30 bg-primary/15 text-primary',
    secondary: 'border-border bg-secondary text-secondary-foreground',
    outline: 'border-border bg-transparent text-foreground',
    route: 'border-route/30 bg-route/10 text-route',
    destructive: 'border-status-err/30 bg-status-err/12 text-status-err',
    success: 'border-status-ok/30 bg-status-ok/12 text-status-ok',
    warning: 'border-status-warn/30 bg-status-warn/12 text-status-warn',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-2 py-0.5 text-[11px] font-semibold tracking-wide transition-colors',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
