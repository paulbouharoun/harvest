import type { DayCount, Harvest } from "./types";

export interface Season {
  length: number;
  start: string | null;
  end: string | null;
}

export interface Stats {
  total: number;
  activeDays: number;
  elapsedDays: number;
  season: Season;
  busiest: DayCount | null;
  /** 0–4 intensity per day index; -1 for days still to come */
  levels: number[];
  /** day indexes that "flooded" — the big shipping days */
  flooded: Set<number>;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(iso: string, withWeekday = false) {
  const d = new Date(`${iso}T12:00:00Z`);
  const s = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  if (!withWeekday) return s;
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]} ${s}`;
}

export const fmtNum = (n: number) => n.toLocaleString("en-US");

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[i];
}

export function computeStats(h: Pick<Harvest, "days" | "total">): Stats {
  const { days } = h;
  let activeDays = 0;
  let elapsedDays = 0;
  let run = 0;
  let runStart = 0;
  let best: Season = { length: 0, start: null, end: null };
  let busiest: DayCount | null = null;

  days.forEach((d, i) => {
    if (d.count === null) return;
    elapsedDays++;
    if (d.count > 0) {
      activeDays++;
      if (run === 0) runStart = i;
      run++;
      if (run > best.length) best = { length: run, start: days[runStart].date, end: d.date };
      if (!busiest || d.count > (busiest.count ?? 0)) busiest = d;
    } else run = 0;
  });

  const nonzero = days.map((d) => d.count ?? 0).filter((c) => c > 0).sort((a, b) => a - b);
  const q1 = quantile(nonzero, 0.25);
  const q2 = quantile(nonzero, 0.5);
  const q3 = quantile(nonzero, 0.8);
  const levels = days.map((d) => {
    if (d.count === null) return -1;
    if (d.count === 0) return 0;
    if (d.count <= q1) return 1;
    if (d.count <= q2) return 2;
    if (d.count <= q3) return 3;
    return 4;
  });

  // Flooded paddies: the top ~2.5% of active days, never more than 9, and only
  // when they genuinely stand out from a typical day.
  const flooded = new Set<number>();
  if (nonzero.length >= 3) {
    const cutoff = Math.max(quantile(nonzero, 0.975), q2 * 2.5, 4);
    days
      .map((d, i) => ({ i, c: d.count ?? 0 }))
      .filter((x) => x.c >= cutoff)
      .sort((a, b) => b.c - a.c)
      .slice(0, 9)
      .forEach((x) => flooded.add(x.i));
  }

  return { total: h.total, activeDays, elapsedDays, season: best, busiest, levels, flooded };
}

export interface HourProfile {
  hist: number[]; // 24 buckets, local time
  peak: number;
  title: string;
  line: string;
  sample: number;
}

/** Buckets UTC timestamps into the viewer's local hours. */
export function hourProfile(timestamps: string[], timeZone?: string): HourProfile | null {
  if (timestamps.length < 8) return null;
  const hist = new Array(24).fill(0);
  const fmt = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone });
  for (const t of timestamps) hist[Number(fmt.format(new Date(t))) % 24]++;
  // Peak 3-hour window, wrapping midnight
  let peak = 0;
  let bestSum = -1;
  for (let h = 0; h < 24; h++) {
    const s = hist[(h + 23) % 24] + hist[h] + hist[(h + 1) % 24];
    if (s > bestSum) {
      bestSum = s;
      peak = h;
    }
  }
  const total = timestamps.length;
  const share = (from: number, to: number) => {
    let s = 0;
    for (let h = from; h !== to; h = (h + 1) % 24) s += hist[h];
    return s / total;
  };
  const night = share(22, 5);
  let title: string;
  let line: string;
  if (night >= 0.3 || peak >= 22 || peak <= 3) {
    title = "Night gardener";
    line = "A large share of your commits land between 10pm and 5am.";
  } else if (peak >= 4 && peak <= 8) {
    title = "Dawn planter";
    line = "Your commits cluster in the early morning, before 9am.";
  } else if (peak >= 17) {
    title = "Evening tender";
    line = "Most of your commits land in the evening, after 5pm.";
  } else {
    title = "Daylight farmer";
    line = "Most of your commits land during the working day.";
  }
  return { hist, peak, title, line, sample: total };
}

export function seedFrom(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
