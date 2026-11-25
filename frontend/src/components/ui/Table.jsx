import React from 'react';
import { cn } from '../../lib/utils';

export function Table({ className, children, ...props }) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-xs', className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ className, children, ...props }) {
  return (
    <thead className={cn('[&_tr]:border-b border-border bg-surface-subtle', className)} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({ className, children, ...props }) {
  return (
    <tbody className={cn('[&_tr:last-child]:border-0 divide-y divide-border', className)} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({ className, children, ...props }) {
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
        className
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHead({ className, children, ...props }) {
  return (
    <th
      className={cn(
        'h-9 px-4 text-left align-middle font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap',
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({ className, children, ...props }) {
  return (
    <td
      className={cn('px-4 py-2.5 align-middle', className)}
      {...props}
    >
      {children}
    </td>
  );
}
