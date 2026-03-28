/**
 * ShareModal v2 — Qelvi
 * Cinematic share card with:
 *  - Draggable 3D ring visualization (canvas tilt + perspective)
 *  - Ambient particle system (floating accent-colored orbs)
 *  - 5 themes: Void · Aurora · Sakura · Solar · Arctic
 *  - Smart badge system driven by real stats
 *  - Animated canvas card: noise, glow blobs, diagonal accents, shimmer pills
 *  - Animated CTA with shimmer sweep, theme-reactive accent
 */

import { useEffect, useRef, useState } from "react";
import { X, Download, Share2, Check, Copy } from "lucide-react";
import { subDays } from "date-fns";
import { logsApi } from "../lib/api";
import { useAuthStore } from "../store/authStore";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

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

interface Badge {
  id: string;
  emoji: string;
  label: string;
  sub: string;
  color: string;
  glow: string;
}

interface Theme {
  id: string;
  name: string;
  bg: string;
  type: "solid" | "gradient" | "noise";
  accent: string;
  rgb: [number, number, number];
  text: string;
  light: boolean;
  vibe: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const THEMES: Theme[] = [
  {
    id: "void",
    name: "Void",
    bg: "#060608",
    type: "noise",
    accent: "#a78bfa",
    rgb: [167, 139, 250],
    text: "#fff",
    light: false,
    vibe: "dark luxury",
  },
  {
    id: "aurora",
    name: "Aurora",
    bg: "#050e14",
    type: "gradient",
    accent: "#34d399",
    rgb: [52, 211, 153],
    text: "#f0fff8",
    light: false,
    vibe: "electric forest",
  },
  {
    id: "sakura",
    name: "Sakura",
    bg: "#100812",
    type: "gradient",
    accent: "#f472b6",
    rgb: [244, 114, 182],
    text: "#fff0f8",
    light: false,
    vibe: "y2k fantasy",
  },
  {
    id: "solar",
    name: "Solar",
    bg: "#0b0804",
    type: "gradient",
    accent: "#fb923c",
    rgb: [251, 146, 60],
    text: "#fffaf0",
    light: false,
    vibe: "warm energy",
  },
  {
    id: "arctic",
    name: "Arctic",
    bg: "#f0f4ff",
    type: "noise",
    accent: "#3b82f6",
    rgb: [59, 130, 246],
    text: "#0a0f1e",
    light: true,
    vibe: "clean minimal",
  },
];

function computeBadges(
  data: ShareData,
  streak: number,
  weeklyAvg: number
): Badge[] {
  const pct = data.goal > 0 ? (data.consumed / data.goal) * 100 : 0;
  const bs: Badge[] = [];
  if (pct >= 90 && pct <= 112)
    bs.push({
      id: "target",
      emoji: "🎯",
      label: "On Target",
      sub: "Nailed the goal",
      color: "#22c55e",
      glow: "rgba(34,197,94,0.4)",
    });
  if (streak >= 5)
    bs.push({
      id: "streak",
      emoji: "🔥",
      label: `${streak}-Day Streak`,
      sub: "Consistency king",
      color: "#f97316",
      glow: "rgba(249,115,22,0.4)",
    });
  if (data.meals >= 4)
    bs.push({
      id: "chef",
      emoji: "👨‍🍳",
      label: "Meal Machine",
      sub: `${data.meals} meals`,
      color: "#a855f7",
      glow: "rgba(168,85,247,0.4)",
    });
  if (pct < 88)
    bs.push({
      id: "deficit",
      emoji: "⚡",
      label: "In The Zone",
      sub: "Calorie deficit",
      color: "#38bdf8",
      glow: "rgba(56,189,248,0.4)",
    });
  if (pct > 112)
    bs.push({
      id: "fuelled",
      emoji: "💪",
      label: "Fuelled Up",
      sub: "High energy day",
      color: "#fbbf24",
      glow: "rgba(251,191,36,0.4)",
    });
  if (weeklyAvg > 0 && Math.abs(weeklyAvg - data.goal) / data.goal < 0.05)
    bs.push({
      id: "wizard",
      emoji: "🏆",
      label: "Weekly Wizard",
      sub: "Insanely consistent",
      color: "#ec4899",
      glow: "rgba(236,72,153,0.4)",
    });
  if (!bs.length)
    bs.push({
      id: "tracking",
      emoji: "📊",
      label: "Tracking Strong",
      sub: "Every cal counts",
      color: "#6366f1",
      glow: "rgba(99,102,241,0.4)",
    });
  return bs;
}

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS UTILS
// ─────────────────────────────────────────────────────────────────────────────

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rrect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
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

// ─────────────────────────────────────────────────────────────────────────────
// 3D RING HOOK
// ─────────────────────────────────────────────────────────────────────────────

function use3DRing(
  ref: React.RefObject<HTMLCanvasElement | null>,
  themeIdx: number,
  mode: CardMode,
  data: ShareData,
  weeklyAvg: number
) {
  const rot = useRef({ x: 0.35, y: 0, dragging: false, lx: 0, ly: 0 });
  const raf = useRef<number>(0);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const CX = 65,
      CY = 65,
      R = 50,
      T = 11;

    const onDown = (x: number, y: number) => {
      rot.current.dragging = true;
      rot.current.lx = x;
      rot.current.ly = y;
      c.style.cursor = "grabbing";
    };
    const onMove = (x: number, y: number) => {
      if (!rot.current.dragging) return;
      rot.current.y += (x - rot.current.lx) * 0.01;
      rot.current.x += (y - rot.current.ly) * 0.01;
      rot.current.lx = x;
      rot.current.ly = y;
    };
    const onUp = () => {
      rot.current.dragging = false;
      c.style.cursor = "grab";
    };

    const md = (e: MouseEvent) => onDown(e.clientX, e.clientY);
    const mm = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const td = (e: TouchEvent) =>
      onDown(e.touches[0].clientX, e.touches[0].clientY);
    const tm = (e: TouchEvent) => {
      e.preventDefault();
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    c.addEventListener("mousedown", md);
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", onUp);
    c.addEventListener("touchstart", td, { passive: true });
    c.addEventListener("touchmove", tm, { passive: false });
    c.addEventListener("touchend", onUp);

    function draw() {
      ctx.clearRect(0, 0, 160, 160);
      const t = THEMES[themeIdx];
      const [ar, ag, ab] = t.rgb;
      const cals =
        mode === "weekly"
          ? Math.round(weeklyAvg || data.consumed)
          : Math.round(data.consumed);
      const pct = Math.min((cals / (data.goal || 2000)) * 100, 100);
      const sy = Math.max(Math.abs(Math.cos(rot.current.x)), 0.01);
      const sk = Math.sin(rot.current.x);

      // Shadow
      ctx.save();
      ctx.translate(CX, CY + 7);
      ctx.scale(1, sy);
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(0,0,0,0.28)";
      ctx.lineWidth = T + 6;
      ctx.stroke();
      ctx.restore();
      // Track
      ctx.save();
      ctx.translate(CX, CY + sk * R * 0.08);
      ctx.scale(1, sy);
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, 2 * Math.PI);
      ctx.strokeStyle = t.light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.07)";
      ctx.lineWidth = T;
      ctx.lineCap = "butt";
      ctx.stroke();
      ctx.restore();
      // Fill
      ctx.save();
      ctx.translate(CX, CY + sk * R * 0.08);
      ctx.scale(1, sy);
      ctx.beginPath();
      ctx.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + (pct / 100) * 2 * Math.PI);
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = T;
      ctx.lineCap = "round";
      ctx.shadowColor = `rgba(${ar},${ag},${ab},0.75)`;
      ctx.shadowBlur = 22;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
      // Inner ring
      ctx.save();
      ctx.translate(CX, CY + sk * R * 0.05);
      ctx.scale(1, sy);
      ctx.beginPath();
      ctx.arc(0, 0, R - T - 5, 0, 2 * Math.PI);
      ctx.strokeStyle = t.light
        ? "rgba(0,0,0,0.04)"
        : "rgba(255,255,255,0.045)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      // Text
      ctx.font = "800 20px 'Syne','DM Sans',sans-serif";
      ctx.fillStyle = t.text || "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${Math.round(pct)}%`, CX, CY - 3);
      ctx.font = "400 9px 'DM Sans',sans-serif";
      ctx.fillStyle = t.light ? "rgba(0,0,0,0.38)" : "rgba(255,255,255,0.38)";
      ctx.fillText("of goal", CX, CY + 12);

