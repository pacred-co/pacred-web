// Public tracking — shared types for the no-login /track page (Task 2 · the
// GTM "ไม่ต้องโทรถาม" moat). Kept in a plain module (NOT the "use server"
// reader) because a "use server" file may only export async functions.

export type PublicTrackStage = {
  /** 1..7 — the customer-visible stage number. */
  step: number;
  label: string;
  /** Formatted Thai date the stage was reached, or null if not reached. */
  date: string | null;
  /** This stage is already completed. */
  done: boolean;
  /** This stage is the current (in-progress) one. */
  current: boolean;
};

export type PublicTrackFound = {
  found: true;
  /** The tracking number the lookup matched (echoes what the customer typed). */
  tracking: string;
  /** 1..7 (0 if the row had no parseable status). */
  statusCode: number;
  /** Public-neutral label of the current status. */
  statusLabel: string;
  /** Origin China warehouse city, or null. */
  warehouse: string | null;
  /** A coarse, non-committal ETA line, or null. */
  etaText: string | null;
  stages: PublicTrackStage[];
};

export type PublicTrackResult = { found: false } | PublicTrackFound;
