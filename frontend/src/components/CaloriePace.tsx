import { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface CaloriePaceProps {
  consumed: number;
  goal: number;
}

export default function CaloriePace({ consumed, goal }: CaloriePaceProps) {

  const pace = useMemo(() => {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;

    const EATING_START = 7;
    const EATING_END = 22;

    // Outside eating window — don't show projection
    if (hour < EATING_START || hour >= EATING_END) return null;

    const elapsed = hour - EATING_START;
    const total = EATING_END - EATING_START;
    const fraction = elapsed / total;

    if (fraction <= 0.05) return null; // too early to project

    const projected = Math.round(consumed / fraction);
    const diff = projected - goal;
    const diffPct = goal > 0 ? (diff / goal) * 100 : 0;

    let status: "on-track" | "approaching" | "over";
    let statusColor: string;
    let statusLabel: string;

    if (diffPct <= 10) {
      status = "on-track";
      statusColor = "#34d399";
      statusLabel = "On track";
    } else if (diffPct <= 30) {
      status = "approaching";
      statusColor = "#fb923c";
      statusLabel = "Might exceed";
    } else {
      status = "over";
      statusColor = "#f87171";
      statusLabel = "Will exceed";
    }

    const progressPct = Math.min((hour - EATING_START) / total * 100, 100);

    return { projected, diff, status, statusColor, statusLabel, progressPct };
  }, [consumed, goal]);

  if (!pace) return null;

  const Icon = pace.diff > 20 ? TrendingUp : pace.diff < -20 ? TrendingDown : Minus;

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
          Calorie Pace
        </p>
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ backgroundColor: pace.statusColor + "18", color: pace.statusColor }}
        >
          <Icon size={10} />
          {pace.statusLabel}
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold text-text-primary">
          ~{pace.projected.toLocaleString()}
        </p>
        <p className="text-xs text-text-muted">kcal projected today</p>
      </div>

      <div className="mt-3 flex items-center gap-3">
        {/* Day progress bar */}
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-elevated)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pace.progressPct}%`,
              backgroundColor: pace.statusColor,
            }}
          />
        </div>
        <p className="text-[10px] text-text-muted whitespace-nowrap">
          {pace.diff > 0 ? "+" : ""}{pace.diff} vs goal
        </p>
      </div>
    </div>
  );
}
