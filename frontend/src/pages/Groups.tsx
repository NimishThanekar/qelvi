import { useState, useEffect } from "react";
import { Plus, Users, Copy, Check } from "lucide-react";
import { groupsApi } from "../lib/api";
import type { Group } from "../types";
import toast from "react-hot-toast";

// Pulsing dot for checked-in members
function StatusDot({ active }: { active: boolean }) {
  return (
    <span className="relative flex w-2.5 h-2.5">
      {active && (
        <span className="absolute inset-0 rounded-full bg-green-400 animate-gentle-pulse" />
      )}
      <span
        className={`relative rounded-full w-full h-full border-2 border-bg-card ${
          active ? "bg-green-400" : "bg-bg-border"
        }`}
      />
    </span>
  );
}

export default function Groups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchGroups = async () => {
    try {
      const res = await groupsApi.my();
      setGroups(res.data);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreate = async () => {
    if (!groupName.trim()) return;
    setSaving(true);
    try {
      await groupsApi.create(groupName.trim());
      toast.success("Group created!");
      setShowCreate(false);
      setGroupName("");
      fetchGroups();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to create group");
    } finally {
      setSaving(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setSaving(true);
    try {
      await groupsApi.join(joinCode.trim().toUpperCase());
      toast.success("Joined group!");
      setShowJoin(false);
      setJoinCode("");
      fetchGroups();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Invalid code");
    } finally {
      setSaving(false);
    }
  };

  const handleCheckin = async (groupId: string) => {
    try {
      await groupsApi.checkin(groupId);
      toast.success("Checked in! ✓");
      fetchGroups();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to check in");
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
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
            New group
          </button>
        </div>
      </div>

      {/* Create form — slides down on appear */}
      {showCreate && (
        <div className="card p-4 mb-4 animate-slide-up">
          <p className="text-sm font-medium text-text-primary mb-3">Create a group</p>
          <input
            className="input text-sm mb-3"
            placeholder="Group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving || !groupName.trim()}
              className="btn-primary text-xs px-4 py-2 active:scale-95 transition-transform"
            >
              {saving ? "Creating..." : "Create"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="btn-ghost text-xs px-4 py-2 active:scale-95 transition-transform"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Join form */}
      {showJoin && (
        <div className="card p-4 mb-4 animate-slide-up">
          <p className="text-sm font-medium text-text-primary mb-3">Join a group</p>
          <input
            className="input text-sm mb-3 uppercase tracking-widest font-mono"
            placeholder="Enter 6-character code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            maxLength={6}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleJoin}
              disabled={saving || joinCode.length !== 6}
              className="btn-primary text-xs px-4 py-2 active:scale-95 transition-transform"
            >
              {saving ? "Joining..." : "Join"}
            </button>
            <button
              onClick={() => setShowJoin(false)}
              className="btn-ghost text-xs px-4 py-2 active:scale-95 transition-transform"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Groups list */}
      {loading ? (
        /* Skeleton shimmer */
        <div className="space-y-4 animate-fade-in">
          {[1, 2].map((i) => (
            <div key={i} className="card p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-bg-elevated skeleton" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 rounded-lg bg-bg-elevated skeleton" />
                  <div className="h-2.5 w-20 rounded-lg bg-bg-elevated skeleton" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        /* Empty state — floating icon */
        <div className="card p-10 flex flex-col items-center gap-3 text-center animate-scale-in">
          <div
            className="w-16 h-16 rounded-2xl bg-bg-elevated flex items-center justify-center text-3xl animate-float"
            style={{ animationDelay: "0.1s" }}
          >
            👥
          </div>
          <p className="text-sm font-medium text-text-primary mt-1">No circles yet</p>
          <p className="text-xs text-text-muted max-w-xs leading-relaxed">
            Create a private circle with up to 4 friends to stay accountable together.
            No scores, no pressure — just a daily check-in.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary text-xs px-4 py-2 active:scale-95 transition-transform"
            >
              Create circle
            </button>
            <button
              onClick={() => setShowJoin(true)}
              className="btn-ghost text-xs px-4 py-2 active:scale-95 transition-transform"
            >
              Join with code
            </button>
          </div>
        </div>
      ) : (
        /* Group cards — stagger entrance */
        <div className="space-y-4 stagger">
          {groups.map((group) => {
            const meCheckedIn = group.members.find((m) => m.is_me)?.checked_in_today ?? false;
            const checkedInCount = group.members.filter((m) => m.checked_in_today).length;
            const allCheckedIn = checkedInCount === group.members.length && group.members.length > 0;

            return (
              <div key={group.id} className="card card-glow">
                {/* Card header */}
                <div className="flex items-center justify-between p-4 border-b border-bg-elevated">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform duration-200"
                      style={{ backgroundColor: "rgba(var(--accent-rgb) / 0.1)" }}
                    >
                      <Users size={15} className="text-accent-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{group.name}</p>
                      <p className="text-xs text-text-muted">
                        {allCheckedIn
                          ? "✨ Everyone logged today"
                          : `${checkedInCount}/${group.members.length} logged today`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Invite code with shimmer hover */}
                    <button
                      onClick={() => copyCode(group.code)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-elevated hover:bg-bg-border text-xs text-text-muted hover:text-text-primary transition-all shimmer-hover active:scale-95"
                      title="Copy invite code"
                    >
                      {copiedCode === group.code
                        ? <Check size={12} className="text-green-400" />
                        : <Copy size={12} />}
                      <span className="font-mono tracking-widest">{group.code}</span>
                    </button>

                    {/* Check-in / Logged state */}
                    {!meCheckedIn ? (
                      <button
                        onClick={() => handleCheckin(group.id)}
                        className="btn-primary text-xs px-3 py-1.5 active:scale-90 transition-transform"
                      >
                        Check in
                      </button>
                    ) : (
                      <span
                        className="flex items-center gap-1.5 text-xs text-green-400 px-2.5 py-1.5 rounded-lg animate-pop-in"
                        style={{
                          backgroundColor: "rgba(74, 222, 128, 0.1)",
                          boxShadow: "0 0 14px rgba(74, 222, 128, 0.12)",
                        }}
                      >
                        <Check size={12} />
                        Logged
                      </span>
                    )}
                  </div>
                </div>

                {/* Members — spring stagger */}
                <div className="p-3 flex flex-col gap-2.5 stagger-pop">
                  {group.members.map((member) => (
                    <div key={member.user_id} className="flex items-center gap-3">
                      {/* Avatar + status dot */}
                      <div className="relative flex-shrink-0">
                        <div
                          className="w-7 h-7 rounded-full bg-bg-elevated border border-bg-border flex items-center justify-center text-xs font-semibold text-text-secondary"
                          style={member.checked_in_today ? {
                            borderColor: "rgba(74, 222, 128, 0.3)",
                            boxShadow: "0 0 0 2px rgba(74, 222, 128, 0.08)",
                          } : {}}
                        >
                          {member.name[0]?.toUpperCase()}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5">
                          <StatusDot active={member.checked_in_today} />
                        </span>
                      </div>

                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-text-primary">
                          {member.name}
                          {member.is_me && (
                            <span className="text-text-muted text-xs"> (you)</span>
                          )}
                        </span>
                      </div>

                      {/* Status label */}
                      <span
                        className="text-xs flex-shrink-0 transition-colors duration-300"
                        style={{ color: member.checked_in_today ? "rgba(74,222,128,0.85)" : "var(--text-muted)" }}
                      >
                        {member.checked_in_today ? "Logged ✓" : "Not yet"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
