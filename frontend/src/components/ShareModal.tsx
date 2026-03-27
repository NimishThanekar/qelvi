import { useEffect, useRef, useState, useCallback } from "react";
import { X, Download, Copy, Share2, Check } from "lucide-react";
import { subDays } from "date-fns";
import { logsApi } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { useAccentColor } from "../store/themeStore";

interface ShareData {
  consumed: number;
  goal: number;
  meals: number;
  topFood: string | null;
}

interface Props {
  data: ShareData;
  onClose: () => void;
}

type CardMode = "daily" | "weekly";

// ── helpers ──────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  pct: number,
  trackColor: string,
  fillColor: string
) {
  const start = -Math.PI / 2;
  const end = start + (pct / 100) * 2 * Math.PI;
  // track
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = trackColor;
  ctx.lineWidth = 8;
  ctx.stroke();
  // fill
  if (pct > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, end);
    ctx.strokeStyle = fillColor;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.stroke();
  }
}

async function buildCard(
  canvas: HTMLCanvasElement,
  mode: CardMode,
  accentColor: string,
  dailyData: ShareData,
  weeklyAvg: number,
  weeklyStreak: number,
  toggleGoalPct: boolean,
  toggleMeals: boolean,
  toggleStreak: boolean
) {
  const W = 540;
  const H = 960;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d")!;
  await document.fonts.ready;

  const [ar, ag, ab] = hexToRgb(accentColor);
  const accentRgba = (a: number) => `rgba(${ar},${ag},${ab},${a})`;

  // ── background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = "#080808";
  ctx.fillRect(0, 0, W, H);

  // subtle noise texture simulation via fine dot grid
  ctx.fillStyle = "rgba(255,255,255,0.012)";
  for (let y = 0; y < H; y += 4) {
    for (let x = (y / 4) % 2 === 0 ? 0 : 2; x < W; x += 4) {
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // ── radial glows ─────────────────────────────────────────────────────────────
  const glow1 = ctx.createRadialGradient(W * 0.8, H * 0.18, 0, W * 0.8, H * 0.18, 280);
  glow1.addColorStop(0, accentRgba(0.18));
  glow1.addColorStop(1, "transparent");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(W * 0.15, H * 0.82, 0, W * 0.15, H * 0.82, 200);
  glow2.addColorStop(0, accentRgba(0.12));
  glow2.addColorStop(1, "transparent");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // ── decorative grid lines ────────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 54) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 54) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // ── top border accent line ───────────────────────────────────────────────────
  const topLine = ctx.createLinearGradient(0, 0, W, 0);
  topLine.addColorStop(0, "transparent");
  topLine.addColorStop(0.3, accentRgba(0.8));
  topLine.addColorStop(0.7, accentRgba(0.8));
  topLine.addColorStop(1, "transparent");
  ctx.fillStyle = topLine;
  ctx.fillRect(0, 0, W, 2);

  // ── QELVI wordmark ───────────────────────────────────────────────────────────
  ctx.font = "700 13px 'DM Sans', sans-serif";
  ctx.fillStyle = accentRgba(0.9);
  ctx.letterSpacing = "4px";
  ctx.fillText("QELVI", 44, 66);
  ctx.letterSpacing = "0px";

  // date pill
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const pillLabel = mode === "weekly" ? "7-DAY RECAP" : today.toUpperCase();
  ctx.font = "500 11px 'DM Sans', sans-serif";
  const pillW = ctx.measureText(pillLabel).width + 24;
  rrect(ctx, W - 44 - pillW, 50, pillW, 26, 7);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillText(pillLabel, W - 44 - pillW + 12, 67);

  // ── headline ─────────────────────────────────────────────────────────────────
  const headlineY = 148;
  ctx.font = "300 18px 'DM Sans', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillText(mode === "weekly" ? "WEEKLY AVERAGE" : "DAILY FUEL", 44, headlineY);

  // ── big calorie number ───────────────────────────────────────────────────────
  const cals = mode === "weekly" ? Math.round(weeklyAvg) : Math.round(dailyData.consumed);
  const calStr = cals.toLocaleString("en-IN");
  ctx.font = "800 96px 'DM Sans', sans-serif";
  const calMeasure = ctx.measureText(calStr);

  // glow shadow behind number
  ctx.shadowColor = accentRgba(0.5);
  ctx.shadowBlur = 48;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(calStr, 44, headlineY + 108);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  // kcal label
  ctx.font = "500 18px 'DM Sans', sans-serif";
  ctx.fillStyle = accentRgba(0.8);
  ctx.fillText("KCAL", 44 + calMeasure.width + 12, headlineY + 90);

  // ── progress arc ─────────────────────────────────────────────────────────────
  const arcCX = W - 100;
  const arcCY = headlineY + 56;
  const arcRadius = 56;
  const pct = Math.min((dailyData.consumed / (dailyData.goal || 2000)) * 100, 100);
  drawArc(ctx, arcCX, arcCY, arcRadius, mode === "weekly" ? Math.min((weeklyAvg / (dailyData.goal || 2000)) * 100, 100) : pct, "rgba(255,255,255,0.07)", accentColor);

  // arc center text
  ctx.font = "700 18px 'DM Sans', sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  const arcPct = mode === "weekly" ? Math.min(Math.round((weeklyAvg / (dailyData.goal || 2000)) * 100), 100) : Math.round(pct);
  ctx.fillText(`${arcPct}%`, arcCX, arcCY + 6);
  ctx.font = "400 10px 'DM Sans', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText("of goal", arcCX, arcCY + 20);
  ctx.textAlign = "left";

  // ── divider ──────────────────────────────────────────────────────────────────
  const divY = headlineY + 136;
  const divGrad = ctx.createLinearGradient(44, 0, W - 44, 0);
  divGrad.addColorStop(0, accentRgba(0.4));
  divGrad.addColorStop(1, "transparent");
  ctx.fillStyle = divGrad;
  ctx.fillRect(44, divY, W - 88, 1);

  // ── stat badges ──────────────────────────────────────────────────────────────
  const badges: { label: string; value: string; color: string; show: boolean }[] = [
    {
      label: "GOAL",
      value: `${dailyData.goal} kcal`,
      color: accentColor,
      show: true,
    },
    {
      label: "MEALS",
      value: `${dailyData.meals} logged`,
      color: "#38bdf8",
      show: toggleMeals,
    },
    {
      label: "STREAK",
      value: `${weeklyStreak} days`,
      color: "#a78bfa",
      show: toggleStreak,
    },
    {
      label: "% OF GOAL",
      value: `${Math.min(Math.round((cals / (dailyData.goal || 2000)) * 100), 100)}%`,
      color: "#fb923c",
      show: toggleGoalPct,
    },
    ...(dailyData.topFood
      ? [{ label: "TOP FOOD", value: dailyData.topFood.length > 14 ? dailyData.topFood.slice(0, 13) + "…" : dailyData.topFood, color: "#34d399", show: true }]
      : []),
  ].filter((b) => b.show);

  // arrange badges in a scattered layout
  const badgeStartY = divY + 28;
  const badgeLayouts = [
    { x: 44, y: badgeStartY, angle: -2 },
    { x: 210, y: badgeStartY + 16, angle: 1.5 },
    { x: 380, y: badgeStartY - 8, angle: -1 },
    { x: 60, y: badgeStartY + 120, angle: 2 },
    { x: 260, y: badgeStartY + 104, angle: -1.5 },
  ];

  badges.slice(0, 5).forEach((badge, i) => {
    const layout = badgeLayouts[i];
    const [br, bg, bb] = hexToRgb(badge.color);
    const bRgba = (a: number) => `rgba(${br},${bg},${bb},${a})`;

    ctx.save();
    ctx.translate(layout.x + 70, layout.y + 30);
    ctx.rotate((layout.angle * Math.PI) / 180);
    ctx.translate(-(layout.x + 70), -(layout.y + 30));

    // badge bg
    rrect(ctx, layout.x, layout.y, 140, 60, 14);
    ctx.fillStyle = bRgba(0.1);
    ctx.fill();
    ctx.strokeStyle = bRgba(0.25);
    ctx.lineWidth = 1;
    ctx.stroke();

    // label
    ctx.font = "500 10px 'DM Sans', sans-serif";
    ctx.fillStyle = bRgba(0.65);
    ctx.letterSpacing = "1.5px";
    ctx.fillText(badge.label, layout.x + 14, layout.y + 22);
    ctx.letterSpacing = "0px";

    // value
    ctx.font = "700 16px 'DM Sans', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(badge.value, layout.x + 14, layout.y + 44);

    ctx.restore();
  });

  // ── bottom section ──────────────────────────────────────────────────────────
  const bottomY = H - 200;

  // divider
  const divGrad2 = ctx.createLinearGradient(44, 0, W - 44, 0);
  divGrad2.addColorStop(0, "transparent");
  divGrad2.addColorStop(0.5, accentRgba(0.25));
  divGrad2.addColorStop(1, "transparent");
  ctx.fillStyle = divGrad2;
  ctx.fillRect(44, bottomY, W - 88, 1);

  // progress bar
  const barY = bottomY + 32;
  const barW = W - 88;
  const barH = 10;
  rrect(ctx, 44, barY, barW, barH, 5);
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fill();

  const fillW = Math.max(barH, (Math.min(arcPct, 100) / 100) * barW);
  const barGrad = ctx.createLinearGradient(44, 0, 44 + fillW, 0);
  barGrad.addColorStop(0, accentRgba(0.6));
  barGrad.addColorStop(1, accentColor);
  rrect(ctx, 44, barY, fillW, barH, 5);
  ctx.fillStyle = barGrad;
  ctx.fill();

  // bar label
  ctx.font = "500 11px 'DM Sans', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillText(`${arcPct}% of ${dailyData.goal} kcal daily goal`, 44, barY + 26);

  // ── watermark / tagline ──────────────────────────────────────────────────────
  ctx.font = "400 12px 'DM Sans', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.textAlign = "center";
  ctx.fillText("tracked with Qelvi", W / 2, H - 44);
  ctx.textAlign = "left";
}

// ── component ─────────────────────────────────────────────────────────────────
export default function ShareModal({ data, onClose }: Props) {
  const { user } = useAuthStore();
  const accentColor = useAccentColor();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [mode, setMode] = useState<CardMode>("daily");
  const [toggleGoalPct, setToggleGoalPct] = useState(true);
  const [toggleMeals, setToggleMeals] = useState(true);
  const [toggleStreak, setToggleStreak] = useState(true);
  const [weeklyAvg, setWeeklyAvg] = useState(0);
  const [weeklyStreak, setWeeklyStreak] = useState(0);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  const canNativeShare = typeof navigator.share === "function";

  // fetch weekly data once
  useEffect(() => {
    const end = new Date().toISOString().split("T")[0];
    const start = subDays(new Date(), 6).toISOString().split("T")[0];
    logsApi.history(start, end).then((res) => {
      const days = res.data as { total_calories: number }[];
      const nonZero = days.filter((d) => d.total_calories > 0);
      if (nonZero.length > 0) {
        setWeeklyAvg(nonZero.reduce((s, d) => s + d.total_calories, 0) / nonZero.length);
      }
      setWeeklyStreak(nonZero.length);
    }).catch(() => {});
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    buildCard(canvas, mode, accentColor, data, weeklyAvg, weeklyStreak, toggleGoalPct, toggleMeals, toggleStreak);
  }, [mode, accentColor, data, weeklyAvg, weeklyStreak, toggleGoalPct, toggleMeals, toggleStreak]);

  useEffect(() => { redraw(); }, [redraw]);

  const getBlob = (): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas) return reject(new Error("no canvas"));
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    });

  const handleShare = async () => {
    setSharing(true);
    try {
      const blob = await getBlob();
      const file = new File([blob], "qelvi-stats.png", { type: "image/png" });
      if (canNativeShare && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${user?.name ?? "My"} daily stats — Qelvi`,
          text: `I logged ${Math.round(data.consumed)} kcal today! 💪`,
        });
      } else {
        // Desktop: copy to clipboard
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // fallback: download
      handleDownload();
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = async () => {
    const blob = await getBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qelvi-stats-${new Date().toISOString().split("T")[0]}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card w-full max-w-md md:max-w-lg mx-auto max-h-[95dvh] overflow-y-auto animate-slide-up rounded-t-2xl md:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-bg-elevated">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-text-primary">Share your stats</p>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: "rgba(var(--accent-rgb)/0.12)", color: "rgba(var(--accent-rgb)/1)" }}>BETA</span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">Export a card for your stories</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-bg-elevated hover:bg-bg-border flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 p-4 pb-0">
          {(["daily", "weekly"] as CardMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                mode === m
                  ? "bg-accent-primary text-btn-fg"
                  : "bg-bg-elevated text-text-muted hover:text-text-primary"
              }`}
            >
              {m === "daily" ? "Today" : "Weekly"}
            </button>
          ))}
        </div>

        {/* Canvas preview */}
        <div className="p-4">
          <div className="rounded-xl overflow-hidden border border-bg-border">
            <canvas
              ref={canvasRef}
              className="w-full h-auto block"
              style={{ aspectRatio: "9/16" }}
            />
          </div>
        </div>

        {/* Stat toggles */}
        <div className="px-4 pb-3">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Include on card</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Goal %", val: toggleGoalPct, set: setToggleGoalPct },
              { label: "Meals", val: toggleMeals, set: setToggleMeals },
              { label: "Streak", val: toggleStreak, set: setToggleStreak },
            ].map((t) => (
              <button
                key={t.label}
                onClick={() => t.set(!t.val)}
                className={`px-3 py-1 rounded-lg text-xs transition-all border ${
                  t.val
                    ? "border-accent-primary/30 text-accent-primary"
                    : "border-bg-border text-text-muted"
                }`}
                style={t.val ? { backgroundColor: "rgba(var(--accent-rgb)/0.08)" } : {}}
              >
                {t.val ? "✓ " : ""}{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 p-4 pt-2 border-t border-bg-elevated">
          <button
            onClick={handleShare}
            disabled={sharing}
            className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
          >
            {sharing ? (
              "Preparing…"
            ) : copied ? (
              <><Check size={15} /> Copied!</>
            ) : canNativeShare ? (
              <><Share2 size={15} /> Share</>
            ) : (
              <><Copy size={15} /> Copy image</>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="btn-ghost flex items-center justify-center gap-2 px-4 text-sm"
            title="Download PNG"
          >
            <Download size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