      if (!rot.current.dragging) rot.current.y += 0.005;
      raf.current = requestAnimationFrame(draw);
    }
    raf.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf.current);
      c.removeEventListener("mousedown", md);
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", onUp);
      c.removeEventListener("touchstart", td);
      c.removeEventListener("touchmove", tm);
      c.removeEventListener("touchend", onUp);
    };
  }, [ref, themeIdx, mode, data, weeklyAvg]);
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTICLE HOOK
// ─────────────────────────────────────────────────────────────────────────────

function useParticles(
  ref: React.RefObject<HTMLCanvasElement | null>,
  themeIdx: number
) {
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    let pts: any[] = [],
      raf: number;
    const W = 400,
      H = 500;
    c.width = W;
    c.height = H;
    const mk = () => {
      const [r, g, b] = THEMES[themeIdx].rgb;
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.35,
        vy: Math.random() * -0.5 - 0.1,
        sz: Math.random() * 1.8 + 0.4,
        a: Math.random() * 0.35 + 0.08,
        col: `rgba(${r},${g},${b},`,
      };
    };
    const frame = () => {
      ctx.clearRect(0, 0, W, H);
      if (pts.length < 40) pts.push(mk());
      pts = pts.filter((p: any) => {
        p.x += p.vx;
        p.y += p.vy;
        p.a -= 0.0015;
        if (p.a <= 0) return false;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.sz, 0, 2 * Math.PI);
        ctx.fillStyle = p.col + p.a + ")";
        ctx.fill();
        return true;
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [ref, themeIdx]);
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD BUILDER
// ─────────────────────────────────────────────────────────────────────────────

async function buildCard(
  canvas: HTMLCanvasElement,
  mode: CardMode,
  theme: Theme,
  data: ShareData,
  weeklyAvg: number,
  streak: number,
  badges: Badge[],
  toggles: { badges: boolean; meals: boolean; streak: boolean }
) {
  const W = 540,
    H = 960;
  const ctx = canvas.getContext("2d")!;
  await document.fonts.ready;
  const [ar, ag, ab] = theme.rgb;
  const A = (a: number) => `rgba(${ar},${ag},${ab},${a})`;
  const L = theme.light;
  const cals =
    mode === "weekly" ? Math.round(weeklyAvg) : Math.round(data.consumed);
  const pct = Math.min(Math.round((cals / (data.goal || 2000)) * 100), 100);

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  if (theme.type === "noise") {
    for (let y = 0; y < H; y += 3)
      for (let x = y % 6 === 0 ? 0 : 3; x < W; x += 6) {
        ctx.fillStyle = `rgba(${L ? "0,0,0" : "255,255,255"},${(
          Math.random() * 0.016 +
          0.006
        ).toFixed(3)})`;
        ctx.fillRect(x, y, 1, 1);
      }
  }
  if (theme.type === "gradient") {
    const g1 = ctx.createRadialGradient(
      W * 0.88,
      H * 0.08,
      0,
      W * 0.88,
      H * 0.08,
      400
    );
    g1.addColorStop(0, A(0.22));
    g1.addColorStop(0.5, A(0.07));
    g1.addColorStop(1, "transparent");
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createRadialGradient(
      W * 0.08,
      H * 0.82,
      0,
      W * 0.08,
      H * 0.82,
      280
    );
    g2.addColorStop(0, A(0.15));
    g2.addColorStop(1, "transparent");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.strokeStyle = L ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.02)";
  ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += 54) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 54) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(W - i * 80, 0);
    ctx.lineTo(W, (i + 1) * 80);
    ctx.stroke();
  }
  ctx.restore();

  const tl = ctx.createLinearGradient(0, 0, W, 0);
  tl.addColorStop(0, "transparent");
  tl.addColorStop(0.15, A(0.9));
  tl.addColorStop(0.85, A(0.9));
  tl.addColorStop(1, "transparent");
  ctx.fillStyle = tl;
  ctx.fillRect(0, 0, W, 2);
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(W * 0.15 + i * ((W * 0.7) / 4), 1, 2, 0, 2 * Math.PI);
    ctx.fillStyle = A(0.8);
    ctx.fill();
  }

  ctx.font = "800 13px 'Syne','DM Sans',sans-serif";
  ctx.letterSpacing = "5px";
  ctx.fillStyle = A(1);
  ctx.fillText("QELVI", 44, 70);
  ctx.letterSpacing = "0px";

  const chip =
    mode === "weekly"
      ? "7-DAY RECAP"
      : new Date()
          .toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
          .toUpperCase();
  ctx.font = "500 10px 'DM Sans',sans-serif";
  const cW = ctx.measureText(chip).width + 24;
  rrect(ctx, W - 44 - cW, 54, cW, 24, 6);
  ctx.fillStyle = L ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.07)";
  ctx.fill();
  ctx.strokeStyle = A(0.2);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = L ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.45)";
  ctx.fillText(chip, W - 44 - cW + 12, 70);
  ctx.fillStyle = L ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.055)";
  ctx.fillRect(44, 92, W - 88, 0.8);

  const heroY = 144;
  ctx.font = "300 13px 'DM Sans',sans-serif";
  ctx.fillStyle = L ? "rgba(0,0,0,0.32)" : "rgba(255,255,255,0.3)";
  ctx.letterSpacing = "4px";
  ctx.fillText(mode === "weekly" ? "WEEKLY AVG" : "TODAY'S FUEL", 44, heroY);
  ctx.letterSpacing = "0px";

  // ── Ring geometry ────────────────────────────────────────────────────────
  // Shifted closer to the right edge so even wide calorie numbers can't reach it.
  // Left edge of ring = aCX - aR = 470 - 54 = 416
  const aCX = W - 70,   // 470
    aCY = heroY + 60,   // 204
    aR  = 54,
    aSY = 0.62;

  // ── Dynamic calorie font ─────────────────────────────────────────────────
  // Measure the string at 102 px and shrink by 2 px steps until it fits
  // to the left of the ring with a 20 px safety gap.
  const ringEdgeLeft = aCX - aR - 20; // 396
  const maxNumW      = ringEdgeLeft - 44; // 352 px available
  const calStr = cals.toLocaleString("en-IN");
  let calFontSize = 102;
  ctx.font = `800 ${calFontSize}px 'Syne','DM Sans',sans-serif`;
  let calW2 = ctx.measureText(calStr).width;
  while (calW2 > maxNumW && calFontSize > 44) {
    calFontSize -= 2;
    ctx.font = `800 ${calFontSize}px 'Syne','DM Sans',sans-serif`;
    calW2 = ctx.measureText(calStr).width;
  }
  // Baseline Y is proportional to the resolved font size so nothing is hardcoded
  const calBaseY = heroY + Math.round(calFontSize * 1.16) + 6;

  // ── Draw ring FIRST so the calorie number paints on top ──────────────────
  ctx.save();
  ctx.translate(aCX, aCY + 6);
  ctx.scale(1, aSY);
  ctx.beginPath();
  ctx.arc(0, 0, aR, 0, 2 * Math.PI);
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 14;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(aCX, aCY);
  ctx.scale(1, aSY);
  ctx.beginPath();
  ctx.arc(0, 0, aR, 0, 2 * Math.PI);
  ctx.strokeStyle = L ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.07)";
  ctx.lineWidth = 10;
  ctx.lineCap = "butt";
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(aCX, aCY);
  ctx.scale(1, aSY);
  ctx.beginPath();
  ctx.arc(0, 0, aR, -Math.PI / 2, -Math.PI / 2 + (pct / 100) * 2 * Math.PI);
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.shadowColor = A(0.7);
  ctx.shadowBlur = 22;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.save();
  ctx.translate(aCX, aCY);
  ctx.scale(1, aSY);
  ctx.beginPath();
  ctx.arc(0, 0, aR - 14, 0, 2 * Math.PI);
  ctx.strokeStyle = L ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  ctx.font = "800 18px 'DM Sans',sans-serif";
  ctx.fillStyle = theme.text;
  ctx.textAlign = "center";
  ctx.fillText(`${pct}%`, aCX, aCY + 6);
  ctx.font = "400 9px 'DM Sans',sans-serif";
  ctx.fillStyle = L ? "rgba(0,0,0,0.33)" : "rgba(255,255,255,0.33)";
  ctx.fillText("of goal", aCX, aCY + 19);
  ctx.textAlign = "left";

  // ── Draw calorie number on top of ring ───────────────────────────────────
  ctx.font = `800 ${calFontSize}px 'Syne','DM Sans',sans-serif`;
  ctx.shadowColor = A(0.55);
  ctx.shadowBlur = 80;
  ctx.fillStyle = theme.text;
  ctx.fillText(calStr, 44, calBaseY);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  // "kcal" — small label sitting BELOW the number, well left of the ring
  ctx.font = "400 10px 'DM Sans',sans-serif";
  ctx.letterSpacing = "2px";
  ctx.fillStyle = L ? "rgba(0,0,0,0.38)" : "rgba(255,255,255,0.32)";
  ctx.fillText("KCAL", 54, calBaseY + 30);
  ctx.letterSpacing = "0px";

  // ── Divider below hero — Y relative to actual rendered baseline ──────────
  const hrY = calBaseY + 48;
  const hrG = ctx.createLinearGradient(44, 0, W - 44, 0);
  hrG.addColorStop(0, A(0.6));
  hrG.addColorStop(0.5, A(0.12));
  hrG.addColorStop(1, "transparent");
  ctx.fillStyle = hrG;
  ctx.fillRect(44, hrY, W - 88, 1);

  const stats = [
    {
      label: "GOAL",
      value: `${data.goal.toLocaleString()} kcal`,
      color: theme.accent,
      show: true,
    },
    {
      label: "MEALS",
      value: `${data.meals} logged`,
      color: "#38bdf8",
      show: toggles.meals,
    },
    {
      label: "STREAK",
      value: `${streak}d 🔥`,
      color: "#fb923c",
      show: toggles.streak,
    },
  ].filter((s) => s.show);
  const pH = 54,
    gp = 10,
    pc2 = stats.length,
    pW = Math.floor((W - 88 - gp * (pc2 - 1)) / pc2),
    pY = hrY + 24;
  stats.forEach((s, i) => {
    const px = 44 + i * (pW + gp);
    const [pr, pg2, pb] = hexRgb(s.color);
    const sA = (a: number) => `rgba(${pr},${pg2},${pb},${a})`;
    const pg3 = ctx.createLinearGradient(px, pY, px, pY + pH);
    pg3.addColorStop(0, sA(L ? 0.1 : 0.14));
    pg3.addColorStop(1, sA(L ? 0.04 : 0.06));
    rrect(ctx, px, pY, pW, pH, 13);
    ctx.fillStyle = pg3;
    ctx.fill();
    ctx.strokeStyle = sA(L ? 0.18 : 0.22);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    rrect(ctx, px + 2, pY + 2, pW - 4, 2, 1);
    ctx.fillStyle = sA(0.5);
    ctx.fill();
    ctx.font = "500 9px 'DM Sans',sans-serif";
    ctx.letterSpacing = "1.5px";
    ctx.fillStyle = sA(0.7);
    ctx.fillText(s.label, px + 13, pY + 20);
    ctx.letterSpacing = "0px";
    ctx.font = "700 14px 'DM Sans',sans-serif";
    ctx.fillStyle = theme.text;
    const maxValW = pW - 26;
    let valStr = s.value;
    while (ctx.measureText(valStr).width > maxValW && valStr.length > 2)
      valStr = valStr.slice(0, -1);
    if (valStr !== s.value) valStr = valStr.trimEnd() + "…";
    ctx.fillText(valStr, px + 13, pY + 40);
  });

  // Track where content ends so each section stacks naturally below the last
  let contentEndY = pY + pH;

  // ── Top food ─────────────────────────────────────────────────────────────
  if (data.topFood) {
    const tfY = contentEndY + 22;
    const tfG = ctx.createLinearGradient(44, tfY, W - 44, tfY);
    tfG.addColorStop(0, A(L ? 0.1 : 0.15));
    tfG.addColorStop(1, A(L ? 0.02 : 0.03));
    rrect(ctx, 44, tfY, W - 88, 58, 14);
    ctx.fillStyle = tfG;
    ctx.fill();
    ctx.strokeStyle = A(L ? 0.15 : 0.2);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    rrect(ctx, 44, tfY + 8, 3, 42, 2);
    ctx.fillStyle = A(0.85);
    ctx.fill();
    ctx.font = "500 9px 'DM Sans',sans-serif";
    ctx.letterSpacing = "1.5px";
    ctx.fillStyle = L ? "rgba(0,0,0,0.32)" : "rgba(255,255,255,0.32)";
    ctx.fillText("TOP FOOD TODAY", 60, tfY + 22);
    ctx.letterSpacing = "0px";
    const tf =
      data.topFood.length > 20 ? data.topFood.slice(0, 19) + "…" : data.topFood;
    ctx.font = "700 18px 'DM Sans',sans-serif";
    ctx.fillStyle = theme.text;
    ctx.fillText(tf, 60, tfY + 46);
    contentEndY = tfY + 58;
  }

  // ── Badges — always shown when toggled, independent of whether topFood exists
  if (toggles.badges && badges.length) {
    const bsY = contentEndY + 20;
    ctx.font = "500 9px 'DM Sans',sans-serif";
    ctx.letterSpacing = "2px";
    ctx.fillStyle = L ? "rgba(0,0,0,0.26)" : "rgba(255,255,255,0.26)";
    ctx.fillText("EARNED TODAY", 44, bsY);
    ctx.letterSpacing = "0px";
    const maxB = Math.min(badges.length, 3),
      bW = Math.floor((W - 88 - 9 * (maxB - 1)) / maxB),
      bH = 84,
      bY = bsY + 12;
    badges.slice(0, maxB).forEach((badge, i) => {
      const bx = 44 + i * (bW + 9);
      const [br, bg3, bb2] = hexRgb(badge.color);
      const bA = (a: number) => `rgba(${br},${bg3},${bb2},${a})`;
      const bG = ctx.createLinearGradient(bx, bY, bx, bY + bH);
      bG.addColorStop(0, bA(L ? 0.1 : 0.16));
      bG.addColorStop(1, bA(L ? 0.04 : 0.07));
      ctx.shadowColor = bA(0.45);
      ctx.shadowBlur = 24;
      rrect(ctx, bx, bY, bW, bH, 15);
      ctx.fillStyle = bG;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = bA(L ? 0.2 : 0.28);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      const sG = ctx.createLinearGradient(bx, bY, bx + bW, bY);
      sG.addColorStop(0, "transparent");
      sG.addColorStop(0.5, bA(0.3));
      sG.addColorStop(1, "transparent");
      rrect(ctx, bx + 2, bY + 1, bW - 4, 1, 0.5);
      ctx.fillStyle = sG;
      ctx.fill();
      ctx.font = "28px serif";
      ctx.textAlign = "center";
      ctx.fillText(badge.emoji, bx + bW / 2, bY + 38);
      ctx.font = "700 11px 'DM Sans',sans-serif";
      ctx.fillStyle = theme.text;
      const maxLabelW = bW - 16;
      let labelStr = badge.label;
      while (ctx.measureText(labelStr).width > maxLabelW && labelStr.length > 3)
        labelStr = labelStr.slice(0, -1);
      if (labelStr !== badge.label) labelStr = labelStr.trimEnd() + "…";
      ctx.fillText(labelStr, bx + bW / 2, bY + 57);
      ctx.font = "400 9px 'DM Sans',sans-serif";
      ctx.fillStyle = L ? "rgba(0,0,0,0.37)" : "rgba(255,255,255,0.37)";
      let subStr = badge.sub;
      const maxSubW = bW - 12;
      while (ctx.measureText(subStr).width > maxSubW && subStr.length > 3)
        subStr = subStr.slice(0, -1);
      if (subStr !== badge.sub) subStr = subStr.trimEnd() + "…";
      ctx.fillText(subStr, bx + bW / 2, bY + 70);
      ctx.textAlign = "left";
    });
    contentEndY = bsY + 12 + bH; // label-y + gap + badge-height
  }

  // ── Insight panel — creative fill between content and footer ──────────────
  // Replaces the old ghost percentage: shows a concise progress snapshot with
  // a motivational read-out, themed accent glow, and a dot-grid decoration.
  const insightY = contentEndY + 32;
  const insightH = 128;
  {
    // Panel background
    const ipG = ctx.createLinearGradient(44, insightY, W - 44, insightY + insightH);
    ipG.addColorStop(0, A(L ? 0.08 : 0.13));
    ipG.addColorStop(1, A(L ? 0.02 : 0.05));
    rrect(ctx, 44, insightY, W - 88, insightH, 20);
    ctx.fillStyle = ipG;
    ctx.fill();
    ctx.strokeStyle = A(L ? 0.16 : 0.2);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Shimmer top edge
    const shimG = ctx.createLinearGradient(44, insightY, W - 44, insightY);
    shimG.addColorStop(0, "transparent");
    shimG.addColorStop(0.5, A(0.55));
    shimG.addColorStop(1, "transparent");
    rrect(ctx, 46, insightY + 1, W - 92, 1, 0.5);
    ctx.fillStyle = shimG;
    ctx.fill();
    // Left column — % centered in left section (x=44..190, midpoint=117)
    // Vertically: % baseline at +70, "OF GOAL" at +88 → block sits in middle of 128px panel
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "600 30px 'Syne','DM Sans',sans-serif";
    ctx.fillStyle = theme.accent;
    ctx.shadowColor = A(0.5);
    ctx.shadowBlur = 8;
    ctx.fillText(`${pct}%`, 117, insightY + 70);
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.font = "500 8px 'DM Sans',sans-serif";
    ctx.letterSpacing = "2px";
    ctx.fillStyle = L ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.28)";
    ctx.fillText("OF GOAL", 117, insightY + 88);
    ctx.letterSpacing = "0px";
    ctx.restore();
    // Vertical divider — at x=190
    ctx.beginPath();
    ctx.moveTo(190, insightY + 18);
    ctx.lineTo(190, insightY + insightH - 18);
    ctx.strokeStyle = A(L ? 0.15 : 0.18);
    ctx.lineWidth = 0.7;
    ctx.stroke();
    // Right column — centered in right section (x=192..496, midpoint=344)
    const vibe =
      pct >= 90 && pct <= 110
        ? { h: "On Target! 🎯", s: "Goal crushed." }
        : pct > 110
        ? { h: "Fuelled Up! 💪", s: "High energy day." }
        : pct >= 70
        ? { h: "In The Zone ⚡", s: "Solid progress." }
        : pct >= 40
        ? { h: "Keep Going 🚀", s: "You've got this." }
        : { h: "Just Started 🌱", s: "Every cal counts." };
    ctx.save();
    ctx.textAlign = "center";
    // Clamp the headline so it never overflows the right section (304px wide)
    ctx.font = "700 14px 'DM Sans',sans-serif";
    ctx.fillStyle = theme.text;
    let vibeH = vibe.h;
    while (ctx.measureText(vibeH).width > 290 && vibeH.length > 3)
      vibeH = vibeH.slice(0, -1);
    if (vibeH !== vibe.h) vibeH = vibeH.trimEnd() + "…";
    ctx.fillText(vibeH, 344, insightY + 54);
    ctx.font = "400 10px 'DM Sans',sans-serif";
    ctx.fillStyle = L ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.38)";
    ctx.fillText(vibe.s, 344, insightY + 74);
    ctx.font = "500 8px 'DM Sans',sans-serif";
    ctx.letterSpacing = "1.5px";
    ctx.fillStyle = A(0.65);
    ctx.fillText(mode === "weekly" ? "7-DAY RECAP" : "DAILY STATS", 344, insightY + 94);
    ctx.letterSpacing = "0px";
    ctx.restore();
    // Dot-grid decoration in the top-right of the panel
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        ctx.beginPath();
        ctx.arc(
          W - 52 - col * 13,
          insightY + 18 + row * 13,
          1.8,
          0,
          2 * Math.PI
        );
        ctx.fillStyle = A(Math.max(0.05, 0.32 - col * 0.05 - row * 0.07));
        ctx.fill();
      }
    }
  }

  // Bottom section — never overlaps the insight panel
  const bSY = Math.max(insightY + insightH + 32, H - 176);
  const bdG = ctx.createLinearGradient(44, 0, W - 44, 0);
  bdG.addColorStop(0, "transparent");
  bdG.addColorStop(0.5, A(0.18));
  bdG.addColorStop(1, "transparent");
  ctx.fillStyle = bdG;
  ctx.fillRect(44, bSY, W - 88, 0.8);
  ctx.font = "400 11px 'DM Sans',sans-serif";
  ctx.fillStyle = L ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.27)";
  ctx.fillText(
    `${pct}% · ${cals.toLocaleString()} of ${data.goal.toLocaleString()} kcal`,
    44,
    bSY + 24
  );
  const bY2 = bSY + 36,
    bW2 = W - 88,
    bH2 = 9;
  rrect(ctx, 44, bY2, bW2, bH2, 5);
  ctx.fillStyle = L ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.07)";
  ctx.fill();
  const fW = Math.max(bH2, (pct / 100) * bW2);
  const bfG = ctx.createLinearGradient(44, 0, 44 + fW, 0);
  bfG.addColorStop(0, A(0.4));
  bfG.addColorStop(0.6, A(0.8));
  bfG.addColorStop(1, theme.accent);
  rrect(ctx, 44, bY2, fW, bH2, 5);
  ctx.fillStyle = bfG;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(44 + fW, bY2 + bH2 / 2, 6, 0, 2 * Math.PI);
  ctx.fillStyle = theme.accent;
  ctx.shadowColor = A(0.8);
  ctx.shadowBlur = 16;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.font = "italic 400 10px 'DM Sans',sans-serif";
  ctx.fillStyle = L ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.16)";
  ctx.fillText(`#${theme.vibe}  ·  #qelvi`, 44, bY2 + 27);
  ctx.font = "400 11px 'DM Sans',sans-serif";
  ctx.fillStyle = L ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.13)";
  ctx.textAlign = "center";
  ctx.fillText("tracked with Qelvi", W / 2, H - 38);
  ctx.textAlign = "left";
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function ShareModal({ data, onClose }: Props) {
  const { user } = useAuthStore();
  const [mode, setMode] = useState<CardMode>("daily");
  const [themeIdx, setThemeIdx] = useState(0);
  const [toggles, setToggles] = useState({
    badges: true,
    meals: true,
    streak: true,
  });
  const [weeklyAvg, setWeeklyAvg] = useState(0);
  const [streak, setStreak] = useState(0);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [animating, setAnimating] = useState(false);

  const particleRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLCanvasElement>(null);
  const shareRef = useRef<HTMLCanvasElement>(null);

  const theme = THEMES[themeIdx];
  const badges = computeBadges(data, streak, weeklyAvg);
  const pct = Math.min(
    Math.round((data.consumed / (data.goal || 2000)) * 100),
    100
  );
  const canNativeShare = typeof navigator.share === "function";
  const [ar, ag, ab] = theme.rgb;
  const A = (a: number) => `rgba(${ar},${ag},${ab},${a})`;

  useEffect(() => {
    const end = new Date().toISOString().split("T")[0];
    const start = subDays(new Date(), 6).toISOString().split("T")[0];
    logsApi
      .history(start, end)
      .then((res) => {
        const days = res.data as { total_calories: number }[];
        const nz = days.filter((d) => d.total_calories > 0);
        if (nz.length)
          setWeeklyAvg(
            nz.reduce((s, d) => s + d.total_calories, 0) / nz.length
          );
        setStreak(nz.length);
      })
      .catch(() => {});
  }, []);

  use3DRing(ringRef, themeIdx, mode, data, weeklyAvg);
  useParticles(particleRef, themeIdx);

  useEffect(() => {
    const canvas = shareRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = 540;
    const H = 960;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildCard(canvas, mode, theme, data, weeklyAvg, streak, badges, toggles);
  }, [mode, theme, data, weeklyAvg, streak, badges, toggles]);

  const switchTheme = (i: number) => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      setThemeIdx(i);
      setAnimating(false);
    }, 200);
  };

  const getBlob = (): Promise<Blob> =>
    new Promise((res, rej) => {
      const c = shareRef.current;
      if (!c) return rej();
      c.toBlob((b) => (b ? res(b) : rej()), "image/png");
    });

  const handleShare = async () => {
    setSharing(true);
    try {
      const blob = await getBlob();
      const file = new File([blob], "qelvi-stats.png", { type: "image/png" });
      if (canNativeShare && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${user?.name ?? "My"} stats — Qelvi`,
          text: `Just hit ${pct}% of my calorie goal 💪`,
        });
      } else {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
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
    a.download = `qelvi-${mode}-${theme.id}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-6"
      style={{
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(20px)",
        animation: "qFI .3s ease",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap');
        @keyframes qFI{from{opacity:0}to{opacity:1}}
        @keyframes qSU{from{transform:translateY(28px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes qSH{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes qBI{from{transform:scale(.72) translateY(8px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
        @keyframes qNF{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}
        .qm{animation:qSU .4s cubic-bezier(.16,1,.3,1) both;}
        .qco{transition:opacity .2s,transform .2s;} .qco.fading{opacity:0;transform:scale(.96);}
        .qst:hover{transform:translateY(-2px);}
        .qbd:hover{transform:translateY(-3px) scale(1.04);}
        .qbn{background:linear-gradient(135deg,rgba(${ar},${ag},${ab},1),rgba(${ar},${ag},${ab},.72));background-size:200%;animation:qSH 3s ease infinite;box-shadow:0 8px 30px rgba(${ar},${ag},${ab},.35);}
        .qbn:hover{transform:translateY(-2px);box-shadow:0 14px 40px rgba(${ar},${ag},${ab},.52);}
        .qbn:active{transform:scale(.98);}
        .qsc::-webkit-scrollbar{display:none;}
      `}</style>

      <div
        className="qm w-full max-w-[400px] mx-auto rounded-t-3xl md:rounded-3xl flex flex-col"
        style={{
          background: "linear-gradient(160deg,#13131c,#0e0e16)",
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "0 40px 120px rgba(0,0,0,0.8)",
          position: "relative",
          maxHeight: "92dvh",
          overflow: "hidden",
        }}
      >
        {/* Particle canvas */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 400,
            zIndex: 0,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          <canvas
            ref={particleRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              opacity: 0.7,
            }}
          />
        </div>

        {/* Header */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Syne',sans-serif",
                fontSize: 16,
                fontWeight: 800,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              Share Stats
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: "1.5px",
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: A(0.15),
                  border: `1px solid ${A(0.3)}`,
                  color: theme.accent,
                }}
              >
                BETA
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.32)",
                marginTop: 2,
              }}
            >
              Drop it on your stories ✦
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.07)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              transition: "transform .2s",
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div
          className="qsc"
          style={{ position: "relative", zIndex: 1, overflowY: "auto", flex: 1 }}
        >
          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, padding: "12px 20px 0" }}>
            {(["daily", "weekly"] as CardMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: "7px 18px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "1px solid",
                  fontFamily: "'DM Sans',sans-serif",
                  transition: "all .2s",
                  ...(mode === m
                    ? {
                        background: theme.accent,
                        borderColor: "transparent",
                        color: "#000",
                        boxShadow: `0 4px 18px ${A(0.38)}`,
                      }
                    : {
                        background: "rgba(255,255,255,0.04)",
                        borderColor: "rgba(255,255,255,0.07)",
                        color: "rgba(255,255,255,0.4)",
                      }),
                }}
              >
                {m === "daily" ? "Today" : "Weekly"}
              </button>
            ))}
          </div>

          {/* Canvas preview — clip to ~220 px tall so it never dominates the modal */}
          <div style={{ padding: "12px 20px 0" }}>
            {/*
              Outer clip box: overflow:hidden + fixed maxHeight crops the 9:16 canvas
              to show only the top portion (branding + calorie number + ring).
              Arrows & theme pill are positioned relative to this 220 px box so they
              remain visible even though the inner canvas is much taller.
            */}
            <div
              style={{
                position: "relative",
                maxHeight: 220,
                overflow: "hidden",
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              }}
            >
              {/* Inner aspect-ratio container — maintains 9:16 so the canvas renders correctly */}
              <div
                className={`qco ${animating ? "fading" : ""}`}
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "9/16",
                }}
              >
                <canvas
                  ref={shareRef}
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "block",
                  }}
                />
                {/* Scanline texture */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    background:
                      "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.025) 2px,rgba(0,0,0,0.025) 4px)",
                  }}
                />
              </div>

              {/* Theme navigation arrows — relative to the 220 px clip box */}
              {(
                [
                  {
                    d: "left" as const,
                    p: 10,
                    icon: (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    ),
                    fn: () =>
                      switchTheme(
                        (themeIdx - 1 + THEMES.length) % THEMES.length
                      ),
                  },
                  {
                    d: "right" as const,
                    p: 10,
                    icon: (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    ),
                    fn: () => switchTheme((themeIdx + 1) % THEMES.length),
                  },
                ] as {
                  d: "left" | "right";
                  p: number;
                  icon: React.ReactNode;
                  fn: () => void;
                }[]
              ).map(({ d, p, icon, fn }) => (
                <button
                  key={d}
                  onClick={fn}
                  style={{
                    position: "absolute",
                    [d]: p,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.62)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.8)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all .2s",
                    zIndex: 2,
                    flexShrink: 0,
                  }}
                >
                  {icon}
                </button>
              ))}

              {/* Active theme name pill */}
              <div
                style={{
                  position: "absolute",
                  bottom: 10,
                  left: "50%",
                  transform: "translateX(-50%)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(0,0,0,0.65)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 999,
                  padding: "4px 12px",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "1.5px",
                  color: "rgba(255,255,255,0.65)",
                  whiteSpace: "nowrap",
                  zIndex: 2,
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: theme.accent,
                    flexShrink: 0,
                  }}
                />
                {theme.name.toUpperCase()}
              </div>
            </div>

            {/* Theme selector dots — padding gives scale() room so dots don't clip */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 10,
                marginTop: 12,
                padding: "4px 0",
              }}
            >
              {THEMES.map((t, i) => (
                <div
                  key={t.id}
                  onClick={() => switchTheme(i)}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    cursor: "pointer",
                    background: t.accent,
                    transition: "all .25s",
                    opacity: i === themeIdx ? 1 : 0.3,
                    transform: i === themeIdx ? "scale(1.5)" : "scale(1)",
                    boxShadow: i === themeIdx ? `0 0 8px ${t.accent}` : "none",
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
          </div>

          {/* 3D Ring + Stats — compact horizontal layout */}
          <div
            style={{
              padding: "16px 20px 0",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div
                style={{
                  position: "absolute",
                  width: 140,
                  height: 140,
                  background: `radial-gradient(circle,${A(0.22)} 0%,transparent 70%)`,
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%,-50%)",
                  pointerEvents: "none",
                }}
              />
              <canvas
                ref={ringRef}
                width={130}
                height={130}
                style={{ cursor: "grab", width: 130, height: 130, display: "block" }}
              />
            </div>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 7,
                minWidth: 0,
              }}
            >
              {[
                {
                  l: "consumed",
                  v: `${Math.round(
                    mode === "weekly" ? weeklyAvg : data.consumed
                  ).toLocaleString()}`,
                },
                { l: "goal %", v: `${pct}%` },
                { l: "streak", v: `${streak}d 🔥` },
              ].map((s) => (
                <div
                  key={s.l}
                  className="qst"
                  style={{
                    padding: "8px 12px",
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    cursor: "default",
                    transition: "all .2s",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      color: "rgba(255,255,255,0.28)",
                      letterSpacing: "1.5px",
                      textTransform: "uppercase",
                    }}
                  >
                    {s.l}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Syne',sans-serif",
                      fontSize: 15,
                      fontWeight: 800,
                      color: "#fff",
                      animation: "qNF .4s ease both",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    {s.v}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Badges */}
          {badges.length > 0 && (
            <div style={{ padding: "12px 0 4px" }}>
              <div
                style={{
                  fontSize: 9,
                  color: "rgba(255,255,255,0.28)",
                  letterSpacing: "2px",
                  marginBottom: 8,
                  paddingLeft: 20,
                }}
              >
                EARNED TODAY
              </div>
              <div
                className="qsc"
                style={{
                  display: "flex",
                  gap: 7,
                  overflowX: "auto",
                  paddingLeft: 20,
                  paddingRight: 20,
                  paddingTop: 6,
                  paddingBottom: 8,
                  scrollbarWidth: "none",
                }}
              >
                {badges.map((b, i) => (
                  <div
                    key={b.id}
                    className="qbd"
                    style={{
                      flexShrink: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 3,
                      padding: "10px 14px",
                      borderRadius: 16,
                      border: `1px solid ${b.glow.replace(".4", ",.28")}`,
                      background: b.glow.replace(".4", ",.1"),
                      color: b.color,
                      boxShadow: `0 4px 20px ${b.glow}`,
                      animation: `qBI .4s cubic-bezier(.16,1,.3,1) ${i * 70}ms both`,
                      cursor: "default",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 22,
                        filter: `drop-shadow(0 0 6px ${b.color})`,
                      }}
                    >
                      {b.emoji}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {b.label}
                    </span>
                    <span style={{ fontSize: 8.5, opacity: 0.6, whiteSpace: "nowrap" }}>
                      {b.sub}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Toggles */}
          <div style={{ padding: "12px 20px 16px" }}>
            <div
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.28)",
                letterSpacing: "2px",
                marginBottom: 7,
              }}
            >
              INCLUDE ON CARD
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[
                { label: "Badges", emoji: "🏅", key: "badges" as const },
                { label: "Meals", emoji: "🍽️", key: "meals" as const },
                { label: "Streak", emoji: "🔥", key: "streak" as const },
              ].map((tog) => (
                <div
                  key={tog.key}
                  onClick={() =>
                    setToggles((p) => ({ ...p, [tog.key]: !p[tog.key] }))
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "6px 13px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: "1px solid",
                    transition: "all .15s",
                    ...(toggles[tog.key]
                      ? {
                          background: A(0.1),
                          borderColor: A(0.35),
                          color: theme.accent,
                        }
                      : {
                          background: "transparent",
                          borderColor: "rgba(255,255,255,0.08)",
                          color: "rgba(255,255,255,0.35)",
                        }),
                  }}
                >
                  <span style={{ fontSize: 13 }}>{tog.emoji}</span>
                  {toggles[tog.key] && "✓ "}
                  {tog.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sticky actions */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            gap: 8,
            padding: "10px 20px",
            paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            background: "linear-gradient(160deg,#13131c,#0e0e16)",
            flexShrink: 0,
          }}
        >
          <button
            className="qbn"
            onClick={handleShare}
            disabled={sharing}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "14px 20px",
              borderRadius: 16,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              border: "none",
              color: "#000",
              fontFamily: "'Syne',sans-serif",
              transition: "all .2s",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {sharing ? (
              <>⏳ Preparing…</>
            ) : copied ? (
              <>
                <Check size={15} /> Copied!
              </>
            ) : canNativeShare ? (
              <>
                <Share2 size={15} /> Share to Stories
              </>
            ) : (
              <>
                <Copy size={15} /> Copy Image
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            style={{
              width: 52,
              height: 52,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 16,
              cursor: "pointer",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.45)",
              transition: "all .2s",
              flexShrink: 0,
            }}
          >
            <Download size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
