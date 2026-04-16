import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { practitionerApi } from "../lib/api";
import { ArrowLeft, Download, ChevronDown, ChevronUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import toast from "react-hot-toast";

interface Summary {
  patient_id: string;
  name: string;
  email: string;
  age?: number;
  gender?: string;
  weight_kg?: number;
  height_cm?: number;
  activity_level?: string;
  dietary_preferences?: string[];
  calorie_goal?: number;
  is_pro?: boolean;
  logging_stats: { days_logged_30d: number; adherence_rate: number };
  calorie_stats: { avg_daily: number; max_daily: number; min_daily: number };
  meal_pattern: Record<string, number>;
  context_pattern: Record<string, number>;
  top_foods: { food_name: string; times_logged: number; total_calories: number }[];
  weekly_trend: { week_start: string; week_end: string; avg_calories: number | null }[];
  food_variety_score: number;
}

interface MealLog {
  id: string;
  date: string;
  meal_type: string;
  entries: { food_name: string; calories: number; quantity: number; serving_type: string }[];
  total_calories: number;
  context?: string;
  notes?: string;
  source?: string;
}

function barColor(avg: number | null, goal: number): string {
  if (!avg) return "#374151";
  const ratio = avg / goal;
  if (ratio <= 1.05) return "#a3e635";
  if (ratio <= 1.15) return "#fbbf24";
  return "#f87171";
}

function weekLabel(week_start: string, week_end: string): string {
  const s = new Date(week_start);
  const e = new Date(week_end);
  return `${s.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}–${e.toLocaleDateString("en-IN", { day: "numeric" })}`;
}

function contextLabel(ctx: string): string {
  const map: Record<string, string> = {
    home: "Home",
    office: "Office",
    restaurant: "Restaurant",
    street_food: "Street Food",
    travel: "Travel",
    party: "Party",
    late_night: "Late Night",
  };
  return map[ctx] || ctx;
}

function mealLabel(mt: string): string {
  const map: Record<string, string> = {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Snack",
    adhoc: "Ad hoc",
  };
  return map[mt] || mt;
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-2xl font-bold" style={{ color: color || "var(--text-primary)" }}>
        {value}
      </p>
      {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

export default function PatientDetail() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recentLogs, setRecentLogs] = useState<MealLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [logsOpen, setLogsOpen] = useState(true);

  useEffect(() => {
    if (!patientId) return;
    const today = new Date();
    const end = today.toISOString().split("T")[0];
    const start = new Date(today.getTime() - 6 * 86400000).toISOString().split("T")[0];

    Promise.all([
      practitionerApi.patientSummary(patientId),
      practitionerApi.patientLogs(patientId, start, end),
    ])
      .then(([s, l]) => {
        setSummary(s.data);
        setRecentLogs(l.data);
      })
      .catch(() => toast.error("Failed to load patient data"))
      .finally(() => setLoading(false));
  }, [patientId]);

  const handleDownload = async () => {
    if (!patientId || !summary) return;
    setDownloading(true);
    try {
      const res = await practitionerApi.downloadReport(patientId, 30);
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `${summary.name.replace(/\s+/g, "_")}_nutrition_report_${today}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setDownloading(false);
    }
  };

  const toggleDay = (date: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="h-8 w-48 bg-bg-elevated rounded-lg animate-pulse mb-6" />
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4 h-20 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-6 text-center">
        <p className="text-text-muted">Patient not found</p>
      </div>
    );
  }

  const goal = summary.calorie_goal || 2000;

  // Weekly trend chart data
  const trendData = summary.weekly_trend.map((w) => ({
    label: weekLabel(w.week_start, w.week_end),
    avg: w.avg_calories ?? 0,
  }));

  // Meal pattern chart data
  const mealData = Object.entries(summary.meal_pattern)
    .map(([mt, count]) => ({ label: mealLabel(mt), count }))
    .sort((a, b) => b.count - a.count);

  // Context chart
  const ctxTotal = Object.values(summary.context_pattern).reduce((s, v) => s + v, 0);
  const ctxData = Object.entries(summary.context_pattern)
    .map(([ctx, count]) => ({ label: contextLabel(ctx), count, pct: Math.round((count / ctxTotal) * 100) }))
    .sort((a, b) => b.count - a.count);

  // Max food count for relative bar widths
  const maxFoodCount = Math.max(...summary.top_foods.map((f) => f.times_logged), 1);

  // Group recent logs by date
  const logsByDate: Record<string, MealLog[]> = {};
  for (const log of recentLogs) {
    if (!logsByDate[log.date]) logsByDate[log.date] = [];
    logsByDate[log.date].push(log);
  }
  const sortedDates = Object.keys(logsByDate).sort().reverse();

  const adherenceColor =
    summary.logging_stats.adherence_rate >= 70
      ? "#a3e635"
      : summary.logging_stats.adherence_rate >= 40
      ? "#fbbf24"
      : "#f87171";

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Top bar */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <button
            onClick={() => navigate("/practitioner")}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary mb-2 transition-colors"
          >
            <ArrowLeft size={13} />
            Back to Patients
          </button>
          <h1 className="text-xl font-semibold text-text-primary">{summary.name}</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {[
              summary.age ? `${summary.age}y` : null,
              summary.gender,
              summary.weight_kg ? `${summary.weight_kg}kg` : null,
              summary.calorie_goal ? `Goal: ${summary.calorie_goal} kcal` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm border border-bg-border text-text-muted hover:text-text-primary hover:border-text-muted transition-all flex-shrink-0"
        >
          {downloading ? (
            <span className="w-4 h-4 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
          ) : (
            <Download size={14} />
          )}
          {downloading ? "Generating…" : "Download Report"}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Avg Daily Cal (30d)"
          value={Math.round(summary.calorie_stats.avg_daily)}
          sub="kcal/day"
        />
        <StatCard
          label="Adherence"
          value={`${summary.logging_stats.adherence_rate}%`}
          sub={`${summary.logging_stats.days_logged_30d} / 30 days`}
          color={adherenceColor}
        />
        <StatCard
          label="Calorie Range"
          value={`${Math.round(summary.calorie_stats.min_daily)}–${Math.round(summary.calorie_stats.max_daily)}`}
          sub="kcal (min–max)"
        />
        <StatCard
          label="Food Variety"
          value={summary.food_variety_score}
          sub="unique foods (30d)"
          color="#38bdf8"
        />
      </div>

      {/* Weekly Trend */}
      <div className="card p-5 mb-4">
        <h2 className="text-sm font-semibold text-text-secondary mb-4">Weekly Avg Calories</h2>
        {trendData.every((d) => d.avg === 0) ? (
          <p className="text-xs text-text-muted">No data</p>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={trendData} barCategoryGap="30%">
              <XAxis
                dataKey="label"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide domain={[0, "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--bg-border)",
                  borderRadius: 10,
                  fontSize: 12,
                }}
                formatter={(v) => [`${Math.round(Number(v))} kcal`, "Avg"]}
              />
              <ReferenceLine
                y={goal}
                stroke="#6b7280"
                strokeDasharray="4 2"
                label={{ value: "Goal", position: "right", fill: "#6b7280", fontSize: 10 }}
              />
              <Bar dataKey="avg" radius={[6, 6, 0, 0]}>
                {trendData.map((d, i) => (
                  <Cell key={i} fill={barColor(d.avg, goal)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Meal Pattern */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-text-secondary mb-4">Meal Pattern</h2>
          {mealData.length === 0 ? (
            <p className="text-xs text-text-muted">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={mealData} layout="vertical" barCategoryGap="20%">
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--bg-border)",
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                  formatter={(v) => [Number(v), "logs"]}
                />
                <Bar dataKey="count" fill="#38bdf8" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Context Analysis */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-text-secondary mb-4">Eating Contexts</h2>
          {ctxData.length === 0 ? (
            <p className="text-xs text-text-muted">No context data logged</p>
          ) : (
            <div className="space-y-2.5">
              {ctxData.map((c) => (
                <div key={c.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-text-secondary">{c.label}</span>
                    <span className="text-xs text-text-muted">{c.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${c.pct}%`, backgroundColor: "#a78bfa" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top Foods */}
      <div className="card p-5 mb-4">
        <h2 className="text-sm font-semibold text-text-secondary mb-4">Top 10 Foods</h2>
        {summary.top_foods.length === 0 ? (
          <p className="text-xs text-text-muted">No data</p>
        ) : (
          <div className="space-y-2.5">
            {summary.top_foods.map((f) => {
              const pct = Math.round((f.times_logged / maxFoodCount) * 100);
              return (
                <div key={f.food_name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-text-primary truncate max-w-[60%]">{f.food_name}</span>
                    <span className="text-xs text-text-muted flex-shrink-0">
                      {f.times_logged}× · {Math.round(f.total_calories / f.times_logged)} kcal avg
                    </span>
                  </div>
                  <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: "#a3e635" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Logs — last 7 days */}
      <div className="card p-5">
        <button
          onClick={() => setLogsOpen((o) => !o)}
          className="flex items-center justify-between w-full mb-1"
        >
          <h2 className="text-sm font-semibold text-text-secondary">Recent Logs (7 days)</h2>
          {logsOpen ? <ChevronUp size={15} className="text-text-muted" /> : <ChevronDown size={15} className="text-text-muted" />}
        </button>
        {logsOpen && (
          <div className="mt-4 space-y-2">
            {sortedDates.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">No logs in the last 7 days</p>
            ) : (
              sortedDates.map((date) => {
                const dayLogs = logsByDate[date];
                const dayTotal = dayLogs.reduce((s, l) => s + l.total_calories, 0);
                const expanded = expandedDays.has(date);
                const formattedDate = new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });
                return (
                  <div key={date} className="bg-bg-elevated rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleDay(date)}
                      className="flex items-center justify-between w-full px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        {expanded ? (
                          <ChevronUp size={13} className="text-text-muted" />
                        ) : (
                          <ChevronDown size={13} className="text-text-muted" />
                        )}
                        <span className="text-sm font-medium text-text-primary">{formattedDate}</span>
                        <span className="text-xs text-text-muted">{dayLogs.length} meals</span>
                      </div>
                      <span
                        className="text-sm font-semibold"
                        style={{
                          color: dayTotal > goal ? "#f87171" : dayTotal > goal * 0.85 ? "#fbbf24" : "#a3e635",
                        }}
                      >
                        {Math.round(dayTotal)} kcal
                      </span>
                    </button>
                    {expanded && (() => {
                      const mealOrder = ["breakfast", "lunch", "dinner", "snack", "adhoc"];
                      const grouped: Record<string, MealLog[]> = {};
                      for (const log of dayLogs) {
                        if (!grouped[log.meal_type]) grouped[log.meal_type] = [];
                        grouped[log.meal_type].push(log);
                      }
                      const orderedTypes = [
                        ...mealOrder.filter((t) => grouped[t]),
                        ...Object.keys(grouped).filter((t) => !mealOrder.includes(t)),
                      ];
                      return (
                        <div className="border-t border-bg-border px-4 pb-3 pt-2 space-y-3">
                          {orderedTypes.map((mealType) => {
                            const logs = grouped[mealType];
                            const mealTotal = logs.reduce((s, l) => s + l.total_calories, 0);
                            const allEntries = logs.flatMap((l) => l.entries);
                            const context = logs.find((l) => l.context)?.context;
                            return (
                              <div key={mealType} className="text-xs">
                                <div className="flex items-center justify-between text-text-secondary font-medium mb-1.5">
                                  <span>{mealLabel(mealType)}</span>
                                  <div className="flex items-center gap-2">
                                    {context && (
                                      <span className="text-text-muted">{contextLabel(context)}</span>
                                    )}
                                    <span>{Math.round(mealTotal)} kcal</span>
                                  </div>
                                </div>
                                <div className="pl-2 space-y-0.5">
                                  {allEntries.map((e, i) => (
                                    <div key={i} className="flex justify-between text-text-muted py-0.5">
                                      <span>{e.food_name}</span>
                                      <span>{Math.round(e.calories)} kcal</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
