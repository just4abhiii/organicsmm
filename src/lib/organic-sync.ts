// Organic Synchronized Scheduling Core
// =====================================
// All engagement types deliver TOGETHER with views: as views arrive, each
// other type delivers the same cumulative percentage of its own total
// ("jitna views jaa rha hai, utna proportion me likes/comments/etc").
//
// Rules honoured here (Ahsan, 2026-11-08):
// - Default delivery window is 48 hours when a service's delivery time is
//   left on "Auto"; an explicit per-service time always wins.
// - Every type starts within minutes (warm start) — no multi-hour idle gap
//   before the first views/likes land.
// - Provider minimums are hard limits: a run is only emitted once the
//   proportional share accumulates to at least the provider minimum, so a
//   min-1 service (comments/reposts) goes 1-at-a-time while a min-10 service
//   (likes) accumulates until 10.
// - Order totals are never changed by scheduling or variance.
//
// Pure functions with injectable randomness so tests/vps can mirror them.

import { ControlPoint, curveToSchedule } from './curve-to-schedule';

// Default delivery window for any order when the user leaves a service's
// delivery time on "Auto".
export const DEFAULT_DELIVERY_HOURS = 48;

export interface SyncScheduleRun {
  runNumber: number;
  scheduledAt: Date;
  quantity: number;
}

// View-like types get their own curve schedule; every other type syncs to
// the primary views runs proportionally.
export const isViewLikeType = (t: string): boolean =>
  t === 'views' ||
  t === 'watch_hours' ||
  t === 'impressions' ||
  t === 'reach' ||
  t === 'plays' ||
  (t.startsWith('custom_') && t !== 'custom_comments');

export interface CurveScheduleInput {
  points: ControlPoint[];
  quantity: number;
  providerMin: number;
  durationHours: number;   // resolved window; <= 0 means DEFAULT_DELIVERY_HOURS
  runCount?: number;       // forced run count; 0/undefined = auto
  variancePercent: number; // ±% per-run deviation from the curve
  startTime: Date;
  rand?: () => number;
}

// Warm-start + curve schedule: a small starter run within minutes, then the
// remaining quantity follows the selected curve across the window. Slow-start
// curves (Curve 1/2) are left-translated so the first curve run lands shortly
// after the starter instead of idling for hours before reaching the provider
// minimum.
export function buildCurveSchedule(input: CurveScheduleInput): SyncScheduleRun[] {
  const rand = input.rand ?? Math.random;
  const { points, quantity, providerMin, variancePercent, startTime } = input;
  const durationHours = input.durationHours > 0 ? input.durationHours : DEFAULT_DELIVERY_HOURS;
  if (quantity <= 0) return [];

  const quickRun = (delayMin: number, qty: number, runNumber: number): SyncScheduleRun => ({
    runNumber,
    scheduledAt: new Date(startTime.getTime() + delayMin * 60000),
    quantity: qty,
  });

  // Tiny orders: a single quick run.
  if (quantity < providerMin * 2) {
    return [quickRun(3 + rand() * 7, quantity, 1)];
  }

  // Warm start: ~5% starter within minutes so delivery visibly starts fast.
  const starter = Math.max(providerMin, Math.ceil(quantity * 0.05));
  const starterDelay = 3 + rand() * 7;
  const runs: SyncScheduleRun[] = [quickRun(starterDelay, starter, 1)];

  const remaining = quantity - starter;
  const curveRuns = curveToSchedule(
    points,
    'views', // type only feeds the min fallback; the real minimum is passed explicitly
    remaining,
    durationHours,
    input.runCount && input.runCount > 0 ? input.runCount : 0,
    variancePercent,
    providerMin
  );

  if (curveRuns.length === 0) {
    runs.push(quickRun(starterDelay + 15 + rand() * 20, remaining, 2));
    return runs;
  }

  const windowMs = durationHours * 3600000;
  let times = curveRuns.map((r) => startTime.getTime() + (r.timePercent / 100) * windowMs);

  // Left-translate slow-start curves: the first curve run lands shortly after
  // the starter run, keeping the curve's shape and spacing for the rest.
  const firstTarget = startTime.getTime() + Math.max(15 * 60000, 0.03 * windowMs);
  const shift = times[0] - firstTarget;
  if (shift > 0) times = times.map((t) => t - shift);

  curveRuns.forEach((r, i) => {
    runs.push({ runNumber: runs.length + 1, scheduledAt: new Date(times[i]), quantity: r.quantity });
  });
  return runs;
}

