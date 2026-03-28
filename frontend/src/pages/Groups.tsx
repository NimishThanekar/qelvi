import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Users, Copy, Check, Settings, X, RefreshCw, Clock } from "lucide-react";
import { groupsApi } from "../lib/api";
import type { Group, GroupMember, WeeklyRecap, MoodKey } from "../types";
import { MOOD_LIST } from "../types";
import toast from "react-hot-toast";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TZ_ABBR: Record<string, string> = {
  "Asia/Kolkata": "IST", "America/New_York": "EST", "America/Los_Angeles": "PST",
  "Europe/London": "GMT", "Asia/Dubai": "GST", "Asia/Singapore": "SGT",
  "Australia/Sydney": "AEDT",
};
const COMMON_TZ = Object.keys(TZ_ABBR);

function fmtResetTime(time: string, tz: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  const abbr = TZ_ABBR[tz] ?? tz.split("/").pop() ?? tz;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${ampm} ${abbr}`;
}

function fmtExpiry(expiresAt: string | null | undefined): string {
  if (!expiresAt || expiresAt === "expired") return expiresAt === "expired" ? "Expired" : "";
  try {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const hrs = Math.ceil(diff / 3_600_000);
    return hrs <= 24 ? `${hrs}h left` : `${Math.ceil(hrs / 24)}d left`;
  } catch { return ""; }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Segmented bar — Feature 4: Silent Pulse */
function ProgressBar({ checked, total }: { checked: number; total: number }) {
  if (total === 0) return null;
  const pct = checked / total;
  const color =
    pct === 0   ? "rgba(255,255,255,0.08)"
    : pct < 0.5 ? "#38bdf8"
    : pct < 1   ? "#4ade80"
    :              "#fbbf24";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 3, borderRadius: 99,
          backgroundColor: i < checked ? color : "rgba(255,255,255,0.07)",
          transition: "background-color 0.4s ease",
        }} />
      ))}
      {pct === 1 && (
        <span style={{ fontSize: 9, color: "#fbbf24", marginLeft: 2, lineHeight: 1 }}>✦</span>
      )}
    </div>
  );
}

/** Avatar with mood ring + tooltip — Feature 1 */
function MemberAvatar({ member }: { member: GroupMember }) {
  const [tip, setTip] = useState(false);
  const mood = member.mood ? MOOD_LIST.find((m) => m.key === member.mood) : null;
  const ringColor = member.checked_in_today
    ? (mood?.color ?? "#4ade80")
    : member.missed_days >= 1
    ? "rgba(251,191,36,0.5)"
    : "rgba(255,255,255,0.1)";

  return (
    <div
      style={{ position: "relative", flexShrink: 0 }}
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
    >
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        border: `2px solid ${ringColor}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 600,
        color: "var(--text-secondary)",
        background: "var(--bg-elevated)",
        transition: "border-color 0.3s",
        boxShadow: member.checked_in_today
          ? `0 0 8px ${ringColor}55`
          : member.missed_days >= 1
          ? "0 0 6px rgba(251,191,36,0.15)"
          : "none",
      }}>
        {member.name[0]?.toUpperCase()}
      </div>
      {/* Anchor pairing indicator */}
      {member.anchor_user_id && (
        <div style={{
          position: "absolute", bottom: -2, right: -2,
          width: 8, height: 8, borderRadius: "50%",
          background: "rgba(var(--accent-rgb)/0.6)",
          border: "1px solid var(--bg-card)",
        }} />
      )}
      {/* Tooltip — mood label */}
      {tip && mood && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
          transform: "translateX(-50%)", background: "var(--bg-card)",
          border: "1px solid var(--bg-border)", borderRadius: 6,
          padding: "3px 8px", fontSize: 10, color: mood.color,
          whiteSpace: "nowrap", zIndex: 30, pointerEvents: "none",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}>
          {mood.emoji} {mood.label}
        </div>
      )}
    </div>
  );
}

