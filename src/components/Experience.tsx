"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { deriveView } from "@/lib/harvest-view";
import { fmtDate, fmtNum, hourProfile, type HourProfile } from "@/lib/stats";
import type { Paddy } from "@/lib/terrain";
import type { Harvest } from "@/lib/types";
import Landscape, { type Focus, type Tint } from "./Landscape";
import { useOrigin, useTimeZone, useViewport } from "./useClient";
import s from "./experience.module.css";

const PLATES = ["I", "II", "III", "IV", "V", "VI", "VII"];

interface Step {
  key: string;
  label: string;
  focus: Focus;
  body: ReactNode;
}

function tintFor(h: HourProfile | null): Tint {
  if (!h) return null;
  return ({ "Night gardener": "night", "Dawn planter": "dawn", "Evening tender": "evening" } as Record<string, Tint>)[h.title] ?? "day";
}

function HourChart({ h }: { h: HourProfile }) {
  const max = Math.max(...h.hist, 1);
  return (
    <div className={s.hours} aria-label="Commits by hour of day">
      <div className={s.hourBars}>
        {h.hist.map((v, i) => (
          <span key={i} style={{ height: `${Math.max(3, (v / max) * 100)}%` }} data-peak={Math.abs(i - h.peak) <= 1 || Math.abs(i - h.peak) === 23} />
        ))}
      </div>
      <div className={s.hourAxis}>
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
}

export default function Experience({ harvest, years }: { harvest: Harvest; years: number[] }) {
  const { stats, terrain } = useMemo(() => deriveView(harvest), [harvest]);
  const [step, setStep] = useState(0);
  const [landed, setLanded] = useState(false);
  const [hover, setHover] = useState<{ p: Paddy; x: number; y: number } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const origin = useOrigin();
  const tz = useTimeZone();
  const vp = useViewport();
  // Hours depend on the viewer's timezone, so they're only computed in the browser.
  const hours = useMemo(() => (tz ? hourProfile(harvest.timestamps, tz) : null), [harvest.timestamps, tz]);
  const inset = useMemo(
    () => (!vp ? {} : vp.wide ? { left: 420 } : { bottom: Math.min(360, vp.height * 0.42) }),
    [vp?.wide, vp?.height], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const who = harvest.name ?? harvest.login;
  const yearQ = years[0] === harvest.year ? "" : `?year=${harvest.year}`;
  const pageUrl = `${origin}/${harvest.login}${yearQ}`;
  const cardUrl = `/card/${harvest.login}${yearQ}`;
  const indexOf = useMemo(() => new Map(harvest.days.map((d, i) => [d.date, i])), [harvest.days]);

  const steps: Step[] = useMemo(() => {
    const out: Step[] = [];
    const { season, busiest } = stats;

    out.push({
      key: "field",
      label: `@${harvest.login} in ${harvest.year}`,
      focus: {},
      body: (
        <>
          <p className={s.big}>{fmtNum(stats.total)}</p>
          <p className={s.unit}>public contributions in {harvest.year}</p>
          <p className={s.line}>
            {stats.activeDays === 0
              ? "No public contributions yet this year, so every paddy is bare earth."
              : `Active on ${stats.activeDays} of ${stats.elapsedDays} days so far. Each terrace is one week of your contribution graph and each paddy one day. Bare earth means no contributions; deeper green means more.`}
          </p>
        </>
      ),
    });

    if (season.length > 1 && season.start && season.end) {
      const ids: number[] = [];
      for (let i = indexOf.get(season.start)!; i <= indexOf.get(season.end)!; i++) ids.push(i);
      out.push({
        key: "season",
        label: "Longest growing season",
        focus: { highlight: ids, frame: ids },
        body: (
          <>
            <p className={s.big}>{season.length}</p>
            <p className={s.unit}>days in a row with at least one contribution</p>
            <p className={s.line}>
              {season.end === harvest.days.findLast((d) => d.count !== null)?.date
                ? `Running since ${fmtDate(season.start)} and still going.`
                : `${fmtDate(season.start)} to ${fmtDate(season.end)}.`}{" "}
              Those days are lit on the field.
            </p>
          </>
        ),
      });
    }

    if (hours) {
      out.push({
        key: "hours",
        label: "Working hours",
        focus: { tint: tintFor(hours) },
        body: (
          <>
            <p className={s.title}>{hours.title}</p>
            <HourChart h={hours} />
            <p className={s.line}>
              {hours.line} Peak hour: {String(hours.peak).padStart(2, "0")}:00 in your time zone.
            </p>
            <p className={s.fine}>Based on {fmtNum(hours.sample)} recent public commits</p>
          </>
        ),
      });
    }

    if (harvest.topRepo) {
      const r = harvest.topRepo;
      const ids = r.days.map((d) => indexOf.get(d)).filter((x): x is number => x !== undefined);
      out.push({
        key: "repo",
        label: "Most tended repo",
        focus: { highlight: ids },
        body: (
          <>
            <p className={s.title}>
              <a href={`https://github.com/${r.name}`} target="_blank" rel="noreferrer">
                {r.name.split("/")[1]}
              </a>
            </p>
            <p className={s.unit}>{fmtNum(r.commits)} commits this year</p>
            <p className={s.line}>
              The public repo you committed to most. Lit paddies are days you committed to it
              {r.days.length >= 100 ? " (your latest 100)" : ""}.
            </p>
          </>
        ),
      });
    }

    if (busiest?.count) {
      const idx = indexOf.get(busiest.date)!;
      out.push({
        key: "busiest",
        label: "Busiest day",
        focus: { marker: idx },
        body: (
          <>
            <p className={s.big}>{fmtNum(busiest.count)}</p>
            <p className={s.unit}>contributions on {fmtDate(busiest.date, true)}</p>
            <p className={s.line}>
              {stats.flooded.size > 1
                ? `Your biggest days are drawn as flooded paddies. There are ${stats.flooded.size} of them this year.`
                : "Your single biggest day of the year, drawn as a flooded paddy."}
            </p>
          </>
        ),
      });
    }

    out.push({
      key: "share",
      label: "Share",
      focus: {},
      body: null,
    });
    return out;
  }, [stats, harvest, hours, indexOf]);

  const go = useCallback((d: number) => setStep((i) => Math.max(0, Math.min(steps.length - 1, i + d))), [steps.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {}
  };

  const cur = steps[Math.min(step, steps.length - 1)];
  const readme = `[![My year in code, seen from above](${origin}${cardUrl})](${pageUrl})`;
  const tweet = `My ${harvest.year} on GitHub, drawn as terraced farmland: ${fmtNum(stats.total)} contributions, longest streak ${stats.season.length} days.`;

  return (
    <main className={s.root}>
      <Landscape
        terrain={terrain}
        flyover
        focus={landed ? cur.focus : undefined}
        inset={inset}
        onLanded={() => setLanded(true)}
        onHover={(p, x, y) => setHover(p ? { p, x, y } : null)}
      />

      <header className={s.top}>
        <Link href="/" className={s.brand}>
          Harvest
        </Link>
        <nav className={s.years}>
          {years.map((y) => (
            <Link key={y} href={y === years[0] ? `/${harvest.login}` : `/${harvest.login}?year=${y}`} data-on={y === harvest.year}>
              {y}
            </Link>
          ))}
        </nav>
      </header>

      {hover && hover.p.date && (
        <div className={s.tip} style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <span>{fmtDate(hover.p.date, true)}</span>
          {hover.p.count === null ? "upcoming" : hover.p.count === 0 ? "no contributions" : `${fmtNum(hover.p.count)} contributions`}
        </div>
      )}

      <section className={s.panel} data-shown={landed} aria-live="polite">
        <div className={s.panelHead}>
          <span>
            Plate {PLATES[step]} · {cur.label}
          </span>
          <span>{step + 1}/{steps.length}</span>
        </div>

        {cur.key === "share" ? (
          <div className={s.share}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cardUrl} alt={`Harvest card for ${who}`} width={1200} height={630} />
            <div className={s.actions}>
              <a className={s.primary} href={cardUrl} download={`harvest-${harvest.login}-${harvest.year}.png`}>
                Download card
              </a>
              <a
                href={`https://x.com/intent/post?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(pageUrl)}`}
                target="_blank"
                rel="noreferrer"
              >
                Post
              </a>
              <button onClick={() => copy("link", pageUrl)}>{copied === "link" ? "Copied" : "Copy link"}</button>
            </div>
            <button className={s.readme} onClick={() => copy("readme", readme)}>
              <span>{copied === "readme" ? "Copied. Paste it into your profile README." : "Add to your GitHub profile README"}</span>
              <code>{readme.length > 64 ? readme.slice(0, 62) + "…" : readme}</code>
            </button>
          </div>
        ) : (
          <div className={s.body} key={cur.key}>
            {cur.body}
          </div>
        )}

        <div className={s.nav}>
          <button onClick={() => go(-1)} disabled={step === 0} aria-label="Previous">
            ←
          </button>
          <div className={s.dots}>
            {steps.map((st, i) => (
              <button key={st.key} data-on={i === step} onClick={() => setStep(i)} aria-label={st.label} />
            ))}
          </div>
          {step < steps.length - 1 ? (
            <button className={s.next} onClick={() => go(1)}>
              {step === 0 ? "Continue" : "Next"} →
            </button>
          ) : (
            <Link className={s.next} href="/">
              Try another username →
            </Link>
          )}
        </div>
      </section>

      {!landed && <p className={s.surveying}>Drawing @{harvest.login}&rsquo;s field</p>}
    </main>
  );
}
