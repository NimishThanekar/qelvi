import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ContextStat } from "../types";
import { MEAL_CONTEXTS } from "../types";

interface Props {
  stats: ContextStat[];
}

function buildInsights(stats: ContextStat[]): string[] {
  const eligible = stats.filter((s) => s.count >= 3);
  if (eligible.length === 0) return [];

  const insights: string[] = [];

  // Riskiest vs safest
  const riskiest = eligible.reduce((a, b) => (a.over_goal_pct > b.over_goal_pct ? a : b));
  const safest = eligible.reduce((a, b) => (a.over_goal_pct < b.over_goal_pct ? a : b));
  const rInfo = MEAL_CONTEXTS.find((c) => c.value === riskiest.context);
  const sInfo = MEAL_CONTEXTS.find((c) => c.value === safest.context);

  if (riskiest.context !== safest.context) {
    insights.push(
      `${rInfo?.emoji ?? "📍"} ${rInfo?.label ?? riskiest.context} days average ${riskiest.avg_calories} kcal — you exceed your goal ${riskiest.over_goal_pct}% of the time there.`
    );
    if (safest.over_goal_pct <= 20) {
      insights.push(
        `${sInfo?.emoji ?? "🏠"} ${sInfo?.label ?? safest.context} is your best spot — you stay on track ${100 - safest.over_goal_pct}% of the time.`
      );
    }
  }

  // Home vs non-home delta
  const home = eligible.find((s) => s.context === "home");
  const nonHome = eligible.filter((s) => s.context !== "home" && s.vs_home_delta !== null);
  if (home && nonHome.length > 0) {
    const biggest = nonHome.reduce((a, b) =>
      Math.abs((a.vs_home_delta ?? 0)) > Math.abs((b.vs_home_delta ?? 0)) ? a : b
    );
    const bInfo = MEAL_CONTEXTS.find((c) => c.value === biggest.context);
    const delta = biggest.vs_home_delta ?? 0;
    if (Math.abs(delta) >= 150) {
      insights.push(
        delta > 0
          ? `${bInfo?.emoji ?? "📍"} ${bInfo?.label ?? biggest.context} meals run +${delta} kcal above your home average of ${home.avg_calories} kcal.`
          : `${bInfo?.emoji ?? "📍"} ${bInfo?.label ?? biggest.context} meals are ${Math.abs(delta)} kcal lighter than home — a good sign.`
      );
    }
  }

  return insights;
}

export default function ContextInsightsCard({ stats }: Props) {
  const navigate = useNavigate();
  const [idx, setIdx] = useState(0);

  const eligible = stats.filter((s) => s.count >= 3);
  if (eligible.length < 2) return null;

  const insights = buildInsights(stats);
  if (insights.length === 0) return null;

  const current = insights[idx % insights.length];
  const hasMultiple = insights.length > 1;

  return (
    <div className="mb-4 card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
          📍 Context insights
        </p>
        <button
          onClick={() => navigate("/insights")}
          className="flex items-center gap-0.5 text-[10px] text-accent-primary hover:text-accent-soft transition-colors"
        >
          View all <ChevronRight size={11} />
        </button>
      </div>

      <p className="text-sm text-text-primary leading-snug">{current}</p>

      {hasMultiple && (
        <div className="flex items-center gap-2 mt-3">
          <div className="flex gap-1">
            {insights.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className="w-1.5 h-1.5 rounded-full transition-all"
                style={{
                  backgroundColor:
                    i === idx % insights.length
                      ? "var(--accent-primary, #3B7BFF)"
                      : "var(--bg-border, #242424)",
                }}
              />
            ))}
          </div>
          <button
            onClick={() => setIdx((prev) => (prev + 1) % insights.length)}
            className="text-[10px] text-text-muted hover:text-text-secondary transition-colors ml-auto"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
