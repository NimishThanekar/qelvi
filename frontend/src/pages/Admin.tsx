import { useState, useEffect } from "react";
import { Bell, Send, Users, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { adminApi } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import toast from "react-hot-toast";

interface PushStats {
  total_users: number;
  push_subscribed: number;
}

interface SendResult {
  sent: number;
  errors: number;
}

const REMINDER_SECRET = import.meta.env.VITE_REMINDER_SECRET ?? "";

// Preset messages for quick sending
const PRESETS = [
  {
    label: "Log reminder",
    title: "Time to log your meals 🍽️",
    body: "You haven't logged anything today — keep the streak alive!",
    url: "/log",
  },
  {
    label: "Weekly summary",
    title: "Check your weekly summary 📊",
    body: "Your weekly insights are ready. See how you did this week!",
    url: "/insights",
  },
  {
    label: "New feature",
    title: "Qelvi update ✨",
    body: "We've added new features to help you track better. Check it out!",
    url: "/dashboard",
  },
];

export default function Admin() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<PushStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Broadcast form
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/dashboard");
  const [userId, setUserId] = useState("");
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<SendResult | null>(null);

  // Trigger reminders
  const [triggerLoading, setTriggerLoading] = useState(false);

  useEffect(() => {
    adminApi.pushStats()
      .then((r) => setStats(r.data))
      .catch(() => toast.error("Failed to load stats"))
      .finally(() => setStatsLoading(false));
  }, []);

  if (!user?.is_admin) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <p className="text-text-muted text-sm">Access denied.</p>
      </div>
    );
  }

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setTitle(preset.title);
    setBody(preset.body);
    setUrl(preset.url);
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    setSending(true);
    setLastResult(null);
    try {
      const res = await adminApi.broadcast({
        title: title.trim(),
        body: body.trim(),
        url: url.trim() || "/dashboard",
        user_id: userId.trim() || undefined,
      });
      setLastResult(res.data);
      toast.success(`Sent to ${res.data.sent} user${res.data.sent !== 1 ? "s" : ""}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Broadcast failed");
    } finally {
      setSending(false);
    }
  };

  const handleTriggerReminders = async () => {
    if (!REMINDER_SECRET) {
      toast.error("VITE_REMINDER_SECRET not set in .env");
      return;
    }
    setTriggerLoading(true);
    try {
      const res = await adminApi.triggerReminders(REMINDER_SECRET);
      toast.success(`Reminders sent: ${res.data.sent} pushes`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed");
    } finally {
      setTriggerLoading(false);
    }
  };

  const subscribedPct = stats
    ? Math.round((stats.push_subscribed / Math.max(stats.total_users, 1)) * 100)
    : 0;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto pb-20 md:pb-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Admin Panel</h1>
        <p className="text-xs text-text-muted mt-0.5">Push notifications &amp; system tools</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-text-muted" />
            <p className="text-xs text-text-muted uppercase tracking-wider">Total users</p>
          </div>
          <p className="text-2xl font-bold text-text-primary">
            {statsLoading ? "…" : stats?.total_users ?? "—"}
          </p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bell size={14} className="text-text-muted" />
            <p className="text-xs text-text-muted uppercase tracking-wider">Push enabled</p>
          </div>
          <p className="text-2xl font-bold text-text-primary">
            {statsLoading ? "…" : stats?.push_subscribed ?? "—"}
          </p>
          {!statsLoading && stats && (
            <p className="text-xs text-text-muted mt-0.5">{subscribedPct}% of users</p>
          )}
        </div>
      </div>

      {/* Broadcast panel */}
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Send size={15} className="text-text-muted" />
          <h2 className="text-sm font-semibold text-text-primary">Send Push Notification</h2>
        </div>

        {/* Quick presets */}
        <div className="mb-4">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Quick presets</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className="text-xs px-2.5 py-1 rounded-lg bg-bg-elevated hover:bg-bg-border text-text-secondary hover:text-text-primary border border-transparent hover:border-bg-border transition-all"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label">Title</label>
            <input
              className="input text-sm"
              placeholder="e.g. Time to log your meals 🍽️"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
            />
            <p className="text-[10px] text-text-muted mt-0.5 text-right">{title.length}/80</p>
          </div>

          <div>
            <label className="label">Body</label>
            <textarea
              className="input text-sm resize-none"
              rows={2}
              placeholder="Notification body text…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={160}
            />
            <p className="text-[10px] text-text-muted mt-0.5 text-right">{body.length}/160</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Deep link URL</label>
              <input
                className="input text-sm"
                placeholder="/dashboard"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="label">
                User ID{" "}
                <span className="normal-case font-normal text-text-muted">(blank = all users)</span>
              </label>
              <input
                className="input text-sm font-mono"
                placeholder="leave blank for broadcast"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Result banner */}
        {lastResult && (
          <div
            className="mt-3 rounded-xl px-3 py-2.5 flex items-center gap-2 text-xs"
            style={{
              backgroundColor: lastResult.errors > 0 ? "rgba(251,146,60,0.08)" : "rgba(52,211,153,0.08)",
              border: `1px solid ${lastResult.errors > 0 ? "rgba(251,146,60,0.2)" : "rgba(52,211,153,0.2)"}`,
              color: lastResult.errors > 0 ? "#fb923c" : "#34d399",
            }}
          >
            {lastResult.errors > 0
              ? <AlertCircle size={13} />
              : <CheckCircle size={13} />}
            <span>
              Delivered to <strong>{lastResult.sent}</strong> user{lastResult.sent !== 1 ? "s" : ""}
              {lastResult.errors > 0 && ` · ${lastResult.errors} failed (stale subscriptions removed)`}
            </span>
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={sending || !title.trim() || !body.trim()}
          className="btn-primary w-full mt-4 flex items-center justify-center gap-2"
        >
          {sending ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          {sending
            ? "Sending…"
            : userId.trim()
            ? "Send to user"
            : `Broadcast to ${stats?.push_subscribed ?? "all"} subscribers`}
        </button>
      </div>

      {/* Trigger scheduled reminders */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Bell size={15} className="text-text-muted" />
          <h2 className="text-sm font-semibold text-text-primary">Trigger Scheduled Reminders</h2>
        </div>
        <p className="text-xs text-text-muted mb-4">
          Runs the full reminder pipeline right now — login reminder (if &lt; 3 PM), streak alert (if &gt; 7 PM), weekly summary (if Sunday evening).
        </p>
        <button
          onClick={handleTriggerReminders}
          disabled={triggerLoading}
          className="btn-ghost w-full flex items-center justify-center gap-2 text-sm"
        >
          {triggerLoading ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          {triggerLoading ? "Running…" : "Run reminders now"}
        </button>
        {!REMINDER_SECRET && (
          <p className="text-[10px] text-text-muted mt-2 text-center">
            Add <code className="bg-bg-elevated px-1 rounded">VITE_REMINDER_SECRET</code> to frontend .env to enable this button.
          </p>
        )}
      </div>
    </div>
  );
}
