/**
 * InstallBanner — slim top bar that prompts mobile users to install the PWA.
 *
 * - Only shown once (dismissed state stored in localStorage)
 * - Only shown when the browser fires the `beforeinstallprompt` event
 * - Not shown on iOS (which uses its own Add to Home Screen mechanism)
 */

import { useState, useEffect } from "react";
import { X, Download } from "lucide-react";

const DISMISSED_KEY = "pwa-install-dismissed";

export default function InstallBanner() {
  const [prompt, setPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      dismiss();
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  };

  if (!visible) return null;

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
        onClick={handleInstall}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 transition-all"
        style={{ backgroundColor: "#a3e635", color: "#000" }}
      >
        <Download size={11} />
        Install
      </button>
      <button
        onClick={dismiss}
        className="p-1 text-text-muted hover:text-text-secondary transition-colors flex-shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}
