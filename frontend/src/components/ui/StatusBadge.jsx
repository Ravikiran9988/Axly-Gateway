import React from 'react';
import { Badge } from './Badge';
import { cn } from '../../lib/utils';

export function StatusBadge({ status, labelOverride, className }) {
  if (!status) return null;

  const s = status.toLowerCase();

  switch (s) {
    case 'healthy':
    case 'closed':
    case 'active':
    case 'success':
    case 'operational':
    case 'ready':
      return (
        <Badge variant="success" className={cn('font-mono text-[10px] uppercase', className)}>
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-status-ok" aria-hidden="true" />
          {labelOverride || status.replace(/_/g, ' ').toUpperCase()}
        </Badge>
      );

    case 'rate_limited':
    case 'in_cooldown':
    case 'warning':
    case 'half_open':
    case 'recovering':
    case 'degraded':
      return (
        <Badge variant="warning" className={cn('font-mono text-[10px] uppercase', className)}>
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-status-warn" aria-hidden="true" />
          {labelOverride || status.replace(/_/g, ' ').toUpperCase()}
        </Badge>
      );

    case 'temporarily_unavailable':
    case 'quota_exhausted':
    case 'exhausted':
    case 'open':
    case 'failed':
    case 'error':
    case 'unhealthy':
    case 'authentication_failure':
    case 'permission_failure':
    case 'revoked':
      return (
        <Badge variant="destructive" className={cn('font-mono text-[10px] uppercase', className)}>
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-status-err" aria-hidden="true" />
          {labelOverride || status.replace(/_/g, ' ').toUpperCase()}
        </Badge>
      );

    case 'disabled':
    case 'inactive':
      return (
        <Badge variant="secondary" className={cn('font-mono text-[10px] uppercase text-muted-foreground', className)}>
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden="true" />
          {labelOverride || 'DISABLED'}
        </Badge>
      );

    default:
      return (
        <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', className)}>
          {labelOverride || status.toUpperCase()}
        </Badge>
      );
  }
}
