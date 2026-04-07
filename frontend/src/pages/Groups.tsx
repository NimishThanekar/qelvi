import { useState, useEffect } from "react";
import { Copy, Check, Users, Flame, Lock } from "lucide-react";
import { groupsApi } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import type { Buddy } from "../types";
import toast from "react-hot-toast";

export default function Groups() {
  const { user } = useAuthStore();
  const isPro = user?.is_pro;
  const [buddy, setBuddy] = useState<Buddy | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchBuddy = async () => {
    try {
      const res = await groupsApi.my();
      const groups = res.data as Buddy[];
      setBuddy(groups.length > 0 ? groups[0] : null);
    } catch {
      setBuddy(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBuddy();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await groupsApi.create();
      await fetchBuddy();
      toast.success("Buddy group created — share your code!");
    } catch (err: any) {
      if (err?.response?.status === 403) {
        window.location.href = "/upgrade";
        return;
      }
      toast.error(err?.response?.data?.detail || "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      await groupsApi.join(joinCode.trim().toUpperCase());
      await fetchBuddy();
      toast.success("Joined your buddy!");
      setJoinCode("");
    } catch (err: any) {
      if (err?.response?.status === 403) {
        window.location.href = "/upgrade";
        return;
      }
      toast.error(err?.response?.data?.detail || "Invalid code");
    } finally {
      setJoining(false);
    }
  };

  const handleCheckin = async () => {
    if (!buddy) return;
    setCheckingIn(true);
    try {
      await groupsApi.checkin(buddy.id);
      await fetchBuddy();
      toast.success("Checked in!");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Check-in failed");
    } finally {
      setCheckingIn(false);
    }
  };

  const copyCode = () => {
    if (!buddy) return;
    navigator.clipboard.writeText(buddy.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-lg mx-auto">
        <div className="card p-6 animate-pulse">
          <div className="h-4 w-24 bg-bg-elevated rounded mb-4" />
          <div className="h-10 w-full bg-bg-elevated rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Buddy</h1>
        <p className="text-xs text-text-muted mt-0.5">Stay accountable with a friend</p>
      </div>

      {buddy ? (
        <div className="space-y-3">
          {/* Streak card */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Flame size={16} style={{ color: "#fb923c" }} />
                <span className="text-sm font-medium text-text-primary">Streak</span>
              </div>
              <span className="text-2xl font-bold" style={{ color: "#fb923c" }}>
                {buddy.streak}d
              </span>
            </div>

            {/* Buddy status */}
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-xl">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: "rgba(59,123,255,0.15)", color: "#3B7BFF" }}
                  >
                    Y
                  </div>
                  <span className="text-sm text-text-primary">You</span>
                </div>
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={
                    buddy.my_checked_in_today
                      ? { backgroundColor: "rgba(74,222,128,0.15)", color: "#4ade80" }
                      : { backgroundColor: "var(--bg-border)", color: "var(--text-muted)" }
                  }
                >
                  {buddy.my_checked_in_today ? "Checked in" : "Not checked in"}
                </span>
              </div>

              {buddy.buddy_name ? (
                <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-xl">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: "rgba(167,139,250,0.15)", color: "#a78bfa" }}
                    >
                      {buddy.buddy_name[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm text-text-primary">{buddy.buddy_name}</span>
                  </div>
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={
                      buddy.buddy_checked_in_today
                        ? { backgroundColor: "rgba(74,222,128,0.15)", color: "#4ade80" }
                        : { backgroundColor: "var(--bg-border)", color: "var(--text-muted)" }
                    }
                  >
                    {buddy.buddy_checked_in_today ? "Checked in" : "Not yet"}
                  </span>
                </div>
              ) : (
                <div className="p-3 bg-bg-elevated rounded-xl text-center">
                  <p className="text-xs text-text-muted">Waiting for your buddy to join…</p>
                  <p className="text-xs text-text-muted mt-1">Share your invite code, or enter theirs below</p>
                </div>
              )}
            </div>

            {/* Check-in button */}
            {!buddy.my_checked_in_today && (
              <button
                onClick={handleCheckin}
                disabled={checkingIn}
                className="btn-primary w-full mt-4"
              >
                {checkingIn ? "Checking in…" : "Check in today"}
              </button>
            )}
          </div>

          {/* Join with buddy's code — shown when waiting for buddy */}
          {!buddy.buddy_name && (
            <div className="card p-5">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
                Enter your buddy's code
              </p>
              <div className="flex gap-2">
                <input
                  className="input flex-1 uppercase tracking-widest"
                  placeholder="ENTER CODE"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={8}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                />
                <button
                  onClick={handleJoin}
                  disabled={joining || !joinCode.trim()}
                  className="btn-primary px-5"
                >
                  {joining ? "…" : "Join"}
                </button>
              </div>
            </div>
          )}

          {/* Invite code */}
          <div className="card p-5">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-3">Invite code</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-bg-elevated rounded-xl px-4 py-3 text-center">
                <span className="text-lg font-bold tracking-widest text-text-primary font-mono">
                  {buddy.code}
                </span>
              </div>
              <button
                onClick={copyCode}
                className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-bg-border text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-all text-sm"
              >
                {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-text-muted mt-2">Share this code with your buddy</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* No buddy yet */}
          <div className="card p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-bg-elevated flex items-center justify-center mx-auto mb-4">
              <Users size={22} className="text-text-muted" />
            </div>
            <p className="text-sm font-medium text-text-primary mb-1">No buddy yet</p>
            <p className="text-xs text-text-muted">Pair with a friend to stay accountable together</p>
          </div>

          {/* Create new */}
          <div className="card p-5">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
              Start a new buddy pair
            </p>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="btn-primary w-full"
            >
              {creating ? "Creating…" : "Create buddy group"}
            </button>
          </div>

          {/* Join existing */}
          <div className="card p-5">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
              Join with invite code
            </p>
            <div className="flex gap-2">
              <input
                className="input flex-1 uppercase tracking-widest"
                placeholder="ENTER CODE"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={8}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              />
              <button
                onClick={handleJoin}
                disabled={joining || !joinCode.trim()}
                className="btn-primary px-5"
              >
                {joining ? "…" : "Join"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
