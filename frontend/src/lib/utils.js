import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString) {
  if (!dateString) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString));
  } catch (e) {
    return dateString;
  }
}

export function formatLatency(ms) {
  if (ms === null || ms === undefined || Number.isNaN(Number(ms))) return '—';
  const num = Math.round(Number(ms));
  if (num >= 1000) {
    return `${(num / 1000).toFixed(2)} s`;
  }
  return `${num} ms`;
}

export function formatCurrency(amount) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '$0.0000';
  return `$${Number(amount).toFixed(4)}`;
}
