import { test } from "node:test";
import assert from "node:assert/strict";

import { cronDue, cronMatches, isValidCron, nextCronRun, parseCron } from "../packages/agent-runtime/cron";

test("parseCron validates field count and ranges", () => {
  assert.throws(() => parseCron("* * * *"), /5 fields/);
  assert.throws(() => parseCron("* * * * * *"), /5 fields/);
  assert.throws(() => parseCron("61 * * * *"), /out of range/);
  assert.throws(() => parseCron("* 25 * * *"), /out of range/);
  assert.throws(() => parseCron("* * 0 * *"), /out of range/);
  assert.throws(() => parseCron("* * * 13 *"), /out of range/);
  assert.throws(() => parseCron("* * * * 8"), /out of range/);
  assert.throws(() => parseCron("*/0 * * * *"), /step/);
  assert.throws(() => parseCron("5-1 * * * *"), /out of range/);
  assert.ok(isValidCron("*/15 9-17 * * MON-FRI"));
  assert.ok(!isValidCron("not a cron"));
});

test("cronMatches basics: wildcard, step, list, range", () => {
  const every5 = parseCron("*/5 * * * *");
  assert.ok(cronMatches(every5, new Date("2026-08-01T10:10:00Z")));
  assert.ok(!cronMatches(every5, new Date("2026-08-01T10:11:00Z")));

  const workHours = parseCron("0 9-17 * * *");
  assert.ok(cronMatches(workHours, new Date("2026-08-01T09:00:00Z")));
  assert.ok(!cronMatches(workHours, new Date("2026-08-01T09:30:00Z")));
  assert.ok(!cronMatches(workHours, new Date("2026-08-01T18:00:00Z")));

  const list = parseCron("0 8,12,18 * * *");
  assert.ok(cronMatches(list, new Date("2026-08-01T12:00:00Z")));
  assert.ok(!cronMatches(list, new Date("2026-08-01T13:00:00Z")));
});

test("month and weekday names, Sunday as 0 or 7", () => {
  const janSunday = parseCron("0 0 * JAN SUN");
  assert.ok(cronMatches(janSunday, new Date("2026-01-04T00:00:00Z"))); // a Sunday
  assert.ok(!cronMatches(janSunday, new Date("2026-02-01T00:00:00Z")));

  const sun7 = parseCron("0 0 * * 7");
  assert.ok(cronMatches(sun7, new Date("2026-08-02T00:00:00Z"))); // 2026-08-02 is a Sunday
  assert.ok(!cronMatches(sun7, new Date("2026-08-03T00:00:00Z")));

  const monFri = parseCron("30 9 * * MON-FRI");
  assert.ok(cronMatches(monFri, new Date("2026-08-03T09:30:00Z"))); // Monday
  assert.ok(cronMatches(monFri, new Date("2026-08-07T09:30:00Z"))); // Friday
  assert.ok(!cronMatches(monFri, new Date("2026-08-08T09:30:00Z"))); // Saturday
});

test("POSIX dom/dow OR rule when both are restricted", () => {
  const s = parseCron("0 0 1 * MON"); // 1st of month OR any Monday
  assert.ok(cronMatches(s, new Date("2026-08-01T00:00:00Z"))); // 1st (Saturday)
  assert.ok(cronMatches(s, new Date("2026-08-03T00:00:00Z"))); // Monday, not 1st
  assert.ok(!cronMatches(s, new Date("2026-08-04T00:00:00Z"))); // neither
});

test("nextCronRun finds precise future fire times", () => {
  const after = new Date("2026-08-01T10:07:30Z");
  assert.equal(nextCronRun("*/15 * * * *", after)?.toISOString(), "2026-08-01T10:15:00.000Z");
  assert.equal(nextCronRun("0 9 * * MON", after)?.toISOString(), "2026-08-03T09:00:00.000Z");
  assert.equal(nextCronRun("0 0 29 2 *", new Date("2027-01-01T00:00:00Z")), null); // no Feb 29 within a year
});

test("cronDue fires only once per slot and respects lastFired", () => {
  const now = new Date("2026-08-01T10:16:12Z");
  const due = cronDue("*/15 * * * *", null, now);
  assert.equal(due?.toISOString(), "2026-08-01T10:15:00.000Z");
  // Already fired for that slot → not due again.
  assert.equal(cronDue("*/15 * * * *", new Date("2026-08-01T10:15:30Z"), now), null);
  // Hourly cron checked 3 minutes late still reports its 10:00 slot.
  const hourly = cronDue("0 * * * *", new Date("2026-08-01T09:00:00Z"), now);
  assert.equal(hourly?.toISOString(), "2026-08-01T10:00:00.000Z");
  // Beyond lookback: first boot with hourly cron 2h stale → no burst.
  const staleNow = new Date("2026-08-01T12:30:00Z");
  assert.equal(cronDue("0 11 * * *", null, staleNow, 1_800_000), null);
});
