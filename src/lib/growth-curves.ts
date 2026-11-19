// Organic Growth Curve Presets — mathematical delivery-curve models.
// The selected curve shapes the REAL delivery schedule: EngagementOrder samples
// the shape into control points (samplePresetControlPoints) and DeliveryPreview
// turns them into runs via curveToSchedule, honouring each service's delivery
// time, number of runs and random variance settings.

import { EngagementType } from './engagement-types';
import { ControlPoint } from './curve-to-schedule';
import {
  SERVICE_ORGANIC_CONFIGS,
  calculateOptimalRuns,
  detectServiceCategory,
  OrganicServiceConfig,
} from './organic-service-config';
import { PROVIDER_MINIMUMS } from './organic-algorithm';

export type CurvePresetId = 'whop-v1' | 'whop-v2' | 'whop-v3' | 'whop-v4' | 'custom';

export interface CurvePresetMeta {
  id: CurvePresetId;
  name: string;
  tagline: string;
  /** Cumulative delivered fraction (0..1) at position t (0..1) of the delivery window. */
  shape: (t: number) => number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// Classic smoothstep S-curve — gentle ease in and out.
const smoothstep = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

// Steeper smootherstep — sharper mid-window burst.
const smootherstep = (t: number) => {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

// Normalized logistic sigmoid (always exactly 0 at t=0 and 1 at t=1).
const sigmoid = (t: number, k: number, mid: number) => {
  const L = (x: number) => 1 / (1 + Math.exp(-k * (x - mid)));
  const l0 = L(0);
  const l1 = L(1);
  return clamp01((L(clamp01(t)) - l0) / (l1 - l0));
};

export const CURVE_PRESETS: CurvePresetMeta[] = [
  {
    id: 'whop-v1',
    name: 'Curve 1',
    tagline: 'Smooth gradual growth',
    shape: (t) => smoothstep(t),
  },
  {
    id: 'whop-v2',
    name: 'Curve 2',
    tagline: 'Slow start, rapid growth, then stabilization',
    shape: (t) => sigmoid(t, 9, 0.55),
  },
  {
    id: 'whop-v3',
    name: 'Curve 3',
    tagline: 'Delayed start, sharp growth burst, then flat ending',
    shape: (t) => smootherstep((clamp01(t) - 0.35) / 0.5),
  },
  {
    id: 'whop-v4',
    name: 'Curve 4',
    tagline: 'Consistent natural-looking gradual growth',
    shape: (t) => {
      const x = clamp01(t);
      return 0.72 * x + 0.28 * x * x;
    },
  },
];

export const getCurvePreset = (id: CurvePresetId): CurvePresetMeta =>
  CURVE_PRESETS.find((p) => p.id === id) ?? CURVE_PRESETS[0];

/** Sample a curve shape into points for mini previews (x: 0..1, y: 0..1). */
export function sampleCurvePoints(
  shape: (t: number) => number,
  samples = 32
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    pts.push({ x: t, y: clamp01(shape(t)) });
  }
  return pts;
}

/**
 * Sample a preset shape into draw-style control points (x: 0..100, y: 0..100)
 * so the selected curve drives the real delivery schedule via curveToSchedule.
 * Always starts at (0, 0) and ends at (100, 100) with monotonic y.
 */
export function samplePresetControlPoints(
  shape: (t: number) => number,
  type: EngagementType,
  samples = 10
): ControlPoint[] {
  const pts: ControlPoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    pts.push({
      id: `${type}-preset-${i}`,
      x: t * 100,
      y: clamp01(shape(t)) * 100,
      type,
    });
  }
  pts[0].y = 0;
  pts[pts.length - 1].y = 100;
  return pts;
}

// -------- deterministic seeded randomness (stable per config; no flicker) --------
export const hashString = (str: string): number => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// -------- service-aware delivery planning (grounded in real per-type config) --------

