/**
 * InstallBanner — slim top bar that prompts mobile users to install the PWA.
 * Dismisses for the current session only (not stored in localStorage).
 * Uses usePWAInstall hook so the prompt event is shared with the sidebar button.
 */

import { useState } from "react";
import { X, Download } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";

export default function InstallBanner() {
  const { canInstall, triggerInstall } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);

  if (!canInstall || dismissed) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-2.5"
      style={{
        backgroundColor: "#111111",
        borderBottom: "1px solid #242424",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: "#a3e635" }}
      >
        <span className="text-black font-black text-xs">Q</span>
      </div>
      <p className="flex-1 text-xs text-text-primary">
        Add <span className="font-semibold">Qelvi</span> to your home screen for quick access
      </p>
      <button
        onClick={triggerInstall}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 transition-all"
        style={{ backgroundColor: "#a3e635", color: "#000" }}
      >
        <Download size={11} />
        Install
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 text-text-muted hover:text-text-secondary transition-colors flex-shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}
