import React from 'react';
import { cn } from '../../lib/utils';

export function Select({
  className,
  value,
  onChange,
  children,
  disabled,
  ...props
}) {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={cn(
        'flex h-9 w-full rounded border border-input bg-card px-2.5 py-1.5 text-xs text-foreground transition-colors cursor-pointer',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        '[&>option]:bg-card [&>option]:text-foreground [&>optgroup]:bg-card [&>optgroup]:text-muted-foreground',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