/** Map an engagement type to its organic service timing config. */
export function getServiceConfigForType(
  type: EngagementType,
  serviceName?: string
): OrganicServiceConfig {
  if (type === 'custom_comments') return SERVICE_ORGANIC_CONFIGS.comments;
  const direct = (SERVICE_ORGANIC_CONFIGS as Record<string, OrganicServiceConfig>)[
    type as string
  ];
  if (direct) return direct;
  // custom_<slug> types: detect the closest category from the service name/slug
  const category = detectServiceCategory(serviceName || '', String(type));
  return SERVICE_ORGANIC_CONFIGS[category];
}

export interface TypeDeliveryPlan {
  runs: number;
  durationMinutes: number;
}

/**
 * Estimate runs + duration for a type from its REAL settings:
 * - forced run count (runCount) wins, clamped so every run meets the provider minimum
 * - explicit time limit (timeLimitHours) wins over the auto estimate
 */
export function estimateTypePlan(
  type: EngagementType,
  quantity: number,
  minQuantity?: number,
  timeLimitHours?: number,
  runCount?: number,
  serviceName?: string
): TypeDeliveryPlan {
  const cfg = getServiceConfigForType(type, serviceName);
  const min = Math.max(1, minQuantity || PROVIDER_MINIMUMS[type as string] || 10);

  const maxPossibleRuns = Math.max(1, Math.floor(quantity / min));
  const runs =
    runCount && runCount > 0
      ? Math.max(1, Math.min(runCount, maxPossibleRuns))
      : calculateOptimalRuns(quantity, min, cfg);

  const autoMinutes = Math.max(
    30,
    Math.min(48 * 60, Math.round(runs * cfg.baseIntervalMinutes))
  );
  const durationMinutes =
    timeLimitHours && timeLimitHours > 0
      ? Math.max(15, Math.round(timeLimitHours * 60))
      : autoMinutes;

  return { runs, durationMinutes };
}

// Sequenced start offsets (minutes after the order starts) — views first,
// other types follow with realistic delays, mirroring the real delivery plan.
const TYPE_DELAY_MINUTES: Record<string, [number, number]> = {
  views: [0, 0],
  likes: [15, 45],
  comments: [30, 90],
  custom_comments: [30, 90],
  saves: [45, 120],
  shares: [35, 100],
  followers: [60, 150],
  subscribers: [50, 130],
  watch_hours: [20, 60],
  retweets: [25, 80],
  reposts: [30, 90],
};

export function estimateStartOffsetMinutes(
  type: EngagementType,
  rand: () => number
): number {
  const [min, max] = TYPE_DELAY_MINUTES[type as string] ?? [30, 90];
  return min + rand() * (max - min);
}

/**
 * Simulate a cumulative delivery series for the preview chart.
 * Follows the selected curve shape with small organic wobble on the
 * increments (never on the total): the series is always monotonic and
 * ends at exactly `quantity`.
 */
export function simulateCumulativeSeries(opts: {
  shape: (t: number) => number;
  quantity: number;
  samples: number;
  rand: () => number;
  wobble?: number;
}): number[] {
  const { shape, quantity, samples, rand, wobble = 0.35 } = opts;
  if (samples < 2) return new Array(Math.max(0, samples)).fill(0);
  if (quantity <= 0) return new Array(samples).fill(0);

  const increments: number[] = [];
  let prev = 0;
  for (let i = 1; i < samples; i++) {
    const cur = clamp01(shape(i / (samples - 1)));
    let d = Math.max(0, cur - prev);
    prev = cur;
    if (d > 0 && wobble > 0) {
      d *= 1 + (rand() - 0.5) * 2 * wobble;
      d = Math.max(0, d);
    }
    increments.push(d);
  }

  const total = increments.reduce((a, b) => a + b, 0) || 1;
  const out: number[] = [0];
  let acc = 0;
  for (let i = 0; i < increments.length; i++) {
    acc += (increments[i] / total) * quantity;
    out.push(i === increments.length - 1 ? quantity : Math.round(acc));
  }
  return out;
}
