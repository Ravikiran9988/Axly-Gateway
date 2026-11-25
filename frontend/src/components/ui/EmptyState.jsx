import React from 'react';
import { Button } from './Button';

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryAction,
}) {
  return (
    <div className="rounded border border-dashed border-border bg-surface-subtle/50 p-8 sm:p-10 text-center flex flex-col items-center justify-center">
      {Icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded border border-border bg-card text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <h3 className="mt-3.5 text-sm font-semibold tracking-tight text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
      {(actionLabel || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {actionLabel && onAction && (
            <Button onClick={onAction} size="sm">
              {actionLabel}
            </Button>
          )}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
