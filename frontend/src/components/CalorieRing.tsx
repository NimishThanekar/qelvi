import { useAccentColor } from "../store/themeStore";

interface CalorieRingProps {
  consumed: number;
  goal: number;
  size?: number;
}

export default function CalorieRing({ consumed, goal, size = 160 }: CalorieRingProps) {
  const accentColor = useAccentColor();
  const pct = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const strokeDash = pct * circumference;
  const over = consumed > goal && goal > 0;

  const color = over ? '#f87171' : pct > 0.8 ? '#fb923c' : accentColor;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        {/* Track */}
        <circle cx="50" cy="50" r={r} fill="none" style={{ stroke: 'var(--bg-elevated)' }} strokeWidth="7" />
        {/* Progress */}
        <circle
          cx="50" cy="50" r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${strokeDash} ${circumference}`}
          strokeDashoffset="0"
          transform="rotate(-90 50 50)"
          className="ring-animated transition-all duration-1000"
          style={{ filter: `drop-shadow(0 0 6px ${color}60)` }}
        />
        {/* Glow dot at tip */}
        {pct > 0.02 && (
          <circle
            cx={50 + r * Math.cos((pct * 2 * Math.PI) - Math.PI / 2)}
            cy={50 + r * Math.sin((pct * 2 * Math.PI) - Math.PI / 2)}
            r="3.5"
            fill={color}
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
        )}
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-text-primary leading-none" style={{ fontSize: size * 0.18 }}>
          {Math.round(consumed)}
        </span>
        <span className="text-text-muted mt-0.5" style={{ fontSize: size * 0.09 }}>
          / {goal} kcal
        </span>
        {over && (
          <span className="text-red-400 font-medium mt-1" style={{ fontSize: size * 0.08 }}>
            +{Math.round(consumed - goal)} over
          </span>
        )}
      </div>
    </div>
  );
}
