import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  EngagementConfig, 
  EngagementType, 
  ENGAGEMENT_CONFIG,
  DEFAULT_ORGANIC_SETTINGS
} from "@/lib/engagement-types";
import { 
  generateOrganicSchedule,
  formatDuration,
  getPeakLabel,
  FullOrganicConfig,
  OrganicRunConfig,
  PROVIDER_MINIMUMS
} from "@/lib/organic-algorithm";
import {
  buildCurveSchedule,
  buildProportionalSyncRuns,
  isViewLikeType,
  DEFAULT_DELIVERY_HOURS,
  SyncScheduleRun
} from "@/lib/organic-sync";
import { 
  ControlPoint, 
  curveToSchedule, 
  interpolateCurve 
} from "@/lib/curve-to-schedule";
import { Clock, TrendingUp, Zap, Timer, Calendar } from "lucide-react";

type Platform = 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'facebook';

interface DeliveryPreviewProps {
  engagements: Record<EngagementType, EngagementConfig>;
  refreshKey?: number;
  platform?: Platform;
  customCurvePoints?: Record<EngagementType, ControlPoint[]>;
  drawModeActive?: boolean;
  onScheduleChange?: (payload: {
    schedules: FullOrganicConfig[];
    customQuantities: Record<string, number>;
  }) => void;
}

interface TimelineEvent {
  id: string;
  time: Date;
  type: EngagementType;
  quantity: number;
  runNumber: number;
  peakLabel: string;
}