/** 6-option mood chip row — Feature 1 */
function MoodSelector({ onSelect }: { onSelect: (k: MoodKey) => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      padding: "10px 14px",
      background: "rgba(255,255,255,0.02)",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
    }}>
      <span style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: "1.5px", flexShrink: 0 }}>
        HOW'S YOUR DAY?
      </span>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {MOOD_LIST.map((m) => (
          <button
            key={m.key}
            onClick={() => onSelect(m.key)}
            title={m.label}
            style={{
              display: "flex", alignItems: "center", gap: 3,
              padding: "3px 9px", borderRadius: 99,
              border: `1px solid ${m.color}33`,
              background: `${m.color}0d`,
              color: m.color, fontSize: 11, cursor: "pointer",
              transition: "transform 0.1s",
            }}
            className="hover:scale-105 active:scale-95"
          >
            <span>{m.emoji}</span>
            <span style={{ fontSize: 9 }}>{m.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Frosted weekly recap card — Feature 7 */
function WeeklyRecapCard({ recaps, onDismiss }: { recaps: WeeklyRecap[]; onDismiss: () => void }) {
  const total = recaps.reduce((s, r) => s + r.checkin_days, 0);
  const possible = recaps.reduce((s, r) => s + r.total_possible, 0);
  const pct = possible > 0 ? Math.round((total / possible) * 100) : 0;
  const bestStreak = recaps.length > 0 ? Math.max(...recaps.map((r) => r.best_streak)) : 0;
  const avgVs = recaps.length > 0
    ? Math.round(recaps.reduce((s, r) => s + r.vs_last_week, 0) / recaps.length)
    : 0;

  return (
    <div className="animate-slide-up" style={{
      background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18,
      padding: "14px 16px", marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
          Week Recap
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400, marginLeft: 6 }}>
            {recaps.map((r) => r.group_name).join(", ")}
          </span>
        </span>
        <button
          onClick={onDismiss}
          style={{
            fontSize: 10, color: "var(--text-muted)", padding: "2px 8px",
            borderRadius: 99, border: "1px solid var(--bg-border)", background: "transparent", cursor: "pointer",
          }}
        >
          Dismiss
        </button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {[
          { v: `${pct}%`,       l: "check-ins this week" },
          { v: `${bestStreak}d 🔥`, l: "best group streak" },
          { v: avgVs > 0 ? `↑ ${avgVs}%` : avgVs < 0 ? `↓ ${Math.abs(avgVs)}%` : "—", l: "vs last week" },
        ].map((chip) => (
          <div key={chip.l} style={{
            flex: 1, background: "var(--bg-elevated)", borderRadius: 10,
            padding: "8px 10px", textAlign: "center",
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{chip.v}</div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{chip.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Settings drawer — Features 3, 5, 8 */
function SettingsDrawer({
  group, onClose, onSaved,
}: { group: Group; onClose: () => void; onSaved: () => void }) {
  const myMember = group.members.find((m) => m.is_me);
  const [resetTime, setResetTime] = useState(group.reset_time ?? "23:00");
  const [resetTz, setResetTz] = useState(group.reset_timezone ?? "Asia/Kolkata");
  const [anchorId, setAnchorId] = useState(myMember?.anchor_user_id ?? "");
  const [codeExpiry, setCodeExpiry] = useState<"24h" | "7d" | "never">("never");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const others = group.members.filter((m) => !m.is_me);

  const save = async () => {
    setSaving(true);
    try {
      if (group.is_creator) {
        await groupsApi.updateSettings(group.id, { reset_time: resetTime, reset_timezone: resetTz });
      }
      await groupsApi.setAnchor(group.id, anchorId || null);
      toast.success("Settings saved");
      onSaved();
      onClose();
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const regen = async () => {
    setRegenerating(true);
    try {
      await groupsApi.regenerateCode(group.id, codeExpiry === "never" ? undefined : codeExpiry);
      toast.success("Code regenerated");
      onSaved();
    } catch { toast.error("Failed to regenerate"); }
    finally { setRegenerating(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-sm animate-slide-up rounded-t-2xl md:rounded-2xl"
        style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)", padding: 20 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>Circle Settings</span>
          <button onClick={onClose} className="text-text-muted"><X size={16} /></button>
        </div>

        {/* Reset time — creator only */}
        {group.is_creator && (
          <div style={{ marginBottom: 16 }}>
            <label className="label" style={{ display: "block", marginBottom: 6 }}>Daily Reset</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="time" value={resetTime} onChange={(e) => setResetTime(e.target.value)} className="input text-sm flex-1" />
              <select value={resetTz} onChange={(e) => setResetTz(e.target.value)} className="input text-sm flex-1">
                {COMMON_TZ.map((tz) => (
                  <option key={tz} value={tz}>{TZ_ABBR[tz]} – {tz.split("/")[1]?.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Anchor pair */}
        {others.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label className="label" style={{ display: "block", marginBottom: 6 }}>Your Anchor</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[{ user_id: "", name: "None" }, ...others].map((m) => (
                <button
                  key={m.user_id}
                  onClick={() => setAnchorId(m.user_id)}
                  style={{
                    padding: "4px 12px", borderRadius: 99, fontSize: 11, cursor: "pointer",
                    border: `1px solid ${anchorId === m.user_id ? "var(--accent-primary)" : "var(--bg-border)"}`,
                    background: anchorId === m.user_id ? "rgba(var(--accent-rgb)/0.1)" : "transparent",
                    color: anchorId === m.user_id ? "var(--accent-primary)" : "var(--text-muted)",
                  }}
                >
                  {m.name}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 5 }}>
              If your anchor misses 2+ days, you'll see a quiet nudge.
            </p>
          </div>
        )}

        {/* Code regeneration — creator only */}
        {group.is_creator && (
          <div style={{ marginBottom: 20 }}>
            <label className="label" style={{ display: "block", marginBottom: 6 }}>Invite Code</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {(["never", "24h", "7d"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setCodeExpiry(opt)}
                  style={{
                    flex: 1, padding: "4px 0", borderRadius: 8, fontSize: 10, cursor: "pointer",
                    border: `1px solid ${codeExpiry === opt ? "var(--accent-primary)" : "var(--bg-border)"}`,
                    background: codeExpiry === opt ? "rgba(var(--accent-rgb)/0.1)" : "transparent",
                    color: codeExpiry === opt ? "var(--accent-primary)" : "var(--text-muted)",
                  }}
                >
                  {opt === "never" ? "No expiry" : opt}
                </button>
              ))}
            </div>
            <button
              onClick={regen}
              disabled={regenerating}
              className="btn-ghost w-full text-xs flex items-center justify-center gap-2 py-2"
            >
              <RefreshCw size={12} className={regenerating ? "animate-spin" : ""} />
              Regenerate Code
            </button>
          </div>
        )}

        <button onClick={save} disabled={saving} className="btn-primary w-full text-sm">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Groups() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [settingsGroup, setSettingsGroup] = useState<Group | null>(null);
  // Feature 2: rescue expansion keyed by `groupId-userId`
  const [expandedRescue, setExpandedRescue] = useState<Record<string, boolean>>({});
  // Feature 7: weekly recap
  const [recaps, setRecaps] = useState<WeeklyRecap[]>([]);
  const [recapDismissed, setRecapDismissed] = useState(false);
  // Feature 6: privacy note
  const [privacySeen, setPrivacySeen] = useState(() => !!localStorage.getItem("qelvi_privacy_seen"));

  const isSunday = new Date().getDay() === 0;
  const weekKey = `qelvi_recap_${new Date().toISOString().slice(0, 10)}`;

  const fetchGroups = useCallback(async () => {
    try {
      const res = await groupsApi.my();
      setGroups(res.data);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // Feature 7: fetch recap on Sundays
  useEffect(() => {
    if (!isSunday || recapDismissed || localStorage.getItem(weekKey)) return;
    if (groups.length === 0) return;
    (async () => {
      const results: WeeklyRecap[] = [];
      for (const g of groups) {
        try { results.push((await groupsApi.weeklyRecap(g.id)).data); } catch {}
      }
      setRecaps(results);
    })();
  }, [groups, isSunday]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissRecap = () => {
    localStorage.setItem(weekKey, "1");
    setRecapDismissed(true);
    setRecaps([]);
  };

  const handleCreate = async () => {
    if (!groupName.trim()) return;
    setSaving(true);
    try {
      await groupsApi.create(groupName.trim());
      toast.success("Circle created!");
      setShowCreate(false);
      setGroupName("");
      fetchGroups();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to create circle");
    } finally { setSaving(false); }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setSaving(true);
    try {
      await groupsApi.join(joinCode.trim().toUpperCase());
      toast.success("Joined!");
      setShowJoin(false);
      setJoinCode("");
      fetchGroups();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Invalid code");
    } finally { setSaving(false); }
  };

  const handleCheckin = async (groupId: string, mood?: MoodKey) => {
    try {
      await groupsApi.checkin(groupId, mood);
      toast.success("Checked in! ✓");
      fetchGroups();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to check in");
    }
  };

  const handleMood = async (groupId: string, mood: MoodKey) => {
    try {
      await groupsApi.setMood(groupId, mood);
      fetchGroups();
    } catch { toast.error("Failed to set mood"); }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const dismissPrivacy = () => {
    localStorage.setItem("qelvi_privacy_seen", "1");
    setPrivacySeen(true);
  };

  const toggleRescue = (key: string) =>
    setExpandedRescue((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">

      {/* Settings drawer */}
      {settingsGroup && (
        <SettingsDrawer
          group={settingsGroup}
          onClose={() => setSettingsGroup(null)}
          onSaved={() => { fetchGroups(); setSettingsGroup(null); }}
        />
      )}

      {/* Feature 7: Weekly recap card (Sundays only) */}
      {isSunday && !recapDismissed && recaps.length > 0 && (
        <WeeklyRecapCard recaps={recaps} onDismiss={dismissRecap} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 animate-slide-up">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Accountability Circles</h1>
          <p className="text-xs text-text-muted mt-0.5">Small private groups — up to 5 people</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowJoin(true); setShowCreate(false); }}
            className="btn-ghost text-xs px-3 py-1.5 active:scale-95 transition-transform"
          >
            Join
          </button>
          <button
            onClick={() => { setShowCreate(true); setShowJoin(false); }}
            className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <Plus size={13} />
            New circle
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card p-4 mb-4 animate-slide-up">
          <p className="text-sm font-medium text-text-primary mb-3">Create a circle</p>
          <input className="input text-sm mb-3" placeholder="Circle name" value={groupName}
            onChange={(e) => setGroupName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()} autoFocus />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !groupName.trim()}
              className="btn-primary text-xs px-4 py-2 active:scale-95 transition-transform">
              {saving ? "Creating…" : "Create"}
            </button>
            <button onClick={() => setShowCreate(false)}
              className="btn-ghost text-xs px-4 py-2 active:scale-95 transition-transform">Cancel</button>
          </div>
        </div>
      )}

      {/* Join form */}
      {showJoin && (
        <div className="card p-4 mb-4 animate-slide-up">
          <p className="text-sm font-medium text-text-primary mb-3">Join a circle</p>
          <input className="input text-sm mb-3 uppercase tracking-widest font-mono"
            placeholder="Enter 6-character code" value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()} maxLength={6} autoFocus />
          <div className="flex gap-2">
            <button onClick={handleJoin} disabled={saving || joinCode.length !== 6}
              className="btn-primary text-xs px-4 py-2 active:scale-95 transition-transform">
              {saving ? "Joining…" : "Join"}
            </button>
            <button onClick={() => setShowJoin(false)}
              className="btn-ghost text-xs px-4 py-2 active:scale-95 transition-transform">Cancel</button>
          </div>
        </div>
      )}

      {/* Groups list */}
      {loading ? (
        <div className="space-y-4 animate-fade-in">
          {[1, 2].map((i) => (
            <div key={i} className="card p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-bg-elevated skeleton" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 rounded-lg bg-bg-elevated skeleton" />
                  <div className="h-2 w-20 rounded-lg bg-bg-elevated skeleton" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="card p-10 flex flex-col items-center gap-3 text-center animate-scale-in">
          <div className="w-16 h-16 rounded-2xl bg-bg-elevated flex items-center justify-center text-3xl animate-float"
            style={{ animationDelay: "0.1s" }}>👥</div>
          <p className="text-sm font-medium text-text-primary mt-1">No circles yet</p>
          <p className="text-xs text-text-muted max-w-xs leading-relaxed">
            Create a private circle with up to 4 friends. No scores, no pressure — just a daily check-in.
          </p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setShowCreate(true)} className="btn-primary text-xs px-4 py-2 active:scale-95 transition-transform">Create circle</button>
            <button onClick={() => setShowJoin(true)} className="btn-ghost text-xs px-4 py-2 active:scale-95 transition-transform">Join with code</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 stagger">
          {groups.map((group) => {
            const me = group.members.find((m) => m.is_me);
            const meCheckedIn = me?.checked_in_today ?? false;
            const myMood = me?.mood;
            const checkedCount = group.members.filter((m) => m.checked_in_today).length;
            const expiryLabel = fmtExpiry(group.code_expires_at);
            const resetLabel = fmtResetTime(group.reset_time ?? "23:00", group.reset_timezone ?? "Asia/Kolkata");

            return (
              <div key={group.id} className="card overflow-hidden">
                {/* ── Card header ─────────────────────────────────────────── */}
                <div className="flex items-center gap-2 p-4 border-b border-bg-elevated">
                  {/* Icon + name + progress bar */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(var(--accent-rgb)/0.1)" }}>
                      <Users size={15} className="text-accent-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary truncate">{group.name}</p>
                      {/* Feature 4 */}
                      <ProgressBar checked={checkedCount} total={group.members.length} />
                    </div>
                  </div>

                  {/* Feature 3: reset time chip */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 3,
                    padding: "2px 7px", borderRadius: 99,
                    background: "var(--bg-elevated)", border: "1px solid var(--bg-border)",
                    fontSize: 9, color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0,
                  }}>
                    <Clock size={9} />{resetLabel}
                  </div>

                  {/* Feature 8: invite code chip */}
                  <button
                    onClick={() => copyCode(group.code)}
                    title={expiryLabel || "Copy invite code"}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-bg-elevated hover:bg-bg-border transition-all active:scale-95 flex-shrink-0"
                  >
                    {copiedCode === group.code
                      ? <Check size={11} className="text-green-400" />
                      : <Copy size={11} className="text-text-muted" />}
                    <span className="font-mono tracking-widest text-[10px] text-text-muted">{group.code}</span>
                    {expiryLabel && (
                      <span style={{ fontSize: 8, color: "#fbbf24" }}>{expiryLabel}</span>
                    )}
                  </button>

                  {/* Settings gear */}
                  <button
                    onClick={() => setSettingsGroup(group)}
                    className="w-7 h-7 rounded-lg bg-bg-elevated hover:bg-bg-border flex items-center justify-center text-text-muted hover:text-text-primary transition-all flex-shrink-0"
                    title="Circle settings"
                  >
                    <Settings size={12} />
                  </button>

                  {/* Check-in / Logged badge */}
                  {!meCheckedIn ? (
                    <button onClick={() => handleCheckin(group.id)}
                      className="btn-primary text-xs px-3 py-1.5 active:scale-90 transition-transform flex-shrink-0">
                      Check in
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-green-400 px-2.5 py-1.5 rounded-lg flex-shrink-0 animate-pop-in"
                      style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.18)" }}>
                      <Check size={11} /> Logged
                    </span>
                  )}
                </div>

                {/* Feature 1: Mood selector — appears post check-in until mood is set */}
                {meCheckedIn && !myMood && (
                  <MoodSelector onSelect={(mood) => handleMood(group.id, mood)} />
                )}

                {/* ── Member list ──────────────────────────────────────────── */}
                <div className="p-3 flex flex-col">
                  {group.members.map((member, idx) => {
                    const rescueKey = `${group.id}-${member.user_id}`;
                    const isRescueOpen = !!expandedRescue[rescueKey];
                    // Feature 2: rescue mode — only for the current user when they've missed days
                    const showRescue = member.is_me && !member.checked_in_today && member.missed_days >= 1;
                    const isMissed = !member.checked_in_today && member.missed_days >= 1;

                    // Feature 5: anchor connector between consecutive paired members
                    const next = group.members[idx + 1];
                    const showConnector = !!(
                      next &&
                      member.anchor_user_id === next.user_id &&
                      next.anchor_user_id === member.user_id
                    );

                    return (
                      <div key={member.user_id}>
                        {/* Member row */}
                        <div
                          className="flex items-center gap-3 rounded-xl transition-all"
                          style={isMissed ? {
                            background: "rgba(251,191,36,0.04)",
                            border: "1px solid rgba(251,191,36,0.12)",
                            padding: "6px 8px", marginBottom: 2,
                          } : { padding: "6px 8px" }}
                        >
                          {/* Feature 1: avatar with mood ring */}
                          <MemberAvatar member={member} />

                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-text-primary">
                              {member.name}
                              {member.is_me && <span className="text-text-muted text-xs"> (you)</span>}
                            </span>
                            {/* Feature 5: anchor nudge */}
                            {member.anchor_missing && (
                              <span style={{ fontSize: 9, color: "#fbbf24", marginLeft: 6 }}>anchor missing</span>
                            )}
                          </div>

                          {/* Status / rescue pill */}
                          {member.checked_in_today ? (
                            <span className="text-xs flex-shrink-0" style={{ color: "rgba(74,222,128,0.85)" }}>
                              Logged ✓
                            </span>
                          ) : showRescue ? (
                            // Feature 2: ↩ Return pill
                            <button
                              onClick={() => toggleRescue(rescueKey)}
                              style={{
                                fontSize: 10, color: "#fbbf24",
                                padding: "2px 8px", borderRadius: 99,
                                border: "1px solid rgba(251,191,36,0.28)",
                                background: "rgba(251,191,36,0.06)", cursor: "pointer",
                              }}
                            >
                              ↩ Return
                            </button>
                          ) : (
                            <span className="text-xs flex-shrink-0 text-text-muted">
                              {isMissed ? `${member.missed_days}d missed` : "Not yet"}
                            </span>
                          )}
                        </div>

                        {/* Feature 2: rescue expansion — 3 soft ghost options */}
                        {showRescue && isRescueOpen && (
                          <div className="animate-slide-up" style={{
                            display: "flex", gap: 6, padding: "4px 8px 8px",
                          }}>
                            <button
                              onClick={() => { handleCheckin(group.id); setExpandedRescue({}); }}
                              className="btn-ghost text-xs px-3 py-1.5 flex-1"
                            >
                              Back today
                            </button>
                            <button
                              onClick={() => { handleCheckin(group.id); navigate("/log"); }}
                              className="btn-ghost text-xs px-3 py-1.5 flex-1"
                            >
                              Logging now
                            </button>
                            <button
                              onClick={() => { handleCheckin(group.id, "easy"); setExpandedRescue({}); }}
                              className="btn-ghost text-xs px-3 py-1.5 flex-1"
                            >
                              Need a reset
                            </button>
                          </div>
                        )}

                        {/* Feature 5: anchor connector between consecutive pairs */}
                        {showConnector && (
                          <div style={{
                            display: "flex", alignItems: "center",
                            height: 12, padding: "0 14px", opacity: 0.5,
                          }}>
                            <div style={{ width: 12, height: 1, background: "rgba(255,255,255,0.1)" }} />
                            <div style={{
                              width: 5, height: 5, borderRadius: "50%",
                              background: "rgba(var(--accent-rgb)/0.3)",
                              border: "1px solid rgba(var(--accent-rgb)/0.5)",
                            }} />
                            <div style={{
                              flex: 1, borderTop: "1px dashed rgba(255,255,255,0.08)",
                            }} />
                            <div style={{
                              width: 5, height: 5, borderRadius: "50%",
                              background: "rgba(var(--accent-rgb)/0.3)",
                              border: "1px solid rgba(var(--accent-rgb)/0.5)",
                            }} />
                            <div style={{ width: 12, height: 1, background: "rgba(255,255,255,0.1)" }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Feature 6: Privacy note — first visit only */}
                {!privacySeen && (
                  <button
                    onClick={dismissPrivacy}
                    style={{
                      width: "100%", textAlign: "left",
                      padding: "8px 14px",
                      borderTop: "1px solid rgba(255,255,255,0.04)",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "transparent", cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.2px" }}>
                      🔒 Only check-ins are shared. Never food.
                    </span>
                    <X size={10} className="text-text-muted" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
