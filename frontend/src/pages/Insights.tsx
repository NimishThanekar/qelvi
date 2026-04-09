import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus as MinusIcon } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { logsApi, festivalsApi } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import type { ContextInsightFull, FestivalHistory } from "../types";
import { MEAL_CONTEXTS } from "../types";

// ── helpers ────────────────────────────────────────────────────────────────

const DAY_LABELS: Record<string, string> = {
  "0": "Mon", "1": "Tue", "2": "Wed",
  "3": "Thu", "4": "Fri", "5": "Sat", "6": "Sun",
};

function ctxColor(avgCal: number, goal: number) {
  const ratio = avgCal / goal;
  if (ratio <= 0.95) return "#34d399";
  if (ratio <= 1.1)  return "#fbbf24";
  return "#fb923c";
}

function ctxInfo(ctx: string) {
  return MEAL_CONTEXTS.find((c) => c.value === ctx) ?? { label: ctx, emoji: "📍" };
}

// ── PaywallOverlay ─────────────────────────────────────────────────────────

function PaywallOverlay() {
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl"
      style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(10,10,10,0.95) 30%)" }}
    >
      <div className="text-center px-6">
        <div className="text-3xl mb-3">🔒</div>
        <p className="text-base font-semibold text-text-primary mb-1">Pro feature</p>
        <p className="text-xs text-text-muted mb-4 max-w-xs">
          Full context breakdown with trends, charts, and day-of-week patterns is available on Pro.
        </p>
        <a
          href="/upgrade"
          className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ backgroundColor: "#a78bfa", color: "#fff" }}
        >
          Upgrade to Pro
        </a>
      </div>
    </div>
  );
}

// ── Hero banner ────────────────────────────────────────────────────────────

function HeroBanner({ insights, goal }: { insights: ContextInsightFull[]; goal: number }) {
  const eligible = insights.filter((i) => i.count >= 3 && i.vs_home_delta !== null);
  if (eligible.length < 2) return null;

  const home = insights.find((i) => i.context === "home");
  if (!home) return null;

  // Most extreme non-home context (highest positive delta)
  const extreme = eligible
    .filter((i) => i.context !== "home" && (i.vs_home_delta ?? 0) > 0)
    .sort((a, b) => (b.vs_home_delta ?? 0) - (a.vs_home_delta ?? 0))[0];

  if (!extreme) return null;

  const ctx = ctxInfo(extreme.context);
  const ratio = (extreme.avg_calories / home.avg_calories).toFixed(1);
  const offsetDays = Math.max(1, Math.round(extreme.avg_calories / home.avg_calories));
  const isOverGoal = extreme.avg_calories > goal;

  return (
    <div
      className="mb-5 rounded-2xl p-5 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(251,146,60,0.12) 0%, rgba(251,146,60,0.04) 100%)",
        border: "1px solid rgba(251,146,60,0.25)",
      }}
    >
      {/* Ambient glow */}
      <div
        className="absolute -top-6 -right-6 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(251,146,60,0.18) 0%, transparent 70%)" }}
      />
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "#fb923c" }}>
        {ctx.emoji} Your biggest pattern
      </p>
      <p className="text-base font-semibold text-text-primary leading-snug mb-1">
        Your {ctx.label.toLowerCase()} meals average{" "}
        <span style={{ color: "#fb923c" }}>{extreme.avg_calories} kcal</span>
        {" "}— that's {ratio}× your home baseline.
      </p>
      {isOverGoal && (
        <p className="text-xs text-text-muted mt-1">
          Even one {ctx.label.toLowerCase()} day offsets{" "}
          <span className="font-medium text-text-primary">{offsetDays} good home days</span>{" "}
          of calorie tracking.
        </p>
      )}
      <p className="text-[10px] text-text-muted mt-2 opacity-70">Based on last 30 days</p>
    </div>
  );
}

// ── Horizontal bar chart ───────────────────────────────────────────────────

interface ChartRow { label: string; emoji: string; calories: number; goal: number; }

