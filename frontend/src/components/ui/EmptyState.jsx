import React from 'react';
import { Card, CardContent } from './Card';
import { Button } from './Button';

export function EmptyState({
  icon: Icon,
  title,
  description,
  phase = 'Phase 2',
  actionLabel,
  onAction,
}) {
  return (
    <Card className="border-dashed bg-muted/10">
      <CardContent className="flex flex-col items-center justify-center p-12 text-center">
        {Icon && (
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground ring-1 ring-border">
            <Icon className="h-7 w-7" />
          </div>
        )}
        <h3 className="mt-4 text-base font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
        {phase && (
          <span className="mt-4 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            Scheduled for {phase}
          </span>
        )}
        {actionLabel && (
          <Button onClick={onAction} className="mt-6" size="sm">
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