export function DeliveryPreview({ engagements, refreshKey = 0, platform = 'instagram', customCurvePoints, drawModeActive = false, onScheduleChange }: DeliveryPreviewProps) {
  const [customQuantities, setCustomQuantities] = useState<Record<string, number>>({});

  // Reset custom quantities when engagements, refreshKey, or curve changes
  useEffect(() => {
    setCustomQuantities({});
  }, [engagements, refreshKey, customCurvePoints]);

  const { timeline, schedules, stats, perTypeStats } = useMemo(() => {
    // Include refreshKey in the computation to trigger regeneration
    const _ = refreshKey;
    const enabledTypes = Object.entries(engagements)
      .filter(([_, config]) => config.enabled && config.quantity > 0)
      .map(([type, config]) => ({
        type: type as EngagementType,
        config,
      }));

    if (enabledTypes.length === 0) {
      return { timeline: [], schedules: [], stats: null, perTypeStats: [] };
    }

    const baseStartTime = new Date();

    // DELIVERY SEQUENCING: views first, every other type follows views progress
    const TYPE_PRIORITY: Partial<Record<EngagementType, number>> = {
      views: 0,
      likes: 1,
      comments: 2,
      custom_comments: 2,
      saves: 3,
      shares: 4,
      followers: 5,
      subscribers: 6,
      watch_hours: 7,
      retweets: 4,
      reposts: 5,
    };

    // Sort by priority so views are processed first
    const sortedTypes = [...enabledTypes].sort((a, b) =>
      (TYPE_PRIORITY[a.type] ?? 10) - (TYPE_PRIORITY[b.type] ?? 10)
    );

    // Resolve per-type inputs. A type runs on its OWN independent schedule
    // only when the user explicitly customized it (delivery time, forced run
    // count, or a hand-drawn curve); otherwise it syncs to views progress.
    const resolved = sortedTypes.map(({ type, config }) => {
      const rawTimeLimitHours = config.timeLimitHours ?? DEFAULT_ORGANIC_SETTINGS.timeLimitHours;
      const variancePercent = config.variancePercent ?? DEFAULT_ORGANIC_SETTINGS.variancePercent;
      const peakHoursEnabled = config.peakHoursEnabled ?? DEFAULT_ORGANIC_SETTINGS.peakHoursEnabled;
      const serviceMinimum = config.minQuantity || PROVIDER_MINIMUMS[type] || 10;
      const curvePoints = customCurvePoints?.[type];
      const customized =
        rawTimeLimitHours > 0 ||
        (config.runCount ?? 0) > 0 ||
        (drawModeActive && (curvePoints?.length ?? 0) >= 2);
      return { type, config, curvePoints, serviceMinimum, variancePercent, peakHoursEnabled, timeLimitHours: rawTimeLimitHours, customized };
    });

    const toOrganicRuns = (runs: SyncScheduleRun[]): OrganicRunConfig[] =>
      runs.map((run) => ({
        scheduledAt: run.scheduledAt,
        quantity: run.quantity,
        runNumber: run.runNumber,
        baseQuantity: run.quantity,
        varianceApplied: 0,
        peakMultiplier: 1,
        dayOfWeek: run.scheduledAt.getDay(),
        hourOfDay: run.scheduledAt.getHours(),
        sessionType: 'normal' as const,
        humanBehaviorScore: 85,
        patternBreaker: false,
      }));

    const toFullConfig = (type: string, quantity: number, runs: SyncScheduleRun[]): FullOrganicConfig => {
      const mapped = toOrganicRuns(runs);
      const totalDuration = mapped.length > 1
        ? mapped[mapped.length - 1].scheduledAt.getTime() - mapped[0].scheduledAt.getTime()
        : 0;
      return {
        engagementType: type,
        runs: mapped,
        totalDuration,
        totalQuantity: quantity,
        runCount: mapped.length,
        warnings: [] as string[],
        patternBreakCount: 0,
        avgHumanScore: 85,
        varietyIndex: 0.8,
      } as FullOrganicConfig;
    };

    // Independent per-type schedule (view-like types + explicitly customized
    // types): warm start + selected curve over the type's window (Auto = 48h).
    const buildIndependent = (r: (typeof resolved)[number]): FullOrganicConfig => {
      if (r.curvePoints && r.curvePoints.length >= 2) {
        const durationHours = r.timeLimitHours > 0 ? r.timeLimitHours : DEFAULT_DELIVERY_HOURS;
        const runCountHint = r.config.runCount && r.config.runCount > 0
          ? r.config.runCount
          : Math.min(30, Math.max(5, Math.ceil(r.config.quantity / r.serviceMinimum)));
        return toFullConfig(r.type, r.config.quantity, buildCurveSchedule({
          points: r.curvePoints,
          quantity: r.config.quantity,
          providerMin: r.serviceMinimum,
          durationHours,
          runCount: runCountHint,
          variancePercent: r.variancePercent,
          startTime: baseStartTime,
        }));
      }
      // Custom-draw mode before this type has a drawn curve: organic generator.
      return generateOrganicSchedule(
        r.type,
        r.config.quantity,
        r.variancePercent,
        r.peakHoursEnabled,
        baseStartTime,
        r.serviceMinimum,
        r.timeLimitHours > 0 ? r.timeLimitHours : DEFAULT_DELIVERY_HOURS,
        r.config.runCount && r.config.runCount > 0 ? r.config.runCount : undefined
      );
    };

    // 1) View-like types first: each gets its own warm-start curve schedule.
    const schedules: FullOrganicConfig[] = [];
    for (const r of resolved.filter(x => isViewLikeType(x.type))) {
      schedules.push(buildIndependent(r));
    }

    // Anchor: the primary views runs drive every non-customized type.
    const primaryViews = schedules.find(s => s.engagementType === 'views')
      ?? schedules.find(s => isViewLikeType(s.engagementType));
    const anchorRuns = (primaryViews?.runs ?? []).map(run => ({
      scheduledAt: run.scheduledAt,
      quantity: run.quantity,
    }));

    // 2) Non-view types: proportional sync to views unless explicitly customized.
    for (const r of resolved.filter(x => !isViewLikeType(x.type))) {
      if (!r.customized && anchorRuns.length > 0) {
        schedules.push(toFullConfig(r.type, r.config.quantity, buildProportionalSyncRuns({
          viewsRuns: anchorRuns,
          quantity: r.config.quantity,
          providerMin: r.serviceMinimum,
          variancePercent: r.variancePercent,
        })));
      } else {
        schedules.push(buildIndependent(r));
      }
    }

    // Merge all runs into a single timeline with unique IDs
    const allEvents: TimelineEvent[] = [];
    schedules.forEach(schedule => {
      schedule.runs.forEach(run => {
        const id = `${schedule.engagementType}-${run.runNumber}`;
        allEvents.push({
          id,
          time: run.scheduledAt,
          type: schedule.engagementType as EngagementType,
          quantity: customQuantities[id] ?? run.quantity,
          runNumber: run.runNumber,
          peakLabel: getPeakLabel(run.scheduledAt),
        });
      });
    });

    // Sort by time
    allEvents.sort((a, b) => a.time.getTime() - b.time.getTime());

    // Calculate stats with custom quantities
    const totalRuns = schedules.reduce((sum, s) => sum + s.runs.length, 0);
    const maxDuration = Math.max(...schedules.map(s => s.totalDuration));
    const totalEngagements = allEvents.reduce((sum, e) => sum + e.quantity, 0);

    // Per-type stats for summary
    const perTypeStats = schedules.map(schedule => {
      const config = engagements[schedule.engagementType as EngagementType];
      const finishTime = schedule.runs.length > 0 
        ? schedule.runs[schedule.runs.length - 1].scheduledAt 
        : baseStartTime;
      
      // Calculate actual total for this type with custom quantities
      const typeTotal = allEvents
        .filter(e => e.type === schedule.engagementType)
        .reduce((sum, e) => sum + e.quantity, 0);
        
      return {
        type: schedule.engagementType as EngagementType,
        runs: schedule.runs.length,
        duration: schedule.totalDuration,
        finishTime,
        timeLimitHours: config.timeLimitHours ?? 0,
        variancePercent: config.variancePercent ?? 25,
        peakHoursEnabled: config.peakHoursEnabled ?? false, // OFF by default
        totalQuantity: typeTotal,
      };
    });

    return {
      timeline: allEvents,
      schedules,
      stats: {
        totalRuns,
        totalDuration: maxDuration,
        totalEngagements,
        typesActive: enabledTypes.length,
      },
      perTypeStats,
    };
  }, [engagements, customQuantities, refreshKey, customCurvePoints]);

  useEffect(() => {
    onScheduleChange?.({ schedules, customQuantities });
  }, [schedules, customQuantities, onScheduleChange]);


  if (timeline.length === 0) {
    return null;
  }

  return (
    <Card className="border border-border bg-background">
      <CardHeader className="pb-3 px-3 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-foreground">
          <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-foreground shrink-0" />
          <span className="truncate">🌱 Per-Type Organic Delivery Preview</span>
        </CardTitle>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Each type has its own organic settings
        </p>
        <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-2">
          <Badge className="flex items-center gap-1 bg-foreground text-background font-bold text-xs">
            <Zap className="h-3 w-3" />
            {stats?.totalEngagements.toLocaleString()}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1 border-border text-foreground text-xs">
            <Timer className="h-3 w-3" />
            {stats?.totalRuns} runs
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1 border-border text-foreground text-xs">
            <Clock className="h-3 w-3" />
            ~{formatDuration(stats?.totalDuration || 0)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-6">
        {/* Per-type breakdown - Compact on mobile */}
        <div className="grid grid-cols-5 gap-1 sm:gap-2 mb-4">
          {perTypeStats.map(stat => {
            const config = ENGAGEMENT_CONFIG[stat.type];
            return (
              <div 
                key={stat.type}
                className="bg-secondary rounded-lg p-1.5 sm:p-2 text-center border border-border"
              >
                <span className="text-sm sm:text-lg">{config?.emoji}</span>
                <p className="text-[10px] sm:text-xs font-bold text-foreground">{stat.runs}</p>
                <p className="text-[8px] sm:text-[10px] text-muted-foreground hidden sm:block">
                  {stat.timeLimitHours > 0 ? `${stat.timeLimitHours}h` : 'Auto'}
                </p>
              </div>
            );
          })}
        </div>

        {/* Settings summary per type - hidden on mobile */}
        <div className="mb-4 p-3 bg-secondary rounded-lg border border-border hidden sm:block">
          <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Per-Type Settings
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {perTypeStats.map(stat => {
              const config = ENGAGEMENT_CONFIG[stat.type];
              return (
                <div key={stat.type} className="text-xs flex items-center gap-2">
                  <span>{config?.emoji}</span>
                  <span className="font-bold text-foreground">{config?.label}:</span>
                  <span className="text-muted-foreground">
                    {stat.timeLimitHours > 0 ? `${stat.timeLimitHours}h` : 'Auto'} 
                    {' · '}±{stat.variancePercent}%
                    {stat.peakHoursEnabled && ' · 🔥'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline dropdown removed per admin request — edit/schedule UI hidden from users */}
      </CardContent>
    </Card>
  );
}
