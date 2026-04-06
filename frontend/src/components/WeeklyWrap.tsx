import { useState, useEffect } from "react";
import { X, ChevronDown, ChevronUp, Trophy, Utensils, Flame, Target, Calendar } from "lucide-react";
import { logsApi } from "../lib/api";
import type { WeeklyWrapData } from "../types";
import { MEAL_TYPES, MEAL_CONTEXTS } from "../types";

function getPreviousWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff - 7);
  return d.toISOString().split("T")[0];
}

const ACCENT = "#3B7BFF";

export default function WeeklyWrap() {
  const [wrap, setWrap] = useState<WeeklyWrapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const weekStart = getPreviousWeekStart();
  const dismissKey = `qelvi_wrap_${weekStart}`;

  useEffect(() => {
    if (localStorage.getItem(dismissKey)) {
      setDismissed(true);
      setLoading(false);
      return;
    }
    logsApi
      .weeklyWrap(weekStart)
      .then((r) => setWrap(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [weekStart, dismissKey]);

  const handleDismiss = () => {
    localStorage.setItem(dismissKey, "1");
    setDismissed(true);
  };

  if (loading || dismissed || !wrap || wrap.days_logged === 0) return null;

  const mealInfo = wrap.most_common_meal_type
    ? MEAL_TYPES.find((m) => m.value === wrap.most_common_meal_type)
    : null;

  const topContext = Object.entries(wrap.context_breakdown).sort(
    (a, b) => b[1] - a[1]
  )[0];
  const topCtxInfo = topContext
    ? MEAL_CONTEXTS.find((c) => c.value === topContext[0])
    : null;

  return (
    <div
      className="card mb-4 overflow-hidden relative"
      style={{
        borderColor: `rgba(var(--accent-rgb) / 0.25)`,
        background: `linear-gradient(135deg, rgba(var(--accent-rgb) / 0.06) 0%, var(--bg-card) 50%)`,
      }}
    >
      {/* Header */}
      <div className="p-4 pb-0 flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{wrap.title_emoji}</span>
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider">
              Last week's wrap
            </p>
            <p className="text-sm font-semibold text-text-primary mt-0.5">
              {wrap.title}
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-all"
        >
          <X size={14} />
        </button>
      </div>

      {/* Compact stats */}
      <div className="p-4 grid grid-cols-4 gap-2">
        {[
          {
            icon: Flame,
            label: "Avg/day",
            value: `${wrap.avg_daily_calories.toLocaleString()}`,
            unit: "kcal",
            color: "#fb923c",
          },
          {
            icon: Calendar,
            label: "Days logged",
            value: `${wrap.consistency_score}/7`,
            unit: "",
            color: ACCENT,
          },
          {
            icon: Utensils,
            label: "Total meals",
            value: `${wrap.total_meals}`,
            unit: "",
            color: "#38bdf8",
          },
          {
            icon: Trophy,
            label: "Streak",
            value: `${wrap.streak}`,
            unit: "days",
            color: "#fbbf24",
          },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <s.icon size={14} className="mx-auto mb-1" style={{ color: s.color }} />
            <p className="text-lg font-bold text-text-primary leading-tight">
              {s.value}
            </p>
            <p className="text-[10px] text-text-muted">
              {s.unit ? `${s.unit}` : s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Expand/collapse for more details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1 py-2 text-xs text-text-muted hover:text-text-primary border-t border-bg-elevated transition-colors"
      >
        {expanded ? "Less" : "More details"}
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 animate-slide-up">
          {/* Insights pills */}
          <div className="flex flex-wrap gap-1.5">
            {wrap.most_logged_food && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium"
                style={{ backgroundColor: ACCENT + "18", color: ACCENT }}
              >
                🍽️ Top: {wrap.most_logged_food}
              </span>
            )}
            {mealInfo && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium"
                style={{ backgroundColor: mealInfo.color + "18", color: mealInfo.color }}
              >
                {mealInfo.emoji} Fav meal: {mealInfo.label}
              </span>
            )}
            {topCtxInfo && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium"
                style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}
              >
                {topCtxInfo.emoji} Mostly: {topCtxInfo.label}
              </span>
            )}
            {wrap.unique_foods > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium"
                style={{ backgroundColor: "#a78bfa18", color: "#a78bfa" }}
              >
                🧭 {wrap.unique_foods} unique foods
              </span>
            )}
          </div>

          {/* vs previous week */}
          {wrap.vs_previous_week !== null && (
            <div className="flex items-center gap-2 bg-bg-elevated rounded-xl p-3">
              <Target size={14} style={{ color: ACCENT }} />
              <p className="text-xs text-text-secondary">
                vs previous week:{" "}
                <span
                  className="font-semibold"
                  style={{
                    color:
                      wrap.vs_previous_week > 5
                        ? "#fb923c"
                        : wrap.vs_previous_week < -5
                        ? "#34d399"
                        : "var(--text-primary)",
                  }}
                >
                  {wrap.vs_previous_week > 0 ? "+" : ""}
                  {wrap.vs_previous_week}% avg cals
                </span>
              </p>
            </div>
          )}

          {/* Best day */}
          {wrap.best_day && (
            <div className="flex items-center gap-2 bg-bg-elevated rounded-xl p-3">
              <Trophy size={14} style={{ color: "#fbbf24" }} />
              <p className="text-xs text-text-secondary">
                Best day (closest to goal):{" "}
                <span className="font-semibold text-text-primary">
                  {new Date(wrap.best_day + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
