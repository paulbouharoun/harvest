export interface DayCount {
  date: string; // YYYY-MM-DD
  /** null = this day hasn't happened yet */
  count: number | null;
}

export interface RepoTending {
  name: string; // owner/name
  commits: number;
  /** dates (YYYY-MM-DD) on which this repo received commits (most recent 100) */
  days: string[];
}

export interface Harvest {
  login: string;
  name: string | null;
  avatarUrl: string;
  year: number;
  days: DayCount[]; // every day of the year, Jan 1 → Dec 31
  total: number;
  topRepo: RepoTending | null;
  /** ISO UTC timestamps of public commits / pushes, for hour-of-day analysis */
  timestamps: string[];
  fetchedAt: string;
}