function ContextBarChart({ insights, goal }: { insights: ContextInsightFull[]; goal: number }) {
  const data: ChartRow[] = insights.map((i) => {
    const c = ctxInfo(i.context);
    return { label: c.label, emoji: c.emoji, calories: i.avg_calories, goal };
  });

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload as ChartRow;
    return (
      <div
        className="rounded-xl px-3 py-2 text-xs shadow-lg"
        style={{ background: "var(--bg-elevated, #181818)", border: "1px solid #242424" }}
      >
        <p className="font-semibold text-text-primary">{d.emoji} {d.label}</p>
        <p style={{ color: ctxColor(d.calories, goal) }}>{d.calories} kcal avg</p>
      </div>
    );
  };

  return (
    <div className="card p-4 mb-4">
      <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">
        Average calories by context
      </p>
      <ResponsiveContainer width="100%" height={data.length * 44 + 8}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
          <XAxis
            type="number"
            domain={[0, Math.max(...data.map((d) => d.calories)) * 1.15]}
            tick={{ fill: "#666", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={80}
            tick={{ fill: "#888", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <ReferenceLine
            x={goal}
            stroke="#666"
            strokeDasharray="3 3"
            label={{ value: "Goal", position: "insideTopRight", fill: "#666", fontSize: 9 }}
          />
          <Bar dataKey="calories" radius={[0, 6, 6, 0]} maxBarSize={28}>
            {data.map((entry, i) => (
              <Cell key={i} fill={ctxColor(entry.calories, goal)} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Trend badge ────────────────────────────────────────────────────────────

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const abs = Math.abs(pct);
  if (abs < 2) {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-text-muted">
        <MinusIcon size={10} /> Stable
      </span>
    );
  }
  const up = pct > 0;
  return (
    <span
      className="flex items-center gap-0.5 text-[10px] font-medium"
      style={{ color: up ? "#fb923c" : "#34d399" }}
    >
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? "+" : "-"}{abs}% vs last month
    </span>
  );
}

// ── Day-of-week mini bars ──────────────────────────────────────────────────

function DowCalBars({ dow, goal }: { dow: Record<string, number>; goal: number }) {
  const days = ["0", "1", "2", "3", "4", "5", "6"];
  const max = Math.max(...days.map((d) => dow[d] ?? 0), 1);
  return (
    <div className="flex items-end gap-1" style={{ height: 40 }}>
      {days.map((d) => {
        const val = dow[d];
        if (!val) return (
          <div key={d} className="flex-1 flex flex-col items-center gap-0.5 justify-end">
            <div className="w-full rounded-sm bg-bg-elevated" style={{ height: 3 }} />
            <span className="text-[8px] text-text-muted">{DAY_LABELS[d]}</span>
          </div>
        );
        const h = Math.max((val / max) * 28, 4);
        return (
          <div key={d} className="flex-1 flex flex-col items-center gap-0.5 justify-end">
            <div
              className="w-full rounded-sm"
              style={{ height: h, backgroundColor: ctxColor(val, goal), opacity: 0.85 }}
            />
            <span className="text-[8px] text-text-muted">{DAY_LABELS[d]}</span>
          </div>
        );
      })}
    </div>
  );
}

function DowFreqDots({ counts }: { counts: Record<string, number> }) {
  const days = ["0", "1", "2", "3", "4", "5", "6"];
  const max = Math.max(...days.map((d) => counts[d] ?? 0), 1);
  return (
    <div className="flex gap-1">
      {days.map((d) => {
        const n = counts[d] ?? 0;
        const opacity = n === 0 ? 0.15 : 0.3 + (n / max) * 0.7;
        return (
          <div key={d} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className="w-full rounded-sm"
              style={{ height: 8, backgroundColor: "#3B7BFF", opacity }}
            />
            <span className="text-[8px] text-text-muted">{DAY_LABELS[d]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Context card ───────────────────────────────────────────────────────────

function ContextCard({ insight, goal, isWorst, isBest }: {
  insight: ContextInsightFull;
  goal: number;
  isWorst: boolean;
  isBest: boolean;
}) {
  const ctx = ctxInfo(insight.context);
  const accent = ctxColor(insight.avg_calories, goal);

  return (
    <div className="card p-4 relative">
      {(isWorst || isBest) && (
        <span
          className="absolute top-3 right-3 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: isWorst ? "rgba(251,146,60,0.12)" : "rgba(52,211,153,0.12)",
            color: isWorst ? "#fb923c" : "#34d399",
          }}
        >
          {isWorst ? "⚠ Riskiest" : "✓ Best spot"}
        </span>
      )}

      {/* Header row */}
      <div className="flex items-start gap-2.5 mb-3">
        <span className="text-2xl mt-0.5">{ctx.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">{ctx.label}</p>
          <p className="text-xs text-text-muted">{insight.days_with_context} days · {insight.count} meals</p>
          <div className="mt-1">
            <TrendBadge pct={insight.trend_pct} />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-bg-elevated rounded-xl p-2.5 text-center">
          <p className="text-[10px] text-text-muted mb-0.5">Avg / day</p>
          <p className="text-sm font-bold" style={{ color: accent }}>{insight.avg_calories}</p>
          <p className="text-[9px] text-text-muted">kcal</p>
        </div>
        <div className="bg-bg-elevated rounded-xl p-2.5 text-center">
          <p className="text-[10px] text-text-muted mb-0.5">Over goal</p>
          <p className="text-sm font-bold" style={{ color: accent }}>{insight.over_goal_pct}%</p>
          <p className="text-[9px] text-text-muted">of days</p>
        </div>
        <div className="bg-bg-elevated rounded-xl p-2.5 text-center">
          <p className="text-[10px] text-text-muted mb-0.5">vs Home</p>
          {insight.vs_home_delta !== null ? (
            <>
              <p className="text-sm font-bold" style={{ color: insight.vs_home_delta > 0 ? "#fb923c" : "#34d399" }}>
                {insight.vs_home_delta > 0 ? "+" : ""}{insight.vs_home_delta}
              </p>
              <p className="text-[9px] text-text-muted">kcal</p>
            </>
          ) : (
            <p className="text-sm font-bold text-text-muted">—</p>
          )}
        </div>
      </div>

      {/* Calorie by day of week */}
      {Object.keys(insight.day_of_week).length >= 2 && (
        <div className="mb-3">
          <p className="text-[10px] text-text-muted mb-1.5">
            Calories by weekday
            {insight.peak_day && (
              <span className="ml-1.5" style={{ color: "#fb923c" }}>
                · peaks on {insight.peak_day}s
              </span>
            )}
          </p>
          <DowCalBars dow={insight.day_of_week} goal={goal} />
        </div>
      )}

      {/* Frequency by day of week */}
      {Object.keys(insight.day_of_week_count).length >= 2 && (
        <div className="mb-3">
          <p className="text-[10px] text-text-muted mb-1.5">How often you eat here by day</p>
          <DowFreqDots counts={insight.day_of_week_count} />
        </div>
      )}

      {/* Top foods */}
      {insight.top_foods.length > 0 && (
        <div>
          <p className="text-[10px] text-text-muted mb-1.5">Most logged here</p>
          <div className="flex flex-wrap gap-1">
            {insight.top_foods.map((f) => (
              <span
                key={f}
                className="text-[10px] px-2 py-0.5 rounded-full bg-bg-elevated text-text-secondary"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Festival History helpers ───────────────────────────────────────────────

function festivalInsightText(h: FestivalHistory): string {
  const year = new Date(h.start_date).getFullYear();
  const name = h.festival_name;

  if (h.delta_pct === null || h.avg_before === null) {
    if (h.avg_during < 1400) {
      const pctBelow = Math.round((1 - h.avg_during / 2000) * 100);
      return `${name} ${year} fasting averaged ${h.avg_during} kcal/day — ${pctBelow}% below typical intake.`;
    }
    return `You averaged ${h.avg_during} kcal/day during ${name} ${year}.`;
  }

  const pct = Math.round(Math.abs(h.delta_pct));

  if (h.delta_pct <= -10) {
    return `This ${name} you ate ${pct}% less than the baseline — great control! 🎯`;
  }
  if (h.delta_pct <= 5) {
    return `${name} ${year} — you maintained your usual intake. Solid discipline! 👏`;
  }
  if (h.excess_calories && h.delta_pct <= 25) {
    return `${name} added ~${Math.round(h.excess_calories).toLocaleString()} extra kcal — a moderate indulgence.`;
  }
  if (h.excess_calories) {
    return `${name} added ~${Math.round(h.excess_calories).toLocaleString()} extra kcal. Watch the pattern next year! 💪`;
  }
  return `You ate ${pct}% more than usual during ${name} ${year}.`;
}

function deltaColor(delta: number | null): string {
  if (delta === null) return "#94a3b8";
  if (delta <= 5) return "#34d399";
  if (delta <= 20) return "#fb923c";
  return "#f87171";
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const sm = months[s.getMonth()];
  const em = months[e.getMonth()];
  const sy = s.getFullYear();
  const ey = e.getFullYear();
  if (sy === ey && sm === em) return `${sm} ${s.getDate()}–${e.getDate()}, ${sy}`;
  if (sy === ey) return `${sm} ${s.getDate()} – ${em} ${e.getDate()}, ${sy}`;
  return `${sm} ${s.getDate()}, ${sy} – ${em} ${e.getDate()}, ${ey}`;
}

/** Mini two-bar comparison: Before vs During */
function FestivalCalBars({ h, goal }: { h: FestivalHistory; goal: number }) {
  const during = h.avg_during;
  const before = h.avg_before;
  const maxVal = Math.max(during, before ?? 0, goal, 1);
  const duringPct = Math.min((during / maxVal) * 100, 100);
  const beforePct = before !== null ? Math.min((before / maxVal) * 100, 100) : 0;
  const dc = deltaColor(h.delta_pct);

  return (
    <div className="space-y-1.5">
      {before !== null && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted w-12 flex-shrink-0">Before</span>
          <div className="flex-1 bg-bg-border rounded-full h-2">
            <div className="h-2 rounded-full bg-[#475569]" style={{ width: `${beforePct}%` }} />
          </div>
          <span className="text-[10px] text-text-muted w-14 text-right flex-shrink-0">{before} kcal</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-text-muted w-12 flex-shrink-0">During</span>
        <div className="flex-1 bg-bg-border rounded-full h-2">
          <div className="h-2 rounded-full" style={{ width: `${duringPct}%`, backgroundColor: dc }} />
        </div>
        <span className="text-[10px] font-medium w-14 text-right flex-shrink-0" style={{ color: dc }}>
          {during} kcal
        </span>
      </div>
    </div>
  );
}

function FestivalHistoryCard({ h, yoyText, goal }: { h: FestivalHistory; yoyText?: string; goal: number }) {
  const dc = deltaColor(h.delta_pct);
  const insightText = festivalInsightText(h);

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl flex-shrink-0">{h.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-text-primary">{h.festival_name}</p>
            {h.delta_pct !== null && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: dc + "18", color: dc }}
              >
                {h.delta_pct > 0 ? "+" : ""}{Math.round(h.delta_pct)}% vs baseline
              </span>
            )}
          </div>
          <p className="text-[10px] text-text-muted mt-0.5">{formatDateRange(h.start_date, h.end_date)}</p>
          <p className="text-[10px] text-text-muted">{h.days_logged} day{h.days_logged !== 1 ? "s" : ""} logged</p>
        </div>
      </div>

      {/* Mini bars */}
      <FestivalCalBars h={h} goal={goal} />

      {/* Insight line */}
      <p className="text-xs text-text-muted mt-3 leading-snug">{insightText}</p>

      {/* Year-over-year comparison */}
      {yoyText && (
        <p className="text-[10px] mt-2 px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: "#34d39912", color: "#34d399" }}>
          {yoyText}
        </p>
      )}
    </div>
  );
}

/** Compute year-over-year comparison strings keyed by festival_id */
function buildYoyMap(history: FestivalHistory[]): Map<string, string> {
  const map = new Map<string, string>();
  const grouped: Record<string, FestivalHistory[]> = {};

  history.forEach((h) => {
    const key = h.festival_name.toLowerCase();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(h);
  });

  for (const entries of Object.values(grouped)) {
    if (entries.length < 2) continue;
    entries.sort((a, b) => b.start_date.localeCompare(a.start_date));
    const latest = entries[0];
    const prior = entries[1];

    if (latest.delta_pct === null || prior.delta_pct === null) continue;
    const latestYear = new Date(latest.start_date).getFullYear();
    const priorYear = new Date(prior.start_date).getFullYear();
    const diff = Math.round(latest.delta_pct - prior.delta_pct);

    let text: string;
    if (diff <= -8) {
      text = `${latest.festival_name} ${latestYear} vs ${priorYear}: You ate ${Math.abs(diff)}% less this year 🎉`;
    } else if (diff >= 8) {
      text = `${latest.festival_name} ${latestYear} vs ${priorYear}: You ate ${diff}% more than last year.`;
    } else {
      text = `${latest.festival_name} ${latestYear} vs ${priorYear}: Similar intake to last year.`;
    }
    map.set(latest.festival_id, text);
  }

  return map;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function Insights() {
  const { user } = useAuthStore();
  const [insights, setInsights] = useState<ContextInsightFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [festHistory, setFestHistory] = useState<FestivalHistory[]>([]);
  const [festLoading, setFestLoading] = useState(true);

  const isPro = user?.is_pro ?? false;
  const goal = user?.calorie_goal ?? 2000;

  useEffect(() => {
    logsApi.contextInsights()
      .then((r) => setInsights(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
    festivalsApi.history()
      .then((r) => setFestHistory(r.data))
      .catch(() => {})
      .finally(() => setFestLoading(false));
  }, []);

  const eligible = insights.filter((i) => i.count >= 2);
  const worst = eligible.length >= 2
    ? eligible.reduce((a, b) => (a.over_goal_pct > b.over_goal_pct ? a : b))
    : null;
  const best = eligible.length >= 2
    ? eligible.reduce((a, b) => (a.over_goal_pct < b.over_goal_pct ? a : b))
    : null;

  const yoyMap = buildYoyMap(festHistory);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto pb-20 md:pb-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-text-primary">Context Insights</h1>
        <p className="text-xs text-text-muted mt-0.5">
          How your eating environment affects your calories — last 30 days
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-muted text-sm">
          Loading…
        </div>
      ) : insights.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-3xl mb-3">📍</p>
          <p className="text-sm font-medium text-text-primary mb-1">No context data yet</p>
          <p className="text-xs text-text-muted">
            Select a context (Home, Office, Restaurant…) when logging meals to unlock insights.
          </p>
        </div>
      ) : (
        <>
          {/* Hero banner — visible to everyone */}
          <HeroBanner insights={insights} goal={goal} />

          {/* Pro-gated content */}
          <div className="relative">
            <div
              className={!isPro ? "pointer-events-none select-none" : ""}
              style={!isPro ? { filter: "blur(2px)", opacity: 0.55 } : {}}
            >
              {/* Horizontal bar chart */}
              <ContextBarChart insights={insights} goal={goal} />

              {/* Per-context cards */}
              <div className="space-y-3">
                {insights.map((insight) => (
                  <ContextCard
                    key={insight.context}
                    insight={insight}
                    goal={goal}
                    isWorst={worst?.context === insight.context}
                    isBest={
                      best?.context === insight.context &&
                      best?.context !== worst?.context
                    }
                  />
                ))}
              </div>
            </div>

            {!isPro && <PaywallOverlay />}
          </div>
        </>
      )}

      {/* ── Festival History ──────────────────────────────────────── */}
      {(festLoading || festHistory.length > 0) && (
        <div className="mt-8">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-text-primary">Festival History</h2>
            <p className="text-xs text-text-muted mt-0.5">
              How past festivals affected your calorie intake
            </p>
          </div>

          {festLoading ? (
            <div className="flex items-center justify-center py-10 text-text-muted text-sm">
              Loading…
            </div>
          ) : (
            <div className="relative">
              {/* First card always visible */}
              {festHistory.length > 0 && (
                <FestivalHistoryCard
                  h={festHistory[0]}
                  yoyText={yoyMap.get(festHistory[0].festival_id)}
                  goal={goal}
                />
              )}

              {/* Remaining cards — Pro-gated */}
              {festHistory.length > 1 && (
                <div className="relative mt-3">
                  <div
                    className={`space-y-3${!isPro ? " pointer-events-none select-none" : ""}`}
                    style={!isPro ? { filter: "blur(3px)", opacity: 0.5 } : {}}
                  >
                    {festHistory.slice(1).map((h) => (
                      <FestivalHistoryCard
                        key={h.festival_id}
                        h={h}
                        yoyText={yoyMap.get(h.festival_id)}
                        goal={goal}
                      />
                    ))}</div>

                  {!isPro && (
                    <div
                      className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl"
                      style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(10,10,10,0.95) 25%)" }}
                    >
                      <div className="text-center px-6 mt-16">
                        <div className="text-2xl mb-2">🔒</div>
                        <p className="text-sm font-semibold text-text-primary mb-1">Pro feature</p>
                        <p className="text-xs text-text-muted mb-3 max-w-xs">
                          Full festival history with year-over-year comparisons available on Pro.
                        </p>
                        <a
                          href="/upgrade"
                          className="inline-block px-4 py-2 rounded-xl text-xs font-semibold"
                          style={{ backgroundColor: "#a78bfa", color: "#fff" }}
                        >
                          Upgrade to Pro
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}


            </div>
          )}
        </div>
      )}
    </div>
  );
}
