// Curve Preset Selector — Curve 1–4 + Custom curve cards with mini previews.
// The selected curve shapes the real delivery schedule (not just a preview).

import { useId } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Check, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CURVE_PRESETS,
  CurvePresetId,
  sampleCurvePoints,
} from '@/lib/growth-curves';

interface CurvePresetSelectorProps {
  selected: CurvePresetId;
  onSelect: (id: CurvePresetId) => void;
}

const STROKE = 'hsl(var(--primary))'; // site green — matches OrganicSMM branding

function MiniCurve({ shape, selected }: { shape: (t: number) => number; selected: boolean }) {
  const gradientId = useId();
  const W = 100;
  const H = 46;
  const pts = sampleCurvePoints(shape, 40);
  const toXY = (p: { x: number; y: number }) =>
    `${(4 + p.x * (W - 8)).toFixed(1)},${(H - 6 - p.y * (H - 14)).toFixed(1)}`;
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toXY(p)}`).join(' ');
  const area = `${line} L${W - 4},${H - 2} L4,${H - 2} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-14 sm:h-16"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={STROKE} stopOpacity={selected ? 0.35 : 0.22} />
          <stop offset="100%" stopColor={STROKE} stopOpacity={0.03} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={STROKE}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function CurvePresetSelector({ selected, onSelect }: CurvePresetSelectorProps) {
  return (
    <Card className="glass-card border-2 border-border overflow-hidden">
      <CardContent className="p-3 sm:p-5">
        <div className="mb-3 sm:mb-4">
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground">Curve</h2>
          <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5 leading-snug">
            How delivery is spread over time. The selected curve shapes your real delivery
            schedule — set time, runs &amp; variance per service above.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          {CURVE_PRESETS.map((preset) => {
            const isSelected = selected === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelect(preset.id)}
                aria-pressed={isSelected}
                className={cn(
                  'relative rounded-2xl border-2 p-2.5 sm:p-3 text-left transition-all duration-200',
                  'hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-[0_4px_16px_hsl(var(--primary)/0.18)]'
                    : 'border-border bg-secondary/40'
                )}
              >
                <MiniCurve shape={preset.shape} selected={isSelected} />
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <span className="text-xs sm:text-sm font-bold text-foreground truncate">
                    {preset.name}
                  </span>
                  {isSelected && (
                    <span className="shrink-0 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3.5} />
                    </span>
                  )}
                </div>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">
                  {preset.tagline}
                </p>
              </button>
            );
          })}

          {/* Custom curve — opens the draw editor */}
          <button
            type="button"
            onClick={() => onSelect('custom')}
            aria-pressed={selected === 'custom'}
            className={cn(
              'relative rounded-2xl border-2 p-2.5 sm:p-3 text-left transition-all duration-200',
              'hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              selected === 'custom'
                ? 'border-primary bg-primary/10 shadow-[0_4px_16px_hsl(var(--primary)/0.18)]'
                : 'border-dashed border-border bg-secondary/40'
            )}
          >
            <div className="w-full h-14 sm:h-16 rounded-xl bg-primary/10 flex items-center justify-center">
              <Pencil className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-1">
              <span className="text-xs sm:text-sm font-bold text-foreground truncate">Custom</span>
              {selected === 'custom' && (
                <span className="shrink-0 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3.5} />
                </span>
              )}
            </div>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">
              Draw your own growth curve
            </p>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
