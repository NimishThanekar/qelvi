import { useState, useEffect } from "react";
import { format, subDays, parseISO } from "date-fns";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { logsApi } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import type { ContextStat } from "../types";
import { MEAL_CONTEXTS } from "../types";
import { TrendingUp, TrendingDown, Minus, Calendar, Lock } from "lucide-react";

type Range = "7d" | "14d" | "30d";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-elevated border border-bg-border rounded-xl p-3 shadow-xl">
      <p className="text-xs text-text-muted mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-text-secondary capitalize">{p.dataKey}:</span>
          <span className="text-text-primary font-medium">
            {Math.round(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

const ACCENT = "#3B7BFF";

export default function History() {
  const { user } = useAuthStore();
  const [range, setRange] = useState<Range>("7d");
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [contextStats, setContextStats] = useState<ContextStat[]>([]);

  const days = range === "7d" ? 7 : range === "14d" ? 14 : 30;

  useEffect(() => {
    logsApi.contextStats().then((r) => setContextStats(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const end = new Date().toISOString().split("T")[0];
    const start = subDays(new Date(), days - 1)
      .toISOString()
      .split("T")[0];
    logsApi
      .history(start, end)
      .then((res) => {
        const dataMap: Record<string, any> = {};
        res.data.forEach((d: any) => {
          dataMap[d.date] = d;
        });
        const filled = [];
        for (let i = days - 1; i >= 0; i--) {
          const d = subDays(new Date(), i).toISOString().split("T")[0];
          filled.push({
            date: d,
            label: format(parseISO(d), days <= 7 ? "EEE" : "MM/dd"),
            total_calories: dataMap[d]?.total_calories || 0,
            calorie_goal: user?.calorie_goal || 2000,
          });
        }
        setHistory(filled);
      })
      .finally(() => setLoading(false));
  }, [range, user]);

  const nonZero = history.filter((d) => d.total_calories > 0);
  const avg = nonZero.length
    ? nonZero.reduce((s, d) => s + d.total_calories, 0) / nonZero.length
    : 0;
  const max = Math.max(...history.map((d) => d.total_calories), 1);
  const daysOnTarget = nonZero.filter((d) => {
    const goal = d.calorie_goal || 2000;
    return d.total_calories <= goal && d.total_calories >= goal * 0.7;
  }).length;

  const trend =
    nonZero.length >= 2
      ? nonZero[nonZero.length - 1].total_calories - nonZero[0].total_calories
      : 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">History</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Your calorie trends over time
          </p>
        </div>
        <div className="flex bg-bg-elevated rounded-xl p-1 gap-1">
          {(["7d", "14d", "30d"] as Range[]).map((r) => {
            const requiresPro = r !== "7d";
            const locked = requiresPro && !user?.is_pro;
            return (
              <button
                key={r}
                onClick={() => {
                  if (locked) { window.location.href = "/upgrade"; return; }
                  setRange(r);
                }}
                title={locked ? "Pro feature — upgrade to unlock" : undefined}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  range === r && !locked
                    ? "bg-accent-primary text-btn-fg"
                    : locked
                    ? "text-text-muted opacity-50 cursor-pointer"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {locked && <Lock size={9} />}
                {r}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 stagger">
        {[
          {
            label: "Avg daily",
            value: Math.round(avg),
            unit: "kcal",
            icon: trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus,
            color: ACCENT,
          },
          {
            label: "Days tracked",
            value: nonZero.length,
            unit: `of ${days}`,
            icon: Calendar,
            color: "#38bdf8",
          },
          {
            label: "Days on target",
            value: daysOnTarget,
            unit: "days",
            icon: TrendingUp,
            color: "#a78bfa",
          },
          {
            label: "Peak day",
            value: Math.round(max),
            unit: "kcal",
            icon: TrendingUp,
            color: "#fb923c",
          },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className="flex justify-between items-start mb-3">
              <p className="text-xs text-text-muted">{s.label}</p>
              <s.icon size={14} style={{ color: s.color }} />
            </div>
            <p className="text-2xl font-bold text-text-primary">{s.value}</p>
            <p className="text-xs text-text-muted mt-0.5">{s.unit}</p>
          </div>
        ))}
      </div>

      {/* Area Chart */}
      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Calorie intake
            </h3>
            <p className="text-xs text-text-muted">vs daily goal</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: ACCENT }} />
              Consumed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-text-muted inline-block rounded border-dashed" />
              Goal
            </span>
          </div>
        </div>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-text-muted text-sm">
            Loading...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={history}
              margin={{ top: 5, right: 5, bottom: 0, left: -10 }}
            >
              <defs>
                <linearGradient id="calGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--bg-elevated)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                y={user?.calorie_goal || 2000}
                stroke="var(--bg-border)"
                strokeDasharray="4 4"
              />
              <Area
                type="monotone"
                dataKey="total_calories"
                name="calories"
                stroke={ACCENT}
                strokeWidth={2}
                fill="url(#calGrad)"
                dot={{ fill: ACCENT, r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: ACCENT }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Bar chart */}
      <div className="card p-5">
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-text-primary">
            Daily breakdown
          </h3>
          <p className="text-xs text-text-muted">
            Bars show how much of your goal you hit
          </p>
        </div>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-text-muted text-sm">
            Loading...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={history}
              margin={{ top: 5, right: 5, bottom: 0, left: -10 }}
              barSize={days <= 7 ? 28 : 16}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--bg-elevated)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                y={user?.calorie_goal || 2000}
                stroke={ACCENT}
                strokeDasharray="4 4"
                strokeOpacity={0.4}
              />
              <Bar
                dataKey="total_calories"
                name="calories"
                radius={[4, 4, 0, 0]}
                fill={ACCENT}
                fillOpacity={0.7}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Daily log table */}
      <div className="card mt-4 overflow-hidden">
        <div className="p-4 border-b border-bg-elevated">
          <h3 className="text-sm font-semibold text-text-primary">Daily log</h3>
        </div>
        <div className="divide-y divide-bg-card">
          {[...history].reverse().map((d) => {
            const goal = d.calorie_goal || 2000;
            const pct =
              goal > 0 ? Math.min((d.total_calories / goal) * 100, 100) : 0;
            const over = d.total_calories > goal;
            return (
              <div key={d.date} className="flex items-center gap-4 px-4 py-3">
                <div className="w-20 flex-shrink-0">
                  <p className="text-xs font-medium text-text-secondary">
                    {format(parseISO(d.date), "EEE, MMM d")}
                  </p>
                </div>
                <div className="flex-1">
                  <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: over
                          ? "#f87171"
                          : pct > 85
                          ? "#fb923c"
                          : ACCENT,
                      }}
                    />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p
                    className="text-xs font-medium"
                    style={{
                      color: over
                        ? "#f87171"
                        : d.total_calories === 0
                        ? "var(--text-muted)"
                        : ACCENT,
                    }}
                  >
                    {d.total_calories === 0
                      ? "—"
                      : `${Math.round(d.total_calories)} kcal`}
                  </p>
                  {d.total_calories > 0 && (
                    <p className="text-[10px] text-text-muted">
                      {Math.round(pct)}% of goal
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Eating Environments breakdown */}
      {contextStats.length > 0 && (
        <div className="card mt-4 overflow-hidden">
          <div className="p-4 border-b border-bg-elevated">
            <h3 className="text-sm font-semibold text-text-primary">Eating environments</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Where you tend to eat more — based on your last 60 days
            </p>
          </div>
          <div className="p-4 space-y-4">
            {contextStats.map((stat) => {
              const info = MEAL_CONTEXTS.find((c) => c.value === stat.context);
              const maxCal = Math.max(...contextStats.map((s) => s.avg_calories), 1);
              const barWidth = Math.round((stat.avg_calories / maxCal) * 100);
              const goal = user?.calorie_goal || 2000;
              const barColor =
                stat.avg_calories > goal
                  ? "#f87171"
                  : stat.avg_calories > goal * 0.88
                  ? "#fb923c"
                  : ACCENT;

              return (
                <div key={stat.context}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{info?.emoji ?? "📍"}</span>
                      <span className="text-xs text-text-secondary font-medium">
                        {info?.label ?? stat.context}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        ({stat.count} log{stat.count !== 1 ? "s" : ""})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {stat.vs_home_delta !== null && stat.context !== "home" && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{
                            backgroundColor: stat.vs_home_delta > 0 ? "#fb923c15" : "#34d39915",
                            color: stat.vs_home_delta > 0 ? "#fb923c" : "#34d399",
                          }}
                        >
                          {stat.vs_home_delta > 0 ? "+" : ""}{stat.vs_home_delta} vs home
                        </span>
                      )}
                      <span className="text-xs font-semibold text-text-primary">
                        {stat.avg_calories} kcal
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-bg-elevated rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${barWidth}%`, backgroundColor: barColor }}
                      />
                    </div>
                    <span
                      className="text-[10px] w-16 text-right flex-shrink-0"
                      style={{ color: stat.over_goal_pct > 50 ? "#fb923c" : "var(--text-muted)" }}
                    >
                      {stat.over_goal_pct}% over goal
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Goal reference line label */}
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 h-px border-t border-dashed border-bg-border" />
              <span className="text-[10px] text-text-muted flex-shrink-0">
                your goal: {user?.calorie_goal || 2000} kcal
              </span>
              <div className="flex-1 h-px border-t border-dashed border-bg-border" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
