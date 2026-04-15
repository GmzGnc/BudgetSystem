export function fmt(n: number): string {
  if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `₺${(n / 1_000).toFixed(0)}K`;
  return `₺${n.toFixed(0)}`;
}

export function fmtShort(n: number): string {
  if (n === 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}B`;
  return n.toFixed(0);
}

export function fmtFull(n: number): string {
  return '₺' + n.toLocaleString('tr-TR');
}

export function pctTextColor(pct: number): string {
  return pct > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400';
}

export function sapamaColor(pct: number): string {
  if (pct < 20) return '#22c55e';
  if (pct < 25) return '#f59e0b';
  return '#ef4444';
}

export function sapamaStatus(pct: number): { label: string; cls: string } {
  if (pct < 20) return { label: 'Normal', cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' };
  if (pct < 25) return { label: 'Dikkat', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300' };
  return          { label: 'Kritik', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' };
}
