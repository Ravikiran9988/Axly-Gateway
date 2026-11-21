import React from 'react';
import { Badge } from './Badge';

export function StatusBadge({ status, className }) {
  if (!status) return null;

  const s = status.toLowerCase();

  switch (s) {
    case 'healthy':
    case 'closed':
    case 'active':
    case 'success':
    case 'operational':
      return (
        <Badge variant="success" className={className}>
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {status.toUpperCase()}
        </Badge>
      );

    case 'rate_limited':
    case 'in_cooldown':
    case 'warning':
    case 'half_open':
    case 'recovering':
      return (
        <Badge variant="warning" className={className}>
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
          {status.replace('_', ' ').toUpperCase()}
        </Badge>
      );

    case 'temporarily_unavailable':
    case 'quota_exhausted':
    case 'open':
    case 'failed':
    case 'error':
    case 'authentication_failure':
    case 'permission_failure':
      return (
        <Badge variant="destructive" className={className}>
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
          {status.replace('_', ' ').toUpperCase()}
        </Badge>
      );

    case 'disabled':
    case 'inactive':
      return (
        <Badge variant="secondary" className={className}>
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground" />
          DISABLED
        </Badge>
      );

    default:
      return (
        <Badge variant="outline" className={className}>
          {status.toUpperCase()}
        </Badge>
      );
  }
}
