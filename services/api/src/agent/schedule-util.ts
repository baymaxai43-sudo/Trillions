/** Offset (minutes) of `tz` from UTC at instant `d`. */
function tzOffset(d: Date, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - d.getTime()) / 60_000);
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface ScheduleSpec {
  kind: 'once' | 'interval' | 'daily';
  run_at?: string | null;
  every_minutes?: number | null;
  time_of_day?: string | null; // HH:MM
  timezone?: string | null;
}

/** Next fire time strictly after `from`, or null when a one-shot has passed. */
export function nextRun(s: ScheduleSpec, from = new Date()): Date | null {
  if (s.kind === 'once') {
    const t = s.run_at ? new Date(s.run_at) : null;
    return t && !isNaN(t.getTime()) && t > from ? t : null;
  }
  if (s.kind === 'interval') return new Date(from.getTime() + Math.max(15, s.every_minutes ?? 60) * 60_000);
  const tz = s.timezone && isValidTimezone(s.timezone) ? s.timezone : 'Africa/Lagos';
  const [hh, mm] = (s.time_of_day ?? '09:00').split(':').map(Number);
  const local = new Date(from.getTime() + tzOffset(from, tz) * 60_000); // wall clock as if UTC
  for (let add = 0; add < 3; add++) {
    const wall = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + add, hh, mm);
    const guess = new Date(wall - tzOffset(new Date(wall), tz) * 60_000);
    if (guess > from) return guess;
  }
  return null;
}
