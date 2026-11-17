import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businessHours, holidays, organizations } from "@/db/schema";

// Time-zone math without a library: find the offset Intl reports for an instant.
function offsetMs(instant: number, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(instant))
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(instant / 1000) * 1000;
}

/** The instant of a local wall-clock time in a time zone (handles daylight saving). */
export function zonedTime(y: number, m: number, d: number, h: number, min: number, timeZone: string) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const first = guess - offsetMs(guess, timeZone);
  return guess - offsetMs(first, timeZone);
}

function localDate(instant: number, timeZone: string) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant)).split("-").map(Number);
  return { y, m, d, iso: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "09:00:00" (how Postgres returns a time) -> [9, 0]. Exactly two numbers: they're spread into zonedTime. */
const hm = (t: string): [number, number] => {
  const [h, m] = t.split(":").map(Number);
  return [h || 0, m || 0];
};

type Schedule = { tz: string; hours: { dayOfWeek: number; opensAt: string; closesAt: string }[]; off: Set<string> };

/** The org's time zone, weekly hours and holidays (closed days). */
export async function loadSchedule(orgId: string): Promise<Schedule> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const hours = await db.select().from(businessHours).where(eq(businessHours.orgId, orgId));
  const off = new Set<string>((await db.select().from(holidays).where(eq(holidays.orgId, orgId))).map((h) => String(h.date)));
  return { tz: org.timezone, hours, off };
}

/** Open windows (start/end instants) for the local day containing `instant`. Closed days and holidays have none. */
function windowsOn(s: Schedule, instant: number) {
  const day = localDate(instant, s.tz);
  const list = s.off.has(day.iso) ? [] : s.hours.filter((h) => h.dayOfWeek === day.weekday);
  return {
    day,
    windows: list
      .sort((a, b) => a.opensAt.localeCompare(b.opensAt))
      .map((w) => ({ open: zonedTime(day.y, day.m, day.d, ...hm(w.opensAt), s.tz), close: zonedTime(day.y, day.m, day.d, ...hm(w.closesAt), s.tz) })),
    nextMidnight: zonedTime(day.y, day.m, day.d + 1, 0, 0, s.tz),
  };
}

/**
 * Adds business minutes to a start time: only open hours count, and closed days
 * (weekends you've unticked, holidays) are skipped entirely. With no business hours
 * set up, it's plain clock minutes.
 */
export async function addBusinessMinutes(orgId: string, start: Date, minutes: number, schedule?: Schedule) {
  const s = schedule ?? (await loadSchedule(orgId));
  if (s.hours.length === 0) return new Date(start.getTime() + minutes * 60_000);
  let cursor = start.getTime();
  let left = minutes * 60_000;
  for (let i = 0; i < 400; i++) {
    const { windows, nextMidnight } = windowsOn(s, cursor);
    for (const w of windows) {
      if (cursor >= w.close) continue;
      if (cursor < w.open) cursor = w.open;
      if (cursor + left <= w.close) return new Date(cursor + left);
      left -= w.close - cursor;
      cursor = w.close;
    }
    cursor = nextMidnight;
  }
  return new Date(cursor + left); // no business hours found within a year
}

/** Business minutes between two instants (0 if `to` is not after `from`). Closed days count as zero. */
export async function businessMinutesBetween(orgId: string, from: Date, to: Date, schedule?: Schedule) {
  if (to <= from) return 0;
  const s = schedule ?? (await loadSchedule(orgId));
  if (s.hours.length === 0) return Math.round((to.getTime() - from.getTime()) / 60_000);
  let cursor = from.getTime();
  const end = to.getTime();
  let total = 0;
  for (let i = 0; i < 400 && cursor < end; i++) {
    const { windows, nextMidnight } = windowsOn(s, cursor);
    for (const w of windows) {
      const a = Math.max(cursor, w.open);
      const b = Math.min(end, w.close);
      if (b > a) total += b - a;
    }
    cursor = nextMidnight;
  }
  return Math.round(total / 60_000);
}

/** The org-local calendar date (yyyy-mm-dd) of an instant. */
export const localDay = (instant: Date, timeZone: string) => localDate(instant.getTime(), timeZone).iso;
