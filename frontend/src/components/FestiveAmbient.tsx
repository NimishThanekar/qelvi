/**
 * FestiveAmbient — subtle animated background effects for active festivals.
 * Pure CSS animations, no libraries. Max 15-20 elements. Pointer-events: none.
 * Respects prefers-reduced-motion.
 */

interface Props {
  effect: "diyas" | "colors" | "lanterns" | "rangoli" | "snow" | "stars" | "none";
  colorAccent: string;
}

// Deterministic pseudo-spread: produces visually distributed values without Math.random()
const spread = (i: number, count: number, min: number, max: number) =>
  min + ((((i * 137.508) % count) / count) * (max - min));

const CSS_KEYFRAMES = `
  @keyframes _fa_diya_pulse {
    0%, 100% { opacity: 0.3; }
    50%       { opacity: 0.8; }
  }
  @keyframes _fa_color_drift {
    0%   { transform: translateY(0)    translateX(0px);   opacity: 0.22; }
    80%  { opacity: 0.18; }
    100% { transform: translateY(130px) translateX(18px); opacity: 0; }
  }
  @keyframes _fa_lantern_sway {
    0%, 100% { transform: translateX(0px) translateY(0px); }
    50%      { transform: translateX(4px) translateY(2px); }
  }
  @keyframes _fa_rangoli_spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes _fa_snow_fall {
    0%   { transform: translateY(-12px) translateX(0px); opacity: 0; }
    5%   { opacity: 0.35; }
    90%  { opacity: 0.25; }
    100% { transform: translateY(101vh) translateX(14px); opacity: 0; }
  }
  @keyframes _fa_star_twinkle {
    0%, 100% { opacity: 0.08; }
    50%      { opacity: 0.5; }
  }
`;

// ── Effect renderers ──────────────────────────────────────────────────────────

function Diyas({ color }: { color: string }) {
  const dots = Array.from({ length: 9 }, (_, i) => {
    const isBottom = i >= 5;
    const xPct = spread(i, 9, 3, 97);
    const yPct = isBottom ? spread(i, 4, 93, 98) : spread(i, 5, 1, 6);
    const delay = `${(i * 0.41).toFixed(2)}s`;
    const dur = `${(2.2 + (i % 3) * 0.5).toFixed(1)}s`;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: `${xPct}%`,
          top: `${yPct}%`,
          width: 5,
          height: 5,
          borderRadius: "50%",
          backgroundColor: color,
          boxShadow: `0 0 6px 2px ${color}`,
          animation: `_fa_diya_pulse ${dur} ${delay} ease-in-out infinite`,
        }}
      />
    );
  });

  return (
    <>
      {/* Very subtle warm top tint */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 60,
          background: `linear-gradient(to bottom, ${color}08, transparent)`,
          pointerEvents: "none",
        }}
      />
      {dots}
    </>
  );
}

function Colors() {
  const BLOB_COLORS = ["#EF4444", "#3B82F6", "#22C55E", "#FBBF24", "#A78BFA", "#F97316", "#38BDF8"];
  const blobs = Array.from({ length: 7 }, (_, i) => {
    const size = 8 + (i % 5);
    const xPct = spread(i, 7, 5, 90);
    const yPct = spread(i, 7, 3, 30);
    const dur = `${9 + i * 1.1}s`;
    const delay = `${(i * 1.3).toFixed(1)}s`;
    const blobColor = BLOB_COLORS[i % BLOB_COLORS.length];
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: `${xPct}%`,
          top: `${yPct}%`,
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: blobColor,
          opacity: 0.2,
          filter: "blur(2px)",
          animation: `_fa_color_drift ${dur} ${delay} ease-in-out infinite`,
        }}
      />
    );
  });
  return <>{blobs}</>;
}

function Lanterns({ color }: { color: string }) {
  const lanterns = Array.from({ length: 6 }, (_, i) => {
    const xPct = spread(i, 6, 6, 94);
    const yPct = spread(i, 6, 0.5, 3);
    const dur = `${3.5 + i * 0.4}s`;
    const delay = `${(i * 0.55).toFixed(2)}s`;
    const stringH = 10 + (i % 3) * 4;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: `${xPct}%`,
          top: `${yPct}%`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          animation: `_fa_lantern_sway ${dur} ${delay} ease-in-out infinite`,
        }}
      >
        {/* String */}
        <div
          style={{
            width: 1,
            height: stringH,
            backgroundColor: color,
            opacity: 0.25,
          }}
        />
        {/* Lantern body */}
        <div
          style={{
            width: 7,
            height: 11,
            borderRadius: "30% 30% 40% 40%",
            backgroundColor: color,
            opacity: 0.3,
            boxShadow: `0 0 5px 1px ${color}40`,
          }}
        />
      </div>
    );
  });
  return <>{lanterns}</>;
}

