import React from 'react';
import { cn } from '../../lib/utils';

export function PageHeader({ title, description, actions, className }) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-4 rule-strong-b',
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground leading-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
