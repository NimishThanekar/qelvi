import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { practitionerApi } from "../lib/api";
import { Users, AlertTriangle, TrendingUp, Activity, Search, ChevronUp, ChevronDown, UserPlus, X, Copy, MessageCircle } from "lucide-react";
import toast from "react-hot-toast";

interface OverviewData {
  total_patients: number;
  active_patients: number;
  inactive_patients: number;
  avg_adherence_rate: number;
  patients_needing_attention: AttentionEntry[];
  top_performing_patients: AttentionEntry[];
}

interface AttentionEntry {
  patient_id: string;
  name: string;
  adherence_rate: number;
  days_since_last_log: number | null;
}

interface Patient {
  patient_id: string;
  name: string;
  email: string;
  last_active: string | null;
  days_since_last_log: number | null;
  is_active: boolean;
  avg_calories_30d: number | null;
  calorie_goal: number | null;
  adherence_rate: number;
  current_streak: number;
}

type SortKey = "last_active" | "adherence_rate" | "avg_calories_30d";
type SortDir = "asc" | "desc";

function relativeTime(days: number | null): string {
  if (days === null) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function StatusDot({ days }: { days: number | null }) {
  const color =
    days === null || days > 7
      ? "#f87171"
      : days >= 3
      ? "#fbbf24"
      : "#a3e635";
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
}

function alertIssue(p: AttentionEntry): string {
  if (p.days_since_last_log !== null && p.days_since_last_log > 10) {
    return `Hasn't logged in ${p.days_since_last_log} days`;
  }
  if (p.adherence_rate < 25) {
    return `Adherence at ${p.adherence_rate}% — very low engagement`;
  }
  if (p.adherence_rate < 40) {
    return `Adherence at ${p.adherence_rate}% — consistently low`;
  }
  if (p.days_since_last_log !== null && p.days_since_last_log > 5) {
    return `Silent for ${p.days_since_last_log} days`;
  }
  return `Needs check-in`;
}

function isCritical(p: AttentionEntry): boolean {
  return (
    (p.days_since_last_log !== null && p.days_since_last_log >= 10) ||
    p.adherence_rate < 25
  );
}

export default function PractitionerDashboard() {
  const { user, refreshUser } = useAuthStore();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("last_active");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    // Refresh from server first so we don't redirect based on stale localStorage data.
    refreshUser().then(() => {
      // After refresh, re-read directly from the store via useAuthStore.getState()
      // because the `user` closure value here is the pre-refresh snapshot.
      const freshUser = useAuthStore.getState().user;
      if (!freshUser?.is_practitioner) {
        navigate("/dashboard");
        return;
      }
      Promise.all([practitionerApi.overview(), practitionerApi.patients()])
        .then(([ov, pt]) => {
          setOverview(ov.data);
          setPatients(pt.data);
        })
        .finally(() => setLoading(false));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "last_active" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      sortDir === "asc" ? (
        <ChevronUp size={12} />
      ) : (
        <ChevronDown size={12} />
      )
    ) : null;

  const filtered = patients
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === "last_active") {
        av = a.days_since_last_log ?? 9999;
        bv = b.days_since_last_log ?? 9999;
      } else if (sortKey === "adherence_rate") {
        av = a.adherence_rate;
        bv = b.adherence_rate;
      } else {
        av = a.avg_calories_30d ?? 0;
        bv = b.avg_calories_30d ?? 0;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="h-8 w-48 bg-bg-elevated rounded-lg animate-pulse mb-6" />
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4 h-20 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const code = user?.referral_code || "";
  const waMessage = `Hi! I'd like you to track your meals using Qelvi so I can monitor your nutrition. Please download the app and use my code ${code} when signing up. This will let me see your food logs to give you better dietary advice. Download: https://qelvi.com/register?ref=${code}`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Invite Patient Modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setInviteOpen(false)} />
          <div
            className="relative w-full max-w-md mx-4 mb-4 md:mb-0 rounded-2xl p-6"
            style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--bg-border)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <UserPlus size={16} className="text-accent-primary" />
                <h2 className="text-base font-semibold text-text-primary">Invite Patient</h2>
              </div>
              <button
                onClick={() => setInviteOpen(false)}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Referral code */}
            <p className="text-xs text-text-muted mb-2">Your invite code</p>
            <div className="flex items-center gap-2 mb-5">
              <div
                className="flex-1 bg-bg-elevated rounded-xl px-4 py-3 font-mono text-xl font-bold text-text-primary text-center"
                style={{ letterSpacing: "0.25em" }}
              >
                {code || "—"}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(code);
                  toast.success("Code copied!");
                }}
                className="p-3 rounded-xl border border-bg-border text-text-muted hover:text-text-primary hover:border-text-muted transition-all"
              >
                <Copy size={15} />
              </button>
            </div>

            {/* Pre-written message */}
            <p className="text-xs text-text-muted mb-2">Message for your patient</p>
            <div
              className="text-xs text-text-secondary rounded-xl p-3 mb-5 leading-relaxed"
              style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
            >
              {waMessage}
            </div>

            {/* Action buttons */}
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold mb-3 transition-all hover:opacity-90"
              style={{ backgroundColor: "#25D366", color: "#fff" }}
            >
              <MessageCircle size={15} />
              Share via WhatsApp
            </a>
            <button
              onClick={() => {
                navigator.clipboard.writeText(waMessage);
                toast.success("Message copied to clipboard!");
              }}
              className="btn-ghost w-full flex items-center justify-center gap-2 py-2.5 text-sm"
            >
              <Copy size={13} />
              Copy message
            </button>

            <p className="text-[11px] text-text-muted text-center mt-4 leading-snug">
              When your patient signs up with this code, their nutrition data will be visible on your dashboard.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <Users size={20} className="text-accent-primary" />
          <h1 className="text-xl font-semibold text-text-primary">Patient Dashboard</h1>
        </div>
        {/* Desktop invite button */}
        <button
          onClick={() => setInviteOpen(true)}
          className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, rgba(163,230,53,0.12) 0%, rgba(59,123,255,0.12) 100%)",
            border: "1px solid rgba(163,230,53,0.3)",
            color: "#a3e635",
          }}
        >
          <UserPlus size={14} />
          Invite Patient
        </button>
      </div>
      <p className="text-xs text-text-muted mb-6">
        {overview?.total_patients ?? 0} patients · {overview?.active_patients ?? 0} active this week
      </p>

      {/* Mobile FAB */}
      <button
        onClick={() => setInviteOpen(true)}
        className="md:hidden fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all hover:opacity-90"
        style={{ backgroundColor: "#a3e635", color: "#000" }}
        aria-label="Invite patient"
      >
        <UserPlus size={22} />
      </button>

      {/* Overview stat cards */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card p-4">
            <p className="text-xs text-text-muted mb-1">Total Patients</p>
            <p className="text-2xl font-bold text-text-primary">{overview.total_patients}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-text-muted mb-1">Active (7d)</p>
            <p className="text-2xl font-bold" style={{ color: "#a3e635" }}>{overview.active_patients}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-text-muted mb-1">Avg Adherence</p>
            <p
              className="text-2xl font-bold"
              style={{
                color:
                  overview.avg_adherence_rate >= 70
                    ? "#a3e635"
                    : overview.avg_adherence_rate >= 40
                    ? "#fbbf24"
                    : "#f87171",
              }}
            >
              {overview.avg_adherence_rate}%
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-text-muted mb-1">Needs Attention</p>
            <p
              className="text-2xl font-bold"
              style={{ color: overview.patients_needing_attention.length > 0 ? "#fb923c" : "#a3e635" }}
            >
              {overview.patients_needing_attention.length}
            </p>
          </div>
        </div>
      )}

      {/* Attention alerts */}
      {overview && overview.patients_needing_attention.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} style={{ color: "#fb923c" }} />
            <h2 className="text-sm font-semibold text-text-secondary">Needs Attention</h2>
          </div>
          <div className="space-y-2">
            {overview.patients_needing_attention.map((p) => {
              const critical = isCritical(p);
              return (
                <div
                  key={p.patient_id}
                  className="card p-4 flex items-center gap-4"
                  style={{
                    borderLeftWidth: 3,
                    borderLeftColor: critical ? "#f87171" : "#fb923c",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary">{p.name}</p>
                    <p className="text-xs text-text-muted mt-0.5">{alertIssue(p)}</p>
                  </div>
                  <button
                    onClick={() => navigate(`/practitioner/patients/${p.patient_id}`)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-bg-border text-text-muted hover:text-text-primary hover:border-text-muted transition-all flex-shrink-0"
                  >
                    View Details
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Patient list */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              className="input pl-8 text-sm"
              placeholder="Search patients…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* Sort buttons — desktop only */}
          <div className="hidden md:flex items-center gap-1.5 text-xs text-text-muted">
            <span>Sort:</span>
            {(
              [
                ["last_active", "Last Active"],
                ["adherence_rate", "Adherence"],
                ["avg_calories_30d", "Avg Cal"],
              ] as [SortKey, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => toggleSort(k)}
                className={`flex items-center gap-0.5 px-2 py-1 rounded-lg border transition-all ${
                  sortKey === k
                    ? "border-accent-primary/30 text-accent-primary bg-accent-primary/5"
                    : "border-bg-border text-text-muted hover:text-text-secondary"
                }`}
              >
                {label}
                <SortIcon k={k} />
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-8">No patients found</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bg-border">
                    <th className="text-left text-xs text-text-muted font-medium pb-2 pr-4">Name</th>
                    <th className="text-left text-xs text-text-muted font-medium pb-2 pr-4">Last Active</th>
                    <th className="text-right text-xs text-text-muted font-medium pb-2 pr-4">Streak</th>
                    <th className="text-right text-xs text-text-muted font-medium pb-2 pr-4">Avg Cal (30d)</th>
                    <th className="text-right text-xs text-text-muted font-medium pb-2 pr-4">Goal</th>
                    <th className="text-right text-xs text-text-muted font-medium pb-2 pr-4">Adherence</th>
                    <th className="text-center text-xs text-text-muted font-medium pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const adherenceColor =
                      p.adherence_rate >= 70
                        ? "#a3e635"
                        : p.adherence_rate >= 40
                        ? "#fbbf24"
                        : "#f87171";
                    return (
                      <tr
                        key={p.patient_id}
                        onClick={() => navigate(`/practitioner/patients/${p.patient_id}`)}
                        className="border-b border-bg-border/50 hover:bg-bg-elevated cursor-pointer transition-colors"
                      >
                        <td className="py-3 pr-4">
                          <div>
                            <p className="font-medium text-text-primary">{p.name}</p>
                            <p className="text-xs text-text-muted">{p.email}</p>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-text-secondary text-xs">
                          {relativeTime(p.days_since_last_log)}
                        </td>
                        <td className="py-3 pr-4 text-right text-text-secondary text-xs">
                          {p.current_streak}d
                        </td>
                        <td className="py-3 pr-4 text-right text-text-secondary text-xs">
                          {p.avg_calories_30d ? Math.round(p.avg_calories_30d) : "—"}
                        </td>
                        <td className="py-3 pr-4 text-right text-text-muted text-xs">
                          {p.calorie_goal ?? "—"}
                        </td>
                        <td className="py-3 pr-4 text-right text-xs font-semibold" style={{ color: adherenceColor }}>
                          {p.adherence_rate}%
                        </td>
                        <td className="py-3 text-center">
                          <StatusDot days={p.days_since_last_log} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filtered.map((p) => {
                const adherenceColor =
                  p.adherence_rate >= 70
                    ? "#a3e635"
                    : p.adherence_rate >= 40
                    ? "#fbbf24"
                    : "#f87171";
                return (
                  <div
                    key={p.patient_id}
                    onClick={() => navigate(`/practitioner/patients/${p.patient_id}`)}
                    className="bg-bg-elevated rounded-xl p-3.5 cursor-pointer hover:bg-bg-elevated/80 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <StatusDot days={p.days_since_last_log} />
                          <p className="font-medium text-sm text-text-primary truncate">{p.name}</p>
                        </div>
                        <p className="text-xs text-text-muted mt-0.5 ml-4">
                          {relativeTime(p.days_since_last_log)}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold" style={{ color: adherenceColor }}>
                          {p.adherence_rate}%
                        </p>
                        <p className="text-xs text-text-muted">adherence</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Top performers */}
      {overview && overview.top_performing_patients.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} style={{ color: "#a3e635" }} />
            <h2 className="text-sm font-semibold text-text-secondary">Top Performers</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {overview.top_performing_patients.map((p) => (
              <button
                key={p.patient_id}
                onClick={() => navigate(`/practitioner/patients/${p.patient_id}`)}
                className="card-elevated px-3 py-2 rounded-xl flex items-center gap-2 hover:border-accent-primary/30 transition-all"
              >
                <Activity size={12} style={{ color: "#a3e635" }} />
                <span className="text-xs text-text-primary">{p.name}</span>
                <span className="text-xs font-semibold" style={{ color: "#a3e635" }}>
                  {p.adherence_rate}%
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