export interface ProportionalSyncInput {
  viewsRuns: { scheduledAt: Date; quantity: number }[]; // sorted by time
  quantity: number;        // this type's total quantity
  providerMin: number;     // real provider/service minimum for this type
  variancePercent: number; // ±% jitter per emitted run; total never changes
  rand?: () => number;
}

// Proportional sync: emit a run whenever the type's proportional cumulative
// share (matched to views progress) accumulates to at least the provider
// minimum. Each run lands 0-8 minutes after the views run it tracks.
export function buildProportionalSyncRuns(input: ProportionalSyncInput): SyncScheduleRun[] {
  const rand = input.rand ?? Math.random;
  const { viewsRuns, quantity, providerMin, variancePercent } = input;
  if (quantity <= 0 || viewsRuns.length === 0) return [];

  if (quantity < providerMin) {
    // Below minimum: a single run mid-window (page clamps quantities up to
    // the provider minimum, so this is only a safety net).
    const mid = viewsRuns[Math.floor(viewsRuns.length / 2)].scheduledAt;
    return [{ runNumber: 1, scheduledAt: mid, quantity }];
  }

  const totalViews = viewsRuns.reduce((s, r) => s + r.quantity, 0);
  if (totalViews <= 0) {
    return [{ runNumber: 1, scheduledAt: viewsRuns[0].scheduledAt, quantity }];
  }

  const vf = Math.max(0, Math.min(1, variancePercent / 100));
  const runs: SyncScheduleRun[] = [];
  let emitted = 0;
  let cumViews = 0;

  for (let i = 0; i < viewsRuns.length; i++) {
    cumViews += viewsRuns[i].quantity;
    const targetCum = Math.round((cumViews / totalViews) * quantity);
    const isLast = i === viewsRuns.length - 1;
    let delta = isLast ? quantity - emitted : targetCum - emitted;
    if (delta <= 0) continue;
    if (delta < providerMin && !isLast) continue; // accumulate until the minimum
    // Short tail: merge a sub-minimum remainder into the previous run —
    // providers reject sub-minimum orders.
    if (delta < providerMin && isLast && runs.length > 0) {
      runs[runs.length - 1].quantity += delta;
      emitted += delta;
      break;
    }

    // Organic jitter from the service's Random variance setting; the final
    // run always takes exactly what is left so the total never changes.
    if (!isLast && vf > 0) {
      delta = Math.max(providerMin, delta + Math.round(delta * vf * (rand() * 2 - 1)));
      delta = Math.min(delta, quantity - emitted);
    }
    if (delta <= 0) continue;

    const jitterMs = rand() * 8 * 60000; // 0-8 min after the views run it tracks
    runs.push({
      runNumber: runs.length + 1,
      scheduledAt: new Date(viewsRuns[i].scheduledAt.getTime() + jitterMs),
      quantity: delta,
    });
    emitted += delta;
  }

  // Safety: any leftover goes to the last run (totals must stay exact).
  const leftover = quantity - emitted;
  if (leftover > 0) {
    if (runs.length > 0) {
      runs[runs.length - 1].quantity += leftover;
    } else {
      runs.push({ runNumber: 1, scheduledAt: viewsRuns[viewsRuns.length - 1].scheduledAt, quantity: leftover });
    }
  }

  return runs;
}
