import React from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'rounded border border-border bg-card text-card-foreground',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div
      className={cn('flex flex-col space-y-1 p-4 sm:px-5 sm:py-4', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h3
      className={cn('font-semibold leading-snug tracking-tight text-sm sm:text-base text-foreground', className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }) {
  return (
    <p
      className={cn('text-xs text-muted-foreground leading-relaxed', className)}
      {...props}
    >
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn('p-4 pt-0 sm:px-5 sm:pb-5 sm:pt-0', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }) {
  return (
    <div
      className={cn('flex items-center p-4 pt-0 sm:px-5 sm:pb-5 sm:pt-0', className)}
      {...props}
    >
      {children}
    </div>
  );
}
