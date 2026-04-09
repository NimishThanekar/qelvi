import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let _deferredPrompt: BeforeInstallPromptEvent | null = null;
const _listeners = new Set<() => void>();

// Capture the event at module level so it survives component unmounts
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  _deferredPrompt = e as BeforeInstallPromptEvent;
  _listeners.forEach((fn) => fn());
});

window.addEventListener("appinstalled", () => {
  _deferredPrompt = null;
  _listeners.forEach((fn) => fn());
});

export function usePWAInstall() {
  const [canInstall, setCanInstall] = useState(!!_deferredPrompt);

  useEffect(() => {
    const update = () => setCanInstall(!!_deferredPrompt);
    _listeners.add(update);
    return () => { _listeners.delete(update); };
  }, []);

  const triggerInstall = async () => {
    if (!_deferredPrompt) return;
    await _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    if (outcome === "accepted") {
      _deferredPrompt = null;
      _listeners.forEach((fn) => fn());
    }
  };

  return { canInstall, triggerInstall };
}
