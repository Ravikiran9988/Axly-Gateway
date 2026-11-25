import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Shared color tokens for Recharts series matched to dark & light Swiss Rail palettes.
 */
export const CHART_COLORS = {
  route: '#38BDF8',      // Sky-cyan primary throughput / active vector
  ok: '#22C55E',         // Signal emerald (success / healthy)
  warn: '#F59E0B',       // Signal amber (cooldown / latency warning)
  err: '#F43F5E',        // Signal crimson (errors / tripped)
  indigo: '#818CF8',     // Latency / model series
  slate: '#94A3B8',      // Secondary series
};

export const PROVIDER_PALETTE = [
  '#38BDF8',
  '#22C55E',
  '#F59E0B',
  '#818CF8',
  '#F43F5E',
  '#2DD4BF',
];

export function SwissChartTooltip({ active, payload, label, valueFormatter }) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded border border-border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      {label !== undefined && label !== null && (
        <div className="mb-1.5 border-b border-border pb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="inline-block h-2 w-2 rounded-[1px]"
                style={{ backgroundColor: entry.color || entry.fill }}
              />
              <span>{entry.name}</span>
            </span>
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {valueFormatter ? valueFormatter(entry.value, entry.name) : Number(entry.value ?? 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartPanel({ title, subtitle, rightMeta, className, children }) {
  return (
    <section className={cn('rounded border border-border bg-card flex flex-col', className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {rightMeta && (
          <div className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
            {rightMeta}
          </div>
        )}
      </div>
      <div className="p-4 sm:p-5 flex-1">{children}</div>
    </section>
  );
}
