import React from 'react';
import { cn } from '../../lib/utils';

export function Button({
  className,
  variant = 'default',
  size = 'md',
  disabled,
  children,
  type = 'button',
  ...props
}) {
  const baseStyles =
    'inline-flex items-center justify-center rounded text-xs font-semibold tracking-tight transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:opacity-45 disabled:pointer-events-none select-none';

  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90 border border-primary',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border',
    outline: 'border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground',
    ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 border border-destructive',
    link: 'text-route underline-offset-4 hover:underline p-0 h-auto font-medium',
  };

  const sizes = {
    sm: 'h-8 px-2.5 text-xs',
    md: 'h-9 px-3.5 text-xs',
    lg: 'h-10 px-5 text-sm',
    icon: 'h-8 w-8 p-0',
  };

  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
