/** Calendar helpers for the daily puzzle. Policy: dailies follow the player's local calendar date. */

export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dateFromKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysKey(dateKey: string, days: number): string {
  const d = dateFromKey(dateKey);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}