function Rangoli({ color }: { color: string }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        right: 24,
        opacity: 0.05,
        animation: "_fa_rangoli_spin 60s linear infinite",
        transformOrigin: "center center",
      }}
    >
      <svg viewBox="0 0 120 120" width={120} height={120} fill="none">
        <circle cx="60" cy="60" r="56" stroke={color} strokeWidth="0.6" />
        <circle cx="60" cy="60" r="42" stroke={color} strokeWidth="0.6" />
        <circle cx="60" cy="60" r="28" stroke={color} strokeWidth="0.6" />
        <circle cx="60" cy="60" r="14" stroke={color} strokeWidth="0.6" />
        {Array.from({ length: 8 }, (_, i) => (
          <line
            key={i}
            x1="60" y1="4" x2="60" y2="116"
            stroke={color} strokeWidth="0.5"
            transform={`rotate(${i * 22.5} 60 60)`}
          />
        ))}
        {Array.from({ length: 8 }, (_, i) => {
          const angle = (i * 45 * Math.PI) / 180;
          const cx = 60 + Math.cos(angle) * 35;
          const cy = 60 + Math.sin(angle) * 35;
          return <circle key={i} cx={cx} cy={cy} r="4" stroke={color} strokeWidth="0.5" />;
        })}
        {Array.from({ length: 16 }, (_, i) => {
          const angle = (i * 22.5 * Math.PI) / 180;
          const cx = 60 + Math.cos(angle) * 50;
          const cy = 60 + Math.sin(angle) * 50;
          return <circle key={i} cx={cx} cy={cy} r="2.5" stroke={color} strokeWidth="0.4" />;
        })}
      </svg>
    </div>
  );
}

function Snow() {
  const flakes = Array.from({ length: 12 }, (_, i) => {
    const size = 2 + (i % 3);
    const xPct = spread(i, 12, 2, 98);
    const dur = `${11 + i * 0.8}s`;
    const delay = `${(i * 0.1).toFixed(1)}s`;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: `${xPct}%`,
          top: -size,
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: "#ffffff",
          opacity: 0.3,
          animation: `_fa_snow_fall ${dur} ${delay} linear infinite`,
        }}
      />
    );
  });
  return <>{flakes}</>;
}

function Stars({ color }: { color: string }) {
  const stars = Array.from({ length: 9 }, (_, i) => {
    const xPct = spread(i, 9, 3, 97);
    const yPct = spread(i, 9, 2, 38);
    const size = 4 + (i % 3);
    const dur = `${2.2 + (i * 0.7) % 2.8}s`;
    const delay = `${(i * 0.44).toFixed(2)}s`;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: `${xPct}%`,
          top: `${yPct}%`,
          fontSize: size,
          lineHeight: 1,
          color,
          userSelect: "none",
          animation: `_fa_star_twinkle ${dur} ${delay} ease-in-out infinite`,
        }}
      >
        ✦
      </div>
    );
  });
  return <>{stars}</>;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FestiveAmbient({ effect, colorAccent }: Props) {
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReduced || effect === "none") return null;

  let content: React.ReactNode = null;
  switch (effect) {
    case "diyas":    content = <Diyas color={colorAccent} />; break;
    case "colors":   content = <Colors />; break;
    case "lanterns": content = <Lanterns color={colorAccent} />; break;
    case "rangoli":  content = <Rangoli color={colorAccent} />; break;
    case "snow":     content = <Snow />; break;
    case "stars":    content = <Stars color={colorAccent} />; break;
  }

  if (!content) return null;

  return (
    <>
      {/* Inject keyframes once — React deduplicates identical style elements */}
      <style dangerouslySetInnerHTML={{ __html: CSS_KEYFRAMES }} />
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 15,
          overflow: "hidden",
        }}
      >
        {content}
      </div>
    </>
  );
}
