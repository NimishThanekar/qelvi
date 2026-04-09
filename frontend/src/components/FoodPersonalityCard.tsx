import { useRef, useState } from "react";
import { X, Download, Share2 } from "lucide-react";
import type { FoodPersonality } from "../types";
import { MEAL_CONTEXTS } from "../types";

interface Props {
  data: FoodPersonality;
  onClose: () => void;
}

export default function FoodPersonalityCard({ data, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);

  const ctxLabel = MEAL_CONTEXTS.find((c) => c.value === data.stats.top_context)?.label
    ?? data.stats.top_context ?? "Home";

  const stats = [
    { label: "Days tracked", value: `${data.stats.tracked_days}d` },
    { label: "Avg daily", value: `${data.stats.avg_daily_calories} kcal` },
    { label: "Fav spot", value: ctxLabel },
    { label: "On target", value: `${data.stats.consistency_pct}%` },
  ];

  const handleCapture = async () => {
    if (!cardRef.current) return;
    setCapturing(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/png")
      );
      if (!blob) return;

      const file = new File([blob], "my-food-personality.png", { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `I'm a ${data.title} on Qelvi!`,
          text: "Discover your food personality 🍽️",
          files: [file],
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "my-food-personality.png";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Capture failed", err);
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-xs">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-text-muted hover:text-text-primary transition-colors"
        >
          <X size={22} />
        </button>

        {/* The shareable card — inline styles for html2canvas compat */}
        <div
          ref={cardRef}
          style={{
            background: "linear-gradient(160deg, #111111 0%, #0d0d1a 100%)",
            border: "1px solid #242424",
            borderRadius: 24,
            padding: 32,
            aspectRatio: "9 / 16",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
            overflow: "hidden",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {/* Background glow */}
          <div
            style={{
              position: "absolute",
              top: -60,
              left: "50%",
              transform: "translateX(-50%)",
              width: 200,
              height: 200,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(167,139,250,0.15) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          {/* Top label */}
          <div style={{ textAlign: "center", zIndex: 1 }}>
            <p style={{ fontSize: 11, color: "#666", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
              My Food Personality
            </p>
          </div>

          {/* Emoji + title block */}
          <div style={{ textAlign: "center", zIndex: 1 }}>
            <div
              style={{
                fontSize: 72,
                lineHeight: 1,
                marginBottom: 20,
                filter: "drop-shadow(0 0 24px rgba(167,139,250,0.4))",
              }}
            >
              {data.emoji}
            </div>
            <h2
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "#f5f5f5",
                margin: 0,
                marginBottom: 12,
              }}
            >
              {data.title}
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "#888",
                lineHeight: 1.55,
                maxWidth: 240,
                margin: "0 auto",
              }}
            >
              {data.description}
            </p>
          </div>

          {/* 2×2 stats grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              width: "100%",
              zIndex: 1,
            }}
          >
            {stats.map((s) => (
              <div
                key={s.label}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid #242424",
                  borderRadius: 12,
                  padding: "12px 14px",
                  textAlign: "center",
                }}
              >
                <p style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", margin: 0, marginBottom: 2 }}>
                  {s.value}
                </p>
                <p style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          {/* Watermark */}
          <div style={{ zIndex: 1, textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "#444", letterSpacing: "0.06em" }}>qelvi.com</p>
          </div>
        </div>

        {/* Share / Download button */}
        <button
          onClick={handleCapture}
          disabled={capturing}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "14px 0",
            borderRadius: 14,
            background: "linear-gradient(135deg, #a78bfa, #8b5cf6)",
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
            border: "none",
            cursor: capturing ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: capturing ? 0.7 : 1,
          }}
        >
          {capturing ? (
            "Generating…"
          ) : typeof navigator.share === "function" ? (
            <>
              <Share2 size={16} /> Share your personality
            </>
          ) : (
            <>
              <Download size={16} /> Download card
            </>
          )}
        </button>
      </div>
    </div>
  );
}
