import "server-only";
import { cacheLife } from "next/cache";
import { cache } from "react";
import type { DayCount, Harvest, RepoTending } from "./types";

const GQL = "https://api.github.com/graphql";

export const USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

export class HarvestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function token() {
  const t = process.env.GITHUB_TOKEN;
  if (!t) throw new HarvestError("Server is missing GITHUB_TOKEN", 500);
  return t;
}

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
  { timeoutMs = 20000, retries = 1 } = {},
): Promise<T> {
  const res = await fetch(GQL, {
    signal: AbortSignal.timeout(timeoutMs),
    method: "POST",
    headers: {
      Authorization: `bearer ${token()}`,
      "Content-Type": "application/json",
      "User-Agent": "harvest-app",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status >= 500 && retries > 0) return gql<T>(query, variables, { timeoutMs, retries: retries - 1 });
  if (!res.ok) throw new HarvestError(`GitHub responded ${res.status}`, 502);
  type Body = { data?: T; errors?: { type?: string; message: string }[] };
  let json: Body;
  try {
    json = JSON.parse(await res.text()) as Body;
  } catch {
    // GitHub sometimes returns an empty 200 when a query runs long
    if (retries > 0) return gql<T>(query, variables, { timeoutMs, retries: retries - 1 });
    throw new HarvestError("GitHub took too long to answer", 504);
  }
  if (json.errors?.length && !json.data) {
    const notFound = json.errors.some((e) => e.type === "NOT_FOUND");
    throw new HarvestError(notFound ? "No such user" : json.errors[0].message, notFound ? 404 : 502);
  }
  return json.data as T;
}

const CALENDAR_QUERY = /* GraphQL */ `
  query ($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      login
      name
      avatarUrl(size: 160)
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }
      }
    }
  }
`;

const REPOS_QUERY = /* GraphQL */ `
  query ($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      id
      contributionsCollection(from: $from, to: $to) {
        commitContributionsByRepository(maxRepositories: 6) {
          repository { name nameWithOwner isPrivate owner { login } }
          contributions(first: 100) { totalCount nodes { occurredAt } }
        }
      }
    }
  }
`;

interface CalendarResponse {
  user: null | {
    login: string;
    name: string | null;
    avatarUrl: string;
    contributionsCollection: {
      contributionCalendar: {
        totalContributions: number;
        weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
      };
    };
  };
}

interface ReposResponse {
  user: null | {
    id: string;
    contributionsCollection: {
      commitContributionsByRepository: {
        repository: { name: string; nameWithOwner: string; isPrivate: boolean; owner: { login: string } };
        contributions: { totalCount: number; nodes: { occurredAt: string }[] };
      }[];
    };
  };
}

type Repo = { owner: string; name: string };

/** Commit timestamps from the default branch of the user's most-tended public repos. */
async function commitTimestamps(userId: string, repos: Repo[], from: string, to: string) {
  if (!repos.length) return [];
  const vars: Record<string, unknown> = { id: userId, from, to };
  const defs = ["$id: ID!", "$from: GitTimestamp!", "$to: GitTimestamp!"];
  const fields = repos.map((r, i) => {
    vars[`o${i}`] = r.owner;
    vars[`n${i}`] = r.name;
    defs.push(`$o${i}: String!`, `$n${i}: String!`);
    return `r${i}: repository(owner: $o${i}, name: $n${i}) {
      defaultBranchRef { target { ... on Commit {
        history(first: 100, author: { id: $id }, since: $from, until: $to) { nodes { committedDate } }
      } } }
    }`;
  });
  const query = `query (${defs.join(", ")}) { ${fields.join("\n")} }`;
  try {
    type R = { defaultBranchRef: { target: { history?: { nodes: { committedDate: string }[] } } } | null } | null;
    const data = await gql<Record<string, R>>(query, vars, { timeoutMs: 3500, retries: 0 });
    return Object.values(data ?? {}).flatMap(
      (r) => r?.defaultBranchRef?.target?.history?.nodes.map((n) => n.committedDate) ?? [],
    );
  } catch {
    return [];
  }
}

/** Public push events (REST, last ~90 days) — a fallback when commit history is thin. */
async function pushTimestamps(login: string, year: number) {
  try {
    const res = await fetch(`https://api.github.com/users/${login}/events/public?per_page=100`, {
      headers: { Authorization: `bearer ${token()}`, "User-Agent": "harvest-app" },
    });
    if (!res.ok) return [];
    const events = (await res.json()) as { type: string; created_at: string }[];
    return events
      .filter((e) => e.type === "PushEvent" && e.created_at.startsWith(String(year)))
      .map((e) => e.created_at);
  } catch {
    return [];
  }
}

function fullYear(year: number, known: Map<string, number>, today: string): DayCount[] {
  const out: DayCount[] = [];
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    out.push({ date, count: date > today ? null : (known.get(date) ?? 0) });
  }
  return out;
}

/** Repo detail and commit times are garnish: if GitHub is slow, serve the field without them. */
async function fetchGarnish(login: string, year: number, from: string, to: string) {
  try {
    const data = await gql<ReposResponse>(REPOS_QUERY, { login, from, to }, { timeoutMs: 6000, retries: 0 });
    const u = data.user;
    if (!u) return { topRepo: null, timestamps: await pushTimestamps(login, year) };
    // Public repositories only — private-repo detail is out of scope.
    const repos = u.contributionsCollection.commitContributionsByRepository.filter((r) => !r.repository.isPrivate);
    const top = repos[0];
    const topRepo: RepoTending | null = top
      ? {
          name: top.repository.nameWithOwner,
          commits: top.contributions.totalCount,
          days: top.contributions.nodes.map((n) => n.occurredAt.slice(0, 10)),
        }
      : null;
    const [commits, pushes] = await Promise.all([
      commitTimestamps(
        u.id,
        repos.slice(0, 4).map((r) => ({ owner: r.repository.owner.login, name: r.repository.name })),
        from,
        to,
      ),
      pushTimestamps(login, year),
    ]);
    return { topRepo, timestamps: commits.length >= 30 ? commits : [...commits, ...pushes] };
  } catch {
    return { topRepo: null, timestamps: await pushTimestamps(login, year) };
  }
}

async function fetchHarvest(login: string, year: number): Promise<Harvest> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const from = `${year}-01-01T00:00:00Z`;
  const end = new Date(`${year}-12-31T23:59:59Z`);
  const to = (end < now ? end : now).toISOString();

  const [data, garnish] = await Promise.all([
    gql<CalendarResponse>(CALENDAR_QUERY, { login, from, to }),
    fetchGarnish(login, year, from, to),
  ]);
  const user = data.user;
  if (!user) throw new HarvestError("No such user", 404);

  const cal = user.contributionsCollection.contributionCalendar;
  const known = new Map<string, number>();
  for (const w of cal.weeks) for (const d of w.contributionDays) known.set(d.date, d.contributionCount);

  return {
    login: user.login,
    name: user.name,
    avatarUrl: user.avatarUrl,
    year,
    days: fullYear(year, known, today),
    total: cal.totalContributions,
    topRepo: garnish.topRepo,
    timestamps: garnish.timestamps,
    fetchedAt: now.toISOString(),
  };
}

/** Shared across requests for an hour (errors are not cached). */
async function cachedHarvest(login: string, year: number): Promise<Harvest> {
  "use cache";
  cacheLife("hours");
  return fetchHarvest(login, year);
}

/** Validated, cached, and deduped within a request. */
export const getHarvest = cache(async (rawLogin: string, year?: number): Promise<Harvest> => {
  if (!USERNAME_RE.test(rawLogin)) throw new HarvestError("That isn't a GitHub username", 400);
  const current = new Date().getUTCFullYear();
  const y = year && year >= 2008 && year <= current ? year : current;
  try {
    return await cachedHarvest(rawLogin.toLowerCase(), y);
  } catch (e) {
    // errors thrown inside a cache scope lose their class; restore the status
    if (e instanceof HarvestError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("No such user")) throw new HarvestError("No such user", 404);
    throw new HarvestError(msg, 502);
  }
});

export function parseYear(v: string | string[] | undefined | null) {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) ? n : undefined;
}
