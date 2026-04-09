import { useState, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { User, Target, Activity, Utensils, Scale, Save, Bell, BellOff, Crown, Zap, Sparkles, Copy, Share2, Gift, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { setupPushNotifications, unsubscribePush } from "../lib/push";
import { referralApi } from "../lib/api";

const COMMON_COUNTRIES = [
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "AE", name: "UAE" },
  { code: "SG", name: "Singapore" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "MY", name: "Malaysia" },
];

const OTHER_COUNTRIES = [
  { code: "AF", name: "Afghanistan" }, { code: "AR", name: "Argentina" },
  { code: "BD", name: "Bangladesh" }, { code: "BR", name: "Brazil" },
  { code: "CN", name: "China" }, { code: "EG", name: "Egypt" },
  { code: "FR", name: "France" }, { code: "GH", name: "Ghana" },
  { code: "ID", name: "Indonesia" }, { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" }, { code: "KE", name: "Kenya" },
  { code: "KR", name: "South Korea" }, { code: "LK", name: "Sri Lanka" },
  { code: "MX", name: "Mexico" }, { code: "NG", name: "Nigeria" },
  { code: "NL", name: "Netherlands" }, { code: "NP", name: "Nepal" },
  { code: "NZ", name: "New Zealand" }, { code: "PH", name: "Philippines" },
  { code: "PK", name: "Pakistan" }, { code: "PT", name: "Portugal" },
  { code: "QA", name: "Qatar" }, { code: "RU", name: "Russia" },
  { code: "SA", name: "Saudi Arabia" }, { code: "SE", name: "Sweden" },
  { code: "TH", name: "Thailand" }, { code: "TR", name: "Turkey" },
  { code: "TZ", name: "Tanzania" }, { code: "UA", name: "Ukraine" },
  { code: "VN", name: "Vietnam" }, { code: "ZA", name: "South Africa" },
  { code: "ZW", name: "Zimbabwe" },
];

const FESTIVAL_MODES = [
  {
    value: "off",
    icon: "🚫",
    label: "Off",
    sublabel: "No festival features",
  },
  {
    value: "awareness",
    icon: "👀",
    label: "Awareness",
    sublabel: "Festival banners, food suggestions, and festive UI — goals unchanged",
    recommended: true,
  },
  {
    value: "full",
    icon: "🎯",
    label: "Full Adjust",
    sublabel: "Auto-adjusts your calorie goal during festivals + recovery plans after",
  },
] as const;

const DIETARY_PREFS = [
  "Vegetarian",
  "Vegan",
  "Keto",
  "Paleo",
  "Gluten-free",
  "Dairy-free",
  "Low-carb",
  "High-protein",
];
const ACTIVITY_LEVELS = [
  { value: "sedentary", label: "Sedentary", desc: "Little or no exercise" },
  { value: "light", label: "Light", desc: "1-3 days/week" },
  { value: "moderate", label: "Moderate", desc: "3-5 days/week" },
  { value: "active", label: "Active", desc: "6-7 days/week" },
  {
    value: "very_active",
    label: "Very Active",
    desc: "Intense daily training",
  },
];

interface ReferralStats {
  referral_code: string;
  referral_count: number;
  total_pro_days_earned: number;
  is_practitioner: boolean;
}

export default function Profile() {
  const { user, updateUser } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [consentLoading, setConsentLoading] = useState(false);
  const [consentValue, setConsentValue] = useState(user?.practitioner_consent ?? true);

  useEffect(() => {
    if (!('Notification' in window)) return;
    setPushPermission(Notification.permission);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setPushSubscribed(!!sub))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    referralApi.stats().then((res) => setReferralStats(res.data)).catch(() => {});
  }, []);
  const [country, setCountry] = useState(user?.country || "IN");
  const [festivalMode, setFestivalMode] = useState<string>(user?.festival_mode || "awareness");
  const [festivalSaving, setFestivalSaving] = useState(false);

  const handleCountryChange = async (code: string) => {
    setCountry(code);
    try {
      await updateUser({ country: code });
    } catch {
      toast.error("Failed to save country");
    }
  };

  const handleConsentToggle = async () => {
    const next = !consentValue;
    setConsentValue(next);
    setConsentLoading(true);
    try {
      await updateUser({ practitioner_consent: next });
    } catch {
      setConsentValue(!next);
      toast.error("Failed to update data sharing preference");
    } finally {
      setConsentLoading(false);
    }
  };

  const handleModeChange = async (mode: string) => {
    if (festivalSaving) return;
    setFestivalMode(mode);
    setFestivalSaving(true);
    try {
      await updateUser({ festival_mode: mode });
    } catch {
      toast.error("Failed to save");
    } finally {
      setFestivalSaving(false);
    }
  };

  const [form, setForm] = useState({
    name: user?.name || "",
    age: user?.age?.toString() || "",
    weight_kg: user?.weight_kg?.toString() || "",
    height_cm: user?.height_cm?.toString() || "",
    gender: user?.gender || "male",
    activity_level: user?.activity_level || "moderate",
    dietary_preferences: user?.dietary_preferences || [],
    calorie_goal: user?.calorie_goal?.toString() || "",
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const togglePref = (pref: string) => {
    set(
      "dietary_preferences",
      form.dietary_preferences.includes(pref)
        ? form.dietary_preferences.filter((p: string) => p !== pref)
        : [...form.dietary_preferences, pref]
    );
  };

  const handleEnablePush = async () => {
    setPushLoading(true);
    const success = await setupPushNotifications();
    if (success) {
      setPushSubscribed(true);
      setPushPermission("granted");
      toast.success("Notifications enabled");
    } else {
      const current = 'Notification' in window ? Notification.permission : 'denied';
      setPushPermission(current as NotificationPermission);
      if (current === "denied") {
        toast.error("Notifications are blocked — enable them in your browser settings");
      } else {
        toast.error("Could not enable notifications. Try again after installing the app.");
      }
    }
    setPushLoading(false);
  };

  const handleDisablePush = async () => {
    setPushLoading(true);
    await unsubscribePush();
    setPushSubscribed(false);
    toast.success("Notifications disabled");
    setPushLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUser({
        name: form.name,
        age: form.age ? parseInt(form.age) : undefined,
        weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : undefined,
        height_cm: form.height_cm ? parseFloat(form.height_cm) : undefined,
        gender: form.gender,
        activity_level: form.activity_level,
        dietary_preferences: form.dietary_preferences,
        calorie_goal: form.calorie_goal
          ? parseInt(form.calorie_goal)
          : undefined,
      });
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const bmi =
    form.weight_kg && form.height_cm
      ? (
          parseFloat(form.weight_kg) /
          Math.pow(parseFloat(form.height_cm) / 100, 2)
        ).toFixed(1)
      : null;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-text-primary mb-1">Profile</h1>
      <p className="text-xs text-text-muted mb-6">
        Personalize your nutrition tracking
      </p>

      {/* Avatar row */}
      <div className="card p-5 mb-4 flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-primary/20 to-accent-soft/20 border border-accent-primary/20 flex items-center justify-center text-2xl font-bold text-accent-primary">
          {user?.name?.[0]?.toUpperCase() || "U"}
        </div>
        <div>
          <p className="font-semibold text-text-primary">{user?.name}</p>
          <p className="text-xs text-text-muted">{user?.email}</p>
          {user?.tdee && (
            <p className="text-xs text-accent-primary mt-1">
              TDEE: {Math.round(user.tdee)} kcal/day
            </p>
          )}
        </div>
        {bmi && (
          <div className="ml-auto text-right">
            <p className="text-2xl font-bold text-text-primary">{bmi}</p>
            <p className="text-xs text-text-muted">BMI</p>
          </div>
        )}
      </div>

      {/* Pro status card */}
      {user?.is_pro ? (
        <div
          className="card p-4 mb-4 flex items-center gap-3"
          style={{ borderColor: "rgba(167,139,250,0.3)", backgroundColor: "rgba(167,139,250,0.06)" }}
        >
          <Crown size={18} style={{ color: "#a78bfa", flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "#a78bfa" }}>Pro plan active</p>
            {user.pro_expires_at && (
              <p className="text-xs text-text-muted mt-0.5">
                {user.plan_type === "annual" ? "Annual" : "Monthly"} · Expires{" "}
                {new Date(user.pro_expires_at).toLocaleDateString("en-IN", {
                  day: "numeric", month: "long", year: "numeric",
                })}
              </p>
            )}
          </div>
          <a href="/upgrade" className="text-xs text-text-muted hover:text-text-secondary transition-colors">
            Manage
          </a>
        </div>
      ) : (
        <a
          href="/upgrade"
          className="card p-4 mb-4 flex items-center gap-3 hover:border-[rgba(163,230,53,0.3)] transition-all"
          style={{ textDecoration: "none" }}
        >
          <Zap size={18} style={{ color: "#a3e635", flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">Upgrade to Pro</p>
            <p className="text-xs text-text-muted mt-0.5">AI logging, meal suggestions, full insights · from ₹149/mo</p>
          </div>
          <span className="text-xs font-semibold" style={{ color: "#a3e635" }}>View →</span>
        </a>
      )}

      <div className="space-y-4">
        {/* Basic info */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <User size={15} className="text-text-muted" />
            <h3 className="text-sm font-medium text-text-secondary">Basic info</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Gender</label>
              <select
                className="input"
                value={form.gender}
                onChange={(e) => set("gender", e.target.value)}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="label">Age (years)</label>
              <input
                type="number"
                className="input"
                value={form.age}
                onChange={(e) => set("age", e.target.value)}
                placeholder="30"
              />
            </div>
          </div>
        </div>

        {/* Body metrics */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Scale size={15} className="text-text-muted" />
            <h3 className="text-sm font-medium text-text-secondary">Body metrics</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Weight (kg)</label>
              <input
                type="number"
                className="input"
                value={form.weight_kg}
                onChange={(e) => set("weight_kg", e.target.value)}
                placeholder="70"
              />
            </div>
            <div>
              <label className="label">Height (cm)</label>
              <input
                type="number"
                className="input"
                value={form.height_cm}
                onChange={(e) => set("height_cm", e.target.value)}
                placeholder="175"
              />
            </div>
          </div>
          {user?.bmr && (
            <div className="mt-3 flex gap-3">
              <div className="flex-1 bg-bg-elevated rounded-xl p-3 text-center">
                <p className="text-xs text-text-muted">BMR</p>
                <p className="text-lg font-bold text-text-secondary">
                  {Math.round(user.bmr)}
                </p>
                <p className="text-xs text-text-muted">kcal/day</p>
              </div>
              <div className="flex-1 bg-bg-elevated rounded-xl p-3 text-center">
                <p className="text-xs text-text-muted">TDEE</p>
                <p className="text-lg font-bold text-accent-primary">
                  {user.tdee ? Math.round(user.tdee) : "—"}
                </p>
                <p className="text-xs text-text-muted">kcal/day</p>
              </div>
            </div>
          )}
        </div>

        {/* Activity */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={15} className="text-text-muted" />
            <h3 className="text-sm font-medium text-text-secondary">
              Activity level
            </h3>
          </div>
          <div className="space-y-2">
            {ACTIVITY_LEVELS.map((al) => (
              <button
                key={al.value}
                onClick={() => set("activity_level", al.value)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all ${
                  form.activity_level === al.value
                    ? "bg-accent-primary/10 border border-accent-primary/20 text-accent-soft"
                    : "bg-bg-elevated border border-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                <span className="font-medium">{al.label}</span>
                <span className="text-xs text-text-muted">{al.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Calorie goal */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target size={15} className="text-text-muted" />
            <h3 className="text-sm font-medium text-text-secondary">
              Daily calorie goal
            </h3>
          </div>
          <input
            type="number"
            className="input"
            value={form.calorie_goal}
            onChange={(e) => set("calorie_goal", e.target.value)}
            placeholder={
              user?.tdee ? `Suggested: ${Math.round(user.tdee)}` : "2000"
            }
          />
          {user?.tdee && (
            <p className="text-xs text-text-muted mt-2">
              Your TDEE is ~{Math.round(user.tdee)} kcal. Leave blank to use
              this automatically.
            </p>
          )}
        </div>

        {/* Dietary preferences */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Utensils size={15} className="text-text-muted" />
            <h3 className="text-sm font-medium text-text-secondary">
              Dietary preferences
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {DIETARY_PREFS.map((pref) => {
              const active = form.dietary_preferences.includes(pref);
              return (
                <button
                  key={pref}
                  onClick={() => togglePref(pref)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    active
                      ? "bg-accent-primary/15 border-accent-primary/30 text-accent-soft"
                      : "bg-transparent border-bg-border text-text-muted hover:border-text-muted hover:text-text-secondary"
                  }`}
                >
                  {active && "✓ "}
                  {pref}
                </button>
              );
            })}
          </div>
        </div>

        {/* Push notifications */}
        {'Notification' in window && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Bell size={15} className="text-text-muted" />
              <h3 className="text-sm font-medium text-text-secondary">Push notifications</h3>
            </div>
            <div className="flex items-center justify-between">
              <div>
                {pushPermission === "denied" ? (
                  <p className="text-xs text-red-400">Blocked in browser settings</p>
                ) : pushSubscribed ? (
                  <p className="text-xs text-text-muted">Reminders and updates are enabled</p>
                ) : (
                  <p className="text-xs text-text-muted">Get meal reminders and streak alerts</p>
                )}
              </div>
              {pushPermission !== "denied" && (
                pushSubscribed ? (
                  <button
                    onClick={handleDisablePush}
                    disabled={pushLoading}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-bg-border text-text-muted hover:text-red-400 hover:border-red-400/30 transition-all"
                  >
                    <BellOff size={12} />
                    {pushLoading ? "..." : "Disable"}
                  </button>
                ) : (
                  <button
                    onClick={handleEnablePush}
                    disabled={pushLoading}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary hover:bg-accent-primary/20 transition-all"
                  >
                    <Bell size={12} />
                    {pushLoading ? "..." : "Enable"}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Festival Intelligence */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={15} style={{ color: "#f59e0b" }} />
            <h3 className="text-sm font-medium text-text-secondary">Festival Intelligence</h3>
          </div>

          {/* Country */}
          <div className="mb-4">
            <label className="label">Country</label>
            <select
              className="input"
              value={country}
              onChange={(e) => handleCountryChange(e.target.value)}
            >
              {COMMON_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
              <option disabled>──────────────</option>
              {OTHER_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
            <p className="text-xs text-text-muted mt-1.5">
              Helps us know which festivals matter to you.
            </p>
          </div>

          {/* Festival mode cards */}
          <label className="label mb-2">Festival mode</label>
          <div className="grid grid-cols-3 gap-2">
            {FESTIVAL_MODES.map((mode) => {
              const active = festivalMode === mode.value;
              return (
                <button
                  key={mode.value}
                  onClick={() => handleModeChange(mode.value)}
                  disabled={festivalSaving}
                  className="card-elevated p-3 flex flex-col items-center gap-1.5 rounded-xl border transition-all text-center"
                  style={{
                    borderColor: active ? "rgba(163,230,53,0.5)" : "var(--bg-border)",
                    backgroundColor: active ? "rgba(163,230,53,0.05)" : undefined,
                    opacity: festivalSaving ? 0.6 : 1,
                  }}
                >
                  <span className="text-xl leading-none">{mode.icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-text-primary leading-tight">
                      {mode.label}
                    </p>
                    {"recommended" in mode && mode.recommended && (
                      <span
                        className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: "rgba(163,230,53,0.15)", color: "#a3e635" }}
                      >
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-text-muted leading-tight">
                    {mode.sublabel}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Refer a Friend */}
        {referralStats && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Gift size={15} style={{ color: "#a3e635" }} />
              <h3 className="text-sm font-medium text-text-secondary">Refer a Friend</h3>
            </div>
            <p className="text-xs text-text-muted mb-4">
              Share your code — you both get <span className="text-accent-primary font-semibold">7 days of Pro free</span> when they sign up. You can earn up to 35 days total (5 referrals).
            </p>

            {/* Code row */}
            <div className="flex items-center gap-2 mb-3">
              <div
                className="flex-1 bg-bg-elevated rounded-xl px-4 py-3 font-mono text-xl font-bold tracking-widest text-text-primary text-center"
                style={{ letterSpacing: "0.25em" }}
              >
                {referralStats.referral_code}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(referralStats.referral_code);
                  toast.success("Code copied!");
                }}
                className="flex items-center gap-1.5 px-3 py-3 rounded-xl border border-bg-border text-text-muted hover:text-text-primary hover:border-text-muted transition-all"
              >
                <Copy size={15} />
              </button>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-1.5 text-xs text-text-muted mb-4">
              <span className="text-text-primary font-semibold">{referralStats.referral_count}</span>
              {referralStats.referral_count === 1 ? "friend" : "friends"} referred
              <span className="text-bg-border mx-1">·</span>
              <span className="text-accent-primary font-semibold">{referralStats.total_pro_days_earned}</span>
              days of Pro earned
            </div>

            {/* Share button */}
            <button
              onClick={async () => {
                const code = referralStats.referral_code;
                const msg = `I'm tracking my calories with Qelvi — it actually understands Indian food! Use my code ${code} when you sign up and we both get 7 days of Pro free. https://qelvi.com/register?ref=${code}`;
                if (navigator.share) {
                  try {
                    await navigator.share({ text: msg });
                  } catch { /* user cancelled */ }
                } else {
                  await navigator.clipboard.writeText(msg);
                  toast.success("Share message copied to clipboard!");
                }
              }}
              className="btn-ghost w-full flex items-center justify-center gap-2 py-2.5 text-sm"
            >
              <Share2 size={14} />
              Share with friends
            </button>
          </div>
        )}

        {/* Data Sharing — shown only when linked to a practitioner */}
        {user?.practitioner_id && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck size={15} style={{ color: "#38bdf8" }} />
              <h3 className="text-sm font-medium text-text-secondary">Data Sharing</h3>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary">
                  Your nutrition data is shared with{" "}
                  <span className="font-semibold">
                    {user.practitioner_name || "your dietician"}
                  </span>.
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {consentValue
                    ? "Your dietician can view your meal logs and reports to give you better dietary advice."
                    : "Your dietician will no longer be able to see your meal logs or reports. You can re-enable this at any time."}
                </p>
              </div>

              {/* Toggle */}
              <button
                onClick={handleConsentToggle}
                disabled={consentLoading}
                className="flex-shrink-0 relative w-11 h-6 rounded-full transition-all duration-200 focus:outline-none"
                style={{
                  backgroundColor: consentValue ? "#38bdf8" : "#374151",
                  opacity: consentLoading ? 0.6 : 1,
                }}
                aria-label={consentValue ? "Disable data sharing" : "Enable data sharing"}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200"
                  style={{ left: consentValue ? "calc(100% - 1.375rem)" : "0.125rem" }}
                />
              </button>
            </div>

            {!consentValue && (
              <p
                className="text-xs mt-3 px-3 py-2 rounded-lg"
                style={{ backgroundColor: "rgba(248,113,113,0.08)", color: "#f87171" }}
              >
                Data sharing is off. Your dietician's dashboard shows "Access Revoked" for your account.
              </p>
            )}
          </div>
        )}

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3"
        >
          <Save size={15} />
          {saving ? "Saving..." : "Save profile"}
        </button>
      </div>
    </div>
  );
}
