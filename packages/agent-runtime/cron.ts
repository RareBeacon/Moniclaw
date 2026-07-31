/**
 * Minimal, dependency-free 5-field cron matcher (minute hour dom month dow).
 *
 * Semantics follow POSIX cron:
 *  - `*`, lists (`1,2,3`), ranges (`1-5`), steps (`*\/5`, `0-30\/10`)
 *  - names for month (JAN..DEC) and day-of-week (SUN..SAT, three letters)
 *  - when BOTH dom and dow are restricted (not `*`), a date matches if
 *    EITHER field matches (the classic cron "or" rule)
 *  - dow accepts both 0 and 7 for Sunday
 *
 * Surfaces are pure — no I/O — so the matcher is directly unit-testable.
 */

export interface CronField {
  any: boolean;
  values: Set<number>;
}

export interface CronSchedule {
  minute: CronField;
  hour: CronField;
  dom: CronField;
  month: CronField;
  dow: CronField; // 0..6 (7 folded to 0)
  expr: string;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DOWS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function parseField(raw: string, min: number, max: number, names?: string[]): CronField {
  const field = raw.trim().toUpperCase();
  const values = new Set<number>();
  let any = false;

  for (const part of field.split(",")) {
    if (!part) throw new Error(`cron: empty list element in "${raw}"`);
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart !== undefined ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step < 1 || step > max - min + 1) {
      throw new Error(`cron: invalid step "${stepPart}" in "${raw}"`);
    }

    let lo: number, hi: number;
    if (rangePart === "*") {
      lo = min; hi = max; any = true;
    } else if (rangePart.includes("-")) {
      const [a, b] = rangePart.split("-");
      lo = resolve(a); hi = resolve(b);
    } else {
      lo = hi = resolve(rangePart);
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
      throw new Error(`cron: value out of range in "${raw}" (allowed ${min}-${max})`);
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return { any, values };

  function resolve(token: string): number {
    if (names) {
      const idx = names.indexOf(token);
      if (idx >= 0) return min + idx;
    }
    const n = Number(token);
    return Number.isInteger(n) ? n : NaN;
  }
}

export function parseCron(expr: string): CronSchedule {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`cron: expected 5 fields (minute hour dom month dow), got ${parts.length}`);
  }
  const dowRaw = parseField(parts[4], 0, 7, DOWS);
  // Fold 7 (Sunday) into 0.
  if (dowRaw.values.has(7)) {
    dowRaw.values.delete(7);
    dowRaw.values.add(0);
  }
  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dom: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12, MONTHS),
    dow: dowRaw,
    expr: expr.trim(),
  };
}

export function isValidCron(expr: string): boolean {
  try { parseCron(expr); return true; } catch { return false; }
}

/** Strict match at minute precision. */
export function cronMatches(schedule: CronSchedule, at: Date): boolean {
  const minute = at.getUTCMinutes();
  const hour = at.getUTCHours();
  const dom = at.getUTCDate();
  const month = at.getUTCMonth() + 1;
  const dow = at.getUTCDay();

  if (!schedule.minute.values.has(minute)) return false;
  if (!schedule.hour.values.has(hour)) return false;
  if (!schedule.month.values.has(month)) return false;

  // POSIX dom/dow "or" rule.
  if (!schedule.dom.any && !schedule.dow.any) {
    return schedule.dom.values.has(dom) || schedule.dow.values.has(dow);
  }
  return schedule.dom.values.has(dom) && schedule.dow.values.has(dow);
}

/**
 * Next fire time strictly after `after`, at minute precision.
 * Scans forward up to 366 days — deterministic and allocation-free enough
 * for scheduler tick use (worst realistic case ~527k iterations/yearly cron,
 * but yearly crons are rare; typical scans terminate within hours).
 */
export function nextCronRun(expr: string, after: Date): Date | null {
  const schedule = parseCron(expr);
  // Start at the next whole minute.
  const cursor = new Date(Math.floor(after.getTime() / 60_000) * 60_000 + 60_000);
  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    if (cronMatches(schedule, cursor)) return new Date(cursor);
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}

/**
 * Whether a run is due for `schedule`: the most recent fire time at or
 * before `now` is strictly after `lastFired` (or any fire exists when no
 * lastFired is known, bounded to lookbackMs to avoid bursts on first boot).
 */
export function cronDue(schedule: string, lastFired: Date | null, now: Date, lookbackMs = 3_600_000): Date | null {
  const parsed = parseCron(schedule);
  // Walk back minute-by-minute until we find the latest fire <= now.
  const cursor = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const earliest = Math.max(cursor.getTime() - lookbackMs, 0);
  while (cursor.getTime() >= earliest) {
    if (cronMatches(parsed, cursor)) {
      if (lastFired && cursor.getTime() <= lastFired.getTime()) return null;
      return new Date(cursor);
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() - 1);
  }
  return null;
}
