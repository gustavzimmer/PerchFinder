import type { DailyBucket } from "./Social.types";

export type AiAdviceReasonTag =
  | "historical-catches"
  | "weather-match"
  | "pressure-trend"
  | "time-of-day"
  | "seasonality";

export interface AiBiteSlot {
  startAtMs: number;
  endAtMs: number;
  biteScore: number; // 0-100
  confidence: number; // 0-1
  reasonTags: AiAdviceReasonTag[];
}

export interface AiCoachSignal {
  waterId: string;
  waterName: string;
  generatedAtMs: number;
  generatedForDate: string; // YYYY-MM-DD
  timezone: string;
  topLures: string[];
  topMethods: string[];
  slots: AiBiteSlot[];
  summary: string;
  modelVersion?: string | null;
  createdAt?: unknown;
}

export interface AiAdviceLog {
  uid: string;
  waterId: string;
  requestedAtMs: number;
  source: "manual" | "auto-refresh";
  acceptedSuggestion?: boolean | null;
  createdAt?: unknown;
}

export type LeagueVisibility = "invite-only" | "friends-only";
export type LeagueSeasonMode = "rolling-7d" | "calendar-week";
export type LeagueMemberRole = "owner" | "admin" | "member";

export interface LeagueRuleSet {
  seasonMode: LeagueSeasonMode;
  scoringBuckets: Record<DailyBucket, number>;
  allowNegativeEvents: boolean;
}

export interface League {
  name: string;
  nameLower: string;
  ownerUid: string;
  ownerDisplayName: string;
  visibility: LeagueVisibility;
  ruleSet: LeagueRuleSet;
  active: boolean;
  memberCount: number;
  createdAtMs: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LeagueMember {
  leagueId: string;
  uid: string;
  displayName: string;
  photoURL?: string | null;
  role: LeagueMemberRole;
  joinedAtMs: number;
  lastActiveAtMs?: number | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LeagueInvite {
  leagueId: string;
  fromUid: string;
  fromDisplayName: string;
  toUid: string;
  toDisplayName: string;
  status: "pending" | "accepted" | "declined" | "expired";
  createdAtMs: number;
  expiresAtMs: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LeagueWeeklyScore {
  leagueId: string;
  uid: string;
  weekKey: string; // e.g. 2026-W08
  points: number;
  totalCatches: number;
  counts: Record<DailyBucket, number>;
  updatedAtMs: number;
  updatedAt?: unknown;
}

export interface SessionReport {
  uid: string;
  waterId: string;
  waterName: string;
  startedAtMs: number;
  endedAtMs: number;
  durationMin: number;
  catchesCount: number;
  points: number;
  avgLengthCm?: number | null;
  avgWeightG?: number | null;
  weatherSummary?: string | null;
  pressureHpa?: number | null;
  bestLureLabel?: string | null;
  recommendation?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TackleLogEntry {
  uid: string;
  waterId: string;
  waterName: string;
  lureId?: string | null;
  lureBrand: string;
  lureName: string;
  lureSize: string;
  lureColor: string;
  method?: string | null;
  sampleSize: number;
  catchesCount: number;
  avgLengthCm?: number | null;
  lastCatchAtMs?: number | null;
  updatedAtMs: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}
