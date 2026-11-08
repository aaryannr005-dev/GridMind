/**
 * Timeline-cursor helpers for replaying a completed engine run.
 *
 * A run produces a finite interval series; "playback" here steps a cursor over
 * that recorded series. It is review of real engine output, not a live
 * simulation, so no value is ever synthesized here.
 */

/** Extract "HH:MM" from an ISO engine timestamp, e.g. "2026-01-15T13:00:00+08:00". */
export function formatClock(timestamp: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(timestamp);
  return match ? `${match[2]}:${match[3]}` : null;
}

/** Extract the "YYYY-MM-DD" date part of an engine timestamp. */
export function formatDate(timestamp: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(timestamp);
  return match ? match[1] : null;
}

/**
 * Move the cursor by `delta` with wrap-around. A null cursor ("summary"
 * state) starts stepping from the first interval when moving forward and
 * from the last interval when moving backward.
 */
export function stepPlayhead(
  index: number | null,
  count: number,
  delta: number,
): number | null {
  if (count <= 0 || !Number.isInteger(delta)) return index;
  const base = index === null ? (delta > 0 ? -1 : 0) : index;
  const next = base + delta;
  const wrapped = ((next % count) + count) % count;
  return Math.min(count - 1, Math.max(0, wrapped));
}

/**
 * Clamp an externally supplied cursor so a stale index from a previous run
 * can never read past the current series.
 */
export function clampPlayhead(index: number | null, count: number): number | null {
  if (index === null) return null;
  if (count <= 0) return null;
  return Math.min(count - 1, Math.max(0, Math.round(index)));
}
