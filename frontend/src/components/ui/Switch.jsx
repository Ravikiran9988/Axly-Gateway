import React from 'react';
import { cn } from '../../lib/utils';

export function Switch({ checked, onCheckedChange, disabled, className, ...props }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange && onCheckedChange(!checked)}
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-sm border border-border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-45',
        checked ? 'bg-status-ok border-status-ok' : 'bg-muted',
        className
      )}
      {...props}
    >
      <span
        className={cn(
          'pointer-events-none block h-3.5 w-3.5 rounded-[1px] bg-white shadow-sm ring-0 transition-transform duration-150',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}
