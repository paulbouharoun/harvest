// PostHog telemetry (EU cloud). Cookieless: nothing is stored on the visitor's device.
// Events: $pageview / $pageleave (automatic), field_viewed, field_load_failed,
// card_downloaded, card_shared, link_clicked.
// Never pass a GitHub username or repo name as a property. The username is the URL
// path and is in the tab title, so both are rewritten on every event before it leaves
// the page: /someone becomes /[user].
import type { CaptureOptions, CaptureResult, PostHog } from "posthog-js";

type Props = Record<string, string | number | boolean>;

const browser = typeof window !== "undefined";
const local = browser && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
// Nothing is sent from a dev machine unless the page was opened with ?track=1.
const enabled = browser && (!local || /[?&]track=1/.test(location.search));

const scrubPath = (path: string) => (path === "/" || path === "" ? "/" : "/[user]");

function scrubUrl(value: string): string {
  try {
    const u = new URL(value);
    if (u.host !== location.host) return value;
    return u.origin + scrubPath(u.pathname) + u.search;
  } catch {
    return value;
  }
}

function scrub(bag: Record<string, unknown> | undefined) {
  if (!bag) return;
  for (const key of Object.keys(bag)) {
    const v = bag[key];
    if (key === "title") delete bag[key];
    else if (typeof v !== "string") continue;
    else if (/pathname$/.test(key)) bag[key] = scrubPath(v);
    else if (/^https?:/.test(v)) bag[key] = scrubUrl(v);
  }
}

function beforeSend(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  scrub(event.properties);
  scrub(event.$set);
  scrub(event.$set_once);
  return event;
}

let posthog: PostHog | null = null;
let queue: [string, Props | undefined, CaptureOptions | undefined][] = [];

if (enabled) {
  // Loaded on the side so a blocked or failed load never touches the app.
  import("posthog-js")
    .then((m) => {
      m.default.init("phc_yJbpfPFmYFdSnRnf63TjfnLiMoKow9kihqV43MV46C3Q", {
        api_host: "https://eu.i.posthog.com",
        persistence: "memory",
        person_profiles: "identified_only",
        autocapture: false,
        capture_pageview: true,
        capture_pageleave: true,
        disable_session_recording: true,
        // Extras the PostHog project can switch on remotely (they capture clicks, page
        // text and URLs): kept off here whatever the project settings say.
        capture_heatmaps: false,
        capture_dead_clicks: false,
        capture_performance: false,
        capture_exceptions: false,
        disable_surveys: true,
        before_send: beforeSend,
        // Runs before the first $pageview, so every event carries these.
        loaded: (ph) => ph.register({ site: "portfolio-apps", app: "harvest", test: local }),
      });
      posthog = m.default;
      queue.forEach(([event, props, options]) => track(event, props, options));
      queue = [];
    })
    .catch(() => undefined);
}

export function track(event: string, props?: Props, options?: CaptureOptions) {
  if (!enabled) return;
  try {
    if (posthog) posthog.capture(event, props, options);
    else queue.push([event, props, options]);
  } catch {
    // Telemetry must never break the app.
  }
}

/** Outbound link click. Pass a fixed label and an href with no username in it. */
export function trackLink(label: string, href: string) {
  track("link_clicked", { label, href }, { transport: "sendBeacon" });
}
