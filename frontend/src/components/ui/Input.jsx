import React from 'react';
import { cn } from '../../lib/utils';

export const Input = React.forwardRef(
  ({ className, type = 'text', error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          type={type}
          ref={ref}
          className={cn(
            'flex h-9 w-full rounded border border-input bg-background px-3 py-1.5 text-xs text-foreground transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-status-err focus-visible:ring-status-err',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-status-err">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
