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
          'flex h-9 w-full appearance-none rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50 pr-8',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 opacity-50" />
    </div>
  );
}
