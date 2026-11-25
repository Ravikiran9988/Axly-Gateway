import React from 'react';
import { cn } from '../../lib/utils';
import { ChevronDown } from 'lucide-react';

export function Select({
  className,
  value,
  onChange,
  children,
  disabled,
  ...props
}) {
  return (
    <div className="relative inline-block w-full">
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={cn(
          'flex h-9 w-full appearance-none rounded border border-input bg-card px-3 py-1.5 pr-8 text-xs text-foreground transition-colors',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          '[&>option]:bg-card [&>option]:text-foreground [&>optgroup]:bg-card [&>optgroup]:text-muted-foreground',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}
